import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  emailSchema,
  parseAttributeValue,
  type AttributeTypeValue,
  type AttributeValue,
} from "@/lib/contacts/common";
import {
  EMAIL_TARGET,
  FIRST_DATA_ROW_NUMBER,
  FIRSTNAME_TARGET,
  LASTNAME_TARGET,
  MAX_CELL_CHARS,
  MAX_CHUNK_ROWS,
  MAX_IMPORT_ROWS,
  MAX_NAME_CHARS,
  MAX_STORED_PROBLEMS,
} from "@/lib/contacts/import-limits";

// ─────────────────────────────────────────────────────────────────────────────
// CSV import: the server side.
//
// How an import works:
//   1. The browser reads the CSV itself (papaparse) and calls startImport.
//   2. It sends the rows in chunks of ~500 to importChunk, one after another.
//   3. It calls finishImport (or failImport if something went wrong).
//
// Every function here takes a `workspaceId`. ONLY pass the id returned by
// requireActiveWorkspace() — never an id that came from the browser. Every
// query below filters by it, which is what keeps workspaces apart.
//
// Everything the browser sends (rows, mapping, ids) is untrusted: we
// re-validate each value here and look attribute types up in the database.
//
// Duplicates: the same email twice in ONE chunk → the last row wins. The same
// email in an EARLIER chunk → that contact already exists by the time the
// later chunk arrives, so the later row simply counts as "updated" (or
// "skipped" when the user chose "Skip them"). Either way every row lands in
// exactly one bucket, so created + updated + skipped + invalid = total rows.
// ─────────────────────────────────────────────────────────────────────────────

/** A problem with one row (row = spreadsheet row number), or with the whole import (row = null). */
export type ImportProblem = { row: number | null; reason: string };

/** A user-facing error: its message is safe to show in the UI. */
export class ImportError extends Error {}

/** Imports still PROCESSING after this long were abandoned (tab closed etc). */
const STALE_AFTER_MS = 60 * 60 * 1000;

// ─── Input schemas (the shapes the browser must send) ───────────────────────

const idSchema = z.string().trim().min(1).max(100);

export const startImportSchema = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1, "File name is missing.")
      // Keep just "contacts.csv" if a browser ever sends a full path.
      .transform((name) => name.split(/[\\/]/).pop()!.slice(0, 255)),
    totalRows: z
      .int()
      .min(1, "The file has no rows to import.")
      .max(MAX_IMPORT_ROWS, `A file can have at most ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows.`),
    listId: idSchema.optional(),
    newListName: z
      .string()
      .trim()
      .min(1, "Give the new list a name.")
      .max(100, "List names can be at most 100 characters.")
      .optional(),
  })
  .refine((v) => !(v.listId && v.newListName), "Choose an existing list OR a new list, not both.");

export type StartImportInput = z.input<typeof startImportSchema>;

export const importChunkSchema = z.object({
  importId: idSchema,
  /** Index (0-based) of this chunk's first row within the whole file. */
  rowOffset: z.int().min(0).max(MAX_IMPORT_ROWS),
  /** Each row lists the cells of the mapped columns, in `mapping` order. */
  rows: z
    .array(z.array(z.string().max(MAX_CELL_CHARS)).max(300))
    .min(1)
    .max(MAX_CHUNK_ROWS),
  /** What each cell is: "EMAIL", "FIRSTNAME", "LASTNAME" or a custom attribute key. */
  mapping: z.array(z.string().trim().min(1).max(40)).min(1).max(300),
  updateExisting: z.boolean(),
});

export type ImportChunkInput = z.input<typeof importChunkSchema>;

export type ChunkResult = {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  /** Problems found in this chunk (at most MAX_STORED_PROBLEMS). */
  problems: ImportProblem[];
};

// ─── 1. Start ───────────────────────────────────────────────────────────────

export async function startImportForWorkspace(
  workspaceId: string,
  input: StartImportInput,
): Promise<{ importId: string; listId: string | null }> {
  const data = parseOrThrow(startImportSchema, input);

  // Tidy up: imports someone abandoned an hour ago will never finish.
  await db.contactImport.updateMany({
    where: {
      workspaceId,
      status: "PROCESSING",
      createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    data: { status: "FAILED", finishedAt: new Date() },
  });

  // The list id comes from the browser: make sure it is one of OUR lists.
  if (data.listId) {
    const list = await db.contactList.findFirst({
      where: { id: data.listId, workspaceId },
      select: { id: true },
    });
    if (!list) throw new ImportError("That list no longer exists. Please pick another one.");
  }

  const listNameTaken = () =>
    new ImportError(
      `A list called "${data.newListName}" already exists. Choose it from "Existing list" instead.`,
    );
  if (data.newListName) {
    // List names are unique per workspace. Check first for a clear message;
    // the P2002 catch below covers two people creating it at the same moment.
    const taken = await db.contactList.findFirst({
      where: { workspaceId, name: data.newListName },
      select: { id: true },
    });
    if (taken) throw listNameTaken();
  }

  try {
    // One transaction: never leave a new empty list behind if creating the
    // import record fails.
    return await db.$transaction(async (tx) => {
      let listId = data.listId ?? null;
      if (data.newListName) {
        const list = await tx.contactList.create({
          data: { workspaceId, name: data.newListName },
          select: { id: true },
        });
        listId = list.id;
      }

      const record = await tx.contactImport.create({
        data: { workspaceId, fileName: data.fileName, totalRows: data.totalRows, listId },
        select: { id: true },
      });
      return { importId: record.id, listId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw listNameTaken();
    }
    throw error;
  }
}

// ─── 2. One chunk of rows ───────────────────────────────────────────────────

/** A valid row, converted to what we store. */
type CleanRow = {
  firstName?: string; // undefined = "not in this row" → leave as is
  lastName?: string;
  attributes: Record<string, AttributeValue>; // only keys that had a value
};

export async function importChunkForWorkspace(
  workspaceId: string,
  input: ImportChunkInput,
): Promise<ChunkResult> {
  const { importId, rowOffset, rows, mapping, updateExisting } = parseOrThrow(
    importChunkSchema,
    input,
  );

  // The import must be ours and still running.
  const record = await db.contactImport.findFirst({
    where: { id: importId, workspaceId },
    select: { status: true, totalRows: true, list: { select: { id: true, workspaceId: true } } },
  });
  if (!record) throw new ImportError("Import not found.");
  if (record.status !== "PROCESSING") throw new ImportError("This import is no longer running.");
  if (rowOffset + rows.length > record.totalRows) {
    throw new ImportError("Received more rows than the file was said to contain.");
  }
  // Belt and braces: the list was checked at start, check it is still ours.
  const listId = record.list && record.list.workspaceId === workspaceId ? record.list.id : null;

  // ── Check the mapping, and look up each custom field's type in OUR workspace.
  if (new Set(mapping).size !== mapping.length) {
    throw new ImportError("Two columns are mapped to the same field.");
  }
  if (mapping.filter((t) => t === EMAIL_TARGET).length !== 1) {
    throw new ImportError("Exactly one column must be mapped to Email.");
  }
  const attributeKeys = mapping.filter(
    (t) => t !== EMAIL_TARGET && t !== FIRSTNAME_TARGET && t !== LASTNAME_TARGET,
  );
  const definitions = await db.contactAttribute.findMany({
    where: { workspaceId, key: { in: attributeKeys } },
    select: { key: true, type: true },
  });
  const typeByKey = new Map<string, AttributeTypeValue>(definitions.map((d) => [d.key, d.type]));
  const unknown = attributeKeys.find((key) => !typeByKey.has(key));
  if (unknown) {
    throw new ImportError(`The field "${unknown}" no longer exists. Go back and change the mapping.`);
  }

  // ── Validate and convert every row (never trusting the browser's types).
  const problems: ImportProblem[] = [];
  const byEmail = new Map<string, CleanRow>(); // email → last valid row with it
  const rowsPerEmail = new Map<string, number>(); // how many valid rows had it
  let invalid = 0;

  rows.forEach((cells, i) => {
    const rowNumber = rowOffset + i + FIRST_DATA_ROW_NUMBER;
    const errors: string[] = [];
    let email: string | null = null;
    const clean: CleanRow = { attributes: {} };

    mapping.forEach((target, col) => {
      const raw = (cells[col] ?? "").trim();

      if (target === EMAIL_TARGET) {
        const parsed = emailSchema.safeParse(raw);
        if (parsed.success) email = parsed.data;
        else errors.push(raw === "" ? "missing email" : `invalid email "${shorten(raw)}"`);
      } else if (target === FIRSTNAME_TARGET || target === LASTNAME_TARGET) {
        const label = target === FIRSTNAME_TARGET ? "First name" : "Last name";
        if (raw.length > MAX_NAME_CHARS) {
          errors.push(`${label} is longer than ${MAX_NAME_CHARS} characters.`);
        } else if (raw !== "") {
          if (target === FIRSTNAME_TARGET) clean.firstName = raw;
          else clean.lastName = raw;
        }
      } else {
        const result = parseAttributeValue(typeByKey.get(target)!, raw);
        if (!result.ok) errors.push(`${target}: ${result.error}`);
        // Empty cell → null → we leave the stored value alone.
        else if (result.value !== null) clean.attributes[target] = result.value;
      }
    });

    if (errors.length > 0 || !email) {
      invalid++;
      if (problems.length < MAX_STORED_PROBLEMS) {
        problems.push({ row: rowNumber, reason: capitalize(errors.join("; ")) });
      }
      return;
    }
    byEmail.set(email, clean); // a later duplicate replaces an earlier one
    rowsPerEmail.set(email, (rowsPerEmail.get(email) ?? 0) + 1);
  });

  const emails = [...byEmail.keys()];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // ── Write everything in ONE transaction: if anything fails, nothing from
  // this chunk is saved and the counters stay correct.
  await db.$transaction(
    async (tx) => {
      const contactIdByEmail = new Map<string, string>();

      if (emails.length > 0) {
        // Which of these emails already exist in THIS workspace? (one query)
        const existing = await tx.contact.findMany({
          where: { workspaceId, email: { in: emails } },
          select: { id: true, email: true },
        });
        for (const c of existing) contactIdByEmail.set(c.email, c.id);

        // Create the new ones. skipDuplicates means "if another import created
        // the same email a moment ago, don't crash, just skip it".
        const newEmails = emails.filter((e) => !contactIdByEmail.has(e));
        const createdEmails = new Set<string>();
        if (newEmails.length > 0) {
          const inserted = await tx.contact.createManyAndReturn({
            data: newEmails.map((email) => {
              const row = byEmail.get(email)!;
              return {
                workspaceId,
                email,
                firstName: row.firstName ?? null,
                lastName: row.lastName ?? null,
                attributes: row.attributes as Prisma.InputJsonObject,
                status: "SUBSCRIBED" as const,
                source: "import",
              };
            }),
            skipDuplicates: true,
            select: { id: true, email: true },
          });
          for (const c of inserted) {
            contactIdByEmail.set(c.email, c.id);
            createdEmails.add(c.email);
          }

          // Lost a race with another import? Then those contacts exist now:
          // treat them like any other existing contact.
          const raced = newEmails.filter((e) => !createdEmails.has(e));
          if (raced.length > 0) {
            const found = await tx.contact.findMany({
              where: { workspaceId, email: { in: raced } },
              select: { id: true, email: true },
            });
            for (const c of found) contactIdByEmail.set(c.email, c.id);
          }
        }

        // Update the existing ones in a single SQL statement. Only fields
        // present in the row change; attributes are MERGED (keys not in the
        // CSV are kept); `status` is never touched, so an unsubscribed,
        // bounced or complained contact stays that way.
        const toUpdate = emails.filter((e) => !createdEmails.has(e) && contactIdByEmail.has(e));
        if (updateExisting && toUpdate.length > 0) {
          await updateExistingContacts(tx, workspaceId, toUpdate, byEmail);
        }

        // Count each valid row once (see the note about duplicates at the top).
        for (const email of emails) {
          const count = rowsPerEmail.get(email)!;
          const existedBefore = !createdEmails.has(email);
          if (!existedBefore) created += 1;
          const others = existedBefore ? count : count - 1;
          if (updateExisting) updated += others;
          else skipped += others;
        }

        // Add every row's contact to the list (also the skipped ones).
        // skipDuplicates: contacts already in the list are left alone.
        if (listId) {
          await tx.listMembership.createMany({
            data: [...contactIdByEmail.values()].map((contactId) => ({ listId, contactId })),
            skipDuplicates: true,
          });
        }
      }

      // Bump the import's counters atomically (`x = x + n` in SQL, so two
      // requests can never overwrite each other) and append problems up to
      // the limit. The WHERE also re-checks workspace + status.
      const changed = await tx.$executeRaw`
        UPDATE "contact_import" SET
          "created" = "created" + ${created},
          "updated" = "updated" + ${updated},
          "skipped" = "skipped" + ${skipped},
          "errors" = ${appendProblemsSql(problems)}
        WHERE "id" = ${importId}
          AND "workspaceId" = ${workspaceId}
          AND "status" = 'PROCESSING'`;
      if (changed !== 1) throw new ImportError("This import is no longer running.");
    },
    // 500 rows normally take well under a second; leave lots of headroom.
    { maxWait: 10_000, timeout: 60_000 },
  );

  return { created, updated, skipped, invalid, problems };
}

/** One UPDATE ... FROM unnest(...) for all existing contacts in the chunk. */
async function updateExistingContacts(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  emails: string[],
  byEmail: Map<string, CleanRow>,
) {
  const firstNames = emails.map((e) => byEmail.get(e)!.firstName ?? null);
  const lastNames = emails.map((e) => byEmail.get(e)!.lastName ?? null);
  const attributes = emails.map((e) => JSON.stringify(byEmail.get(e)!.attributes));

  // COALESCE(new, old): an empty cell keeps the current name.
  // old || new: JSON merge where keys from the CSV win and others are kept.
  // Values are sent as parameters (never pasted into the SQL text), so a
  // CSV cell can't inject SQL.
  await tx.$executeRaw`
    UPDATE "contact" AS c SET
      "firstName" = COALESCE(v.first_name, c."firstName"),
      "lastName" = COALESCE(v.last_name, c."lastName"),
      "attributes" =
        (CASE WHEN jsonb_typeof(c."attributes") = 'object' THEN c."attributes" ELSE '{}'::jsonb END)
        || v.attrs::jsonb,
      "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    FROM unnest(${emails}::text[], ${firstNames}::text[], ${lastNames}::text[], ${attributes}::text[])
      AS v(email, first_name, last_name, attrs)
    WHERE c."workspaceId" = ${workspaceId}
      AND c."email" = v.email`;
}

/**
 * SQL for "errors + these problems, keeping only the first 100 overall".
 * Runs inside the UPDATE, so it is atomic too.
 */
function appendProblemsSql(problems: ImportProblem[]): Prisma.Sql {
  if (problems.length === 0) return Prisma.sql`"errors"`;
  const json = JSON.stringify(problems.slice(0, MAX_STORED_PROBLEMS));
  return Prisma.sql`
    COALESCE((
      SELECT jsonb_agg(e.value ORDER BY e.ord)
      FROM jsonb_array_elements(
        (CASE WHEN jsonb_typeof("errors") = 'array' THEN "errors" ELSE '[]'::jsonb END)
        || ${json}::jsonb
      ) WITH ORDINALITY AS e(value, ord)
      WHERE e.ord <= ${MAX_STORED_PROBLEMS}
    ), '[]'::jsonb)`;
}

// ─── 3. Finish / fail ───────────────────────────────────────────────────────

export type ImportSummary = {
  importId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  /** Rows that were rejected. Only known once the import has completed. */
  invalid: number | null;
  listId: string | null;
  problems: ImportProblem[];
};

export async function finishImportForWorkspace(
  workspaceId: string,
  importId: unknown,
): Promise<ImportSummary> {
  const id = parseOrThrow(idSchema, importId);
  // updateMany lets us filter by workspace AND status in one go.
  await db.contactImport.updateMany({
    where: { id, workspaceId, status: "PROCESSING" },
    data: { status: "COMPLETED", finishedAt: new Date() },
  });
  return getImportSummary(workspaceId, id);
}

export async function failImportForWorkspace(
  workspaceId: string,
  importId: unknown,
  message: unknown,
): Promise<void> {
  const id = parseOrThrow(idSchema, importId);
  const reason =
    typeof message === "string" && message.trim() ? message.trim().slice(0, 300) : "Import failed.";
  await db.$executeRaw`
    UPDATE "contact_import" SET
      "status" = 'FAILED',
      "finishedAt" = (NOW() AT TIME ZONE 'UTC'),
      "errors" = ${appendProblemsSql([{ row: null, reason }])}
    WHERE "id" = ${id}
      AND "workspaceId" = ${workspaceId}
      AND "status" = 'PROCESSING'`;
}

export async function getImportSummary(
  workspaceId: string,
  importId: string,
): Promise<ImportSummary> {
  const record = await db.contactImport.findFirst({
    where: { id: importId, workspaceId },
    select: {
      id: true,
      status: true,
      totalRows: true,
      created: true,
      updated: true,
      skipped: true,
      listId: true,
      errors: true,
    },
  });
  if (!record) throw new ImportError("Import not found.");
  return {
    importId: record.id,
    status: record.status,
    totalRows: record.totalRows,
    created: record.created,
    updated: record.updated,
    skipped: record.skipped,
    invalid: invalidCount(record),
    listId: record.listId,
    problems: readProblems(record.errors),
  };
}

// ─── 4. History ─────────────────────────────────────────────────────────────

export type RecentImport = {
  id: string;
  fileName: string;
  /** INTERRUPTED = still "processing" long after it started (the tab was closed). */
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "INTERRUPTED";
  createdAt: Date;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number | null;
  listName: string | null;
  /** Why it failed, when it did. */
  failureReason: string | null;
};

/** The workspace's last 10 imports, newest first. */
export async function getRecentImports(workspaceId: string): Promise<RecentImport[]> {
  const records = await db.contactImport.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      totalRows: true,
      created: true,
      updated: true,
      skipped: true,
      errors: true,
      list: { select: { name: true } },
    },
  });

  const staleBefore = Date.now() - STALE_AFTER_MS;
  return records.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    status:
      r.status === "PROCESSING" && r.createdAt.getTime() < staleBefore ? "INTERRUPTED" : r.status,
    createdAt: r.createdAt,
    totalRows: r.totalRows,
    created: r.created,
    updated: r.updated,
    skipped: r.skipped,
    invalid: invalidCount(r),
    listName: r.list?.name ?? null,
    failureReason:
      r.status === "FAILED" ? (readProblems(r.errors).find((p) => p.row === null)?.reason ?? null) : null,
  }));
}

// ─── Small helpers ──────────────────────────────────────────────────────────

/** Every row is created, updated, skipped or invalid, so invalid is "the rest". */
function invalidCount(r: {
  status: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
}): number | null {
  if (r.status !== "COMPLETED") return null;
  return Math.max(0, r.totalRows - r.created - r.updated - r.skipped);
}

/** Reads the `errors` JSON column safely. */
function readProblems(json: unknown): ImportProblem[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { row, reason } = item as { row?: unknown; reason?: unknown };
    if (typeof reason !== "string") return [];
    return [{ row: typeof row === "number" ? row : null, reason }];
  });
}

/** zod parse that throws a friendly ImportError instead of a ZodError. */
function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ImportError(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  return parsed.data;
}

function shorten(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
