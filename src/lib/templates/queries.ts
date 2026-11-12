import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getBrandTheme } from "@/lib/brand-kit";
import { db } from "@/lib/db";
import { emailDocumentSchema, emptyDocument, type EmailDocument } from "@/lib/templates/document";
import { renderDocument } from "@/lib/templates/render";
import { buildStarter, getStarterMeta } from "@/lib/templates/starters";

// Data Access Layer for email templates.
//
// SECURITY (multi-tenant isolation): every function takes the workspace id
// FIRST and every query filters by it. ONLY pass the id from
// requireActiveWorkspace(). A template id from the browser is always used
// together with that workspace id, so another workspace's id finds nothing.

export const TEMPLATE_LIMITS = {
  /** Templates per workspace. Plenty for real use; stops runaway scripts filling the database. */
  maxPerWorkspace: 500,
  /** Largest design we store (JSON size). A normal email is 10–60 KB. */
  maxDocumentBytes: 1_000_000,
  nameMax: 100,
  subjectMax: 200,
  preheaderMax: 300,
} as const;

// ── Validation ──────────────────────────────────────────────────────────────

// Line breaks in a subject could be used to sneak extra email headers in,
// so they (and other control characters) are not allowed.
const noControlChars = (v: string) =>
  ![...v].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, "Give the template a name.")
  .max(TEMPLATE_LIMITS.nameMax, `Keep the name under ${TEMPLATE_LIMITS.nameMax} characters.`)
  .refine(noControlChars, "The name can't contain line breaks.");

const subjectSchema = z
  .string()
  .trim()
  .max(TEMPLATE_LIMITS.subjectMax, `Keep the subject under ${TEMPLATE_LIMITS.subjectMax} characters.`)
  .refine(noControlChars, "The subject can't contain line breaks.");

const preheaderSchema = z
  .string()
  .trim()
  .max(TEMPLATE_LIMITS.preheaderMax, `Keep the preview text under ${TEMPLATE_LIMITS.preheaderMax} characters.`)
  .refine(noControlChars, "The preview text can't contain line breaks.");

export type TemplateResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Something in the template isn't valid.";

/**
 * Checks a design that came from the browser: size first (cheap), then the
 * full schema. Returns the parsed (clean) document.
 */
export function validateDocument(input: unknown): TemplateResult<{ document: EmailDocument }> {
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(input) ?? "", "utf8");
  } catch {
    return { ok: false, error: "This design couldn't be read." };
  }
  if (size > TEMPLATE_LIMITS.maxDocumentBytes) {
    return { ok: false, error: "This design is too big to save (over 1 MB). Try removing some custom HTML blocks." };
  }
  const parsed = emailDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.warn("Invalid template document:", issue?.path.join("."), issue?.message);
    return { ok: false, error: `This design has a problem: ${firstIssue(parsed.error)}` };
  }
  return { ok: true, document: parsed.data };
}

/** Renders a design to email HTML + plain text (merge tags left in place for sending). */
async function renderForStorage(document: EmailDocument, subject: string, preheader: string) {
  const { html, text, warnings } = await renderDocument(document, { subject, preheader });
  return { html, text, warnings };
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type TemplateSort = "updated" | "name" | "created";

export type TemplateListItem = {
  id: string;
  name: string;
  subject: string;
  starterId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Light fields only: no design JSON or HTML, so a list of 500 stays small. */
const LIST_SELECT = {
  id: true,
  name: true,
  subject: true,
  starterId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listTemplates(
  workspaceId: string,
  options: { q?: string; sort?: TemplateSort } = {},
): Promise<TemplateListItem[]> {
  const q = options.q?.trim().slice(0, 100);
  const orderBy: Prisma.EmailTemplateOrderByWithRelationInput[] =
    options.sort === "name"
      ? [{ name: "asc" }, { id: "asc" }]
      : options.sort === "created"
        ? [{ createdAt: "desc" }, { id: "asc" }]
        : [{ updatedAt: "desc" }, { id: "asc" }];
  return db.emailTemplate.findMany({
    where: {
      workspaceId,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy,
    take: TEMPLATE_LIMITS.maxPerWorkspace,
    select: LIST_SELECT,
  });
}

export async function countTemplates(workspaceId: string): Promise<number> {
  return db.emailTemplate.count({ where: { workspaceId } });
}

export type TemplateDetail = TemplateListItem & {
  preheader: string;
  document: EmailDocument;
  html: string;
  text: string;
};

/** One template with its design, or null if it doesn't exist in this workspace. */
export async function getTemplate(workspaceId: string, templateId: string): Promise<TemplateDetail | null> {
  if (!templateId || typeof templateId !== "string") return null;
  const row = await db.emailTemplate.findFirst({
    where: { id: templateId, workspaceId },
    select: { ...LIST_SELECT, preheader: true, document: true, html: true, text: true },
  });
  if (!row) return null;
  // The stored design was validated when saved, but parse again so a bad row
  // (e.g. edited by hand) can't crash the editor: fall back to a blank design.
  const parsed = emailDocumentSchema.safeParse(row.document);
  return { ...row, document: parsed.success ? parsed.data : emptyDocument() };
}

/** Stored HTML for a few templates, for the small previews on the templates page. */
export async function getTemplateThumbnails(workspaceId: string, templateIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(templateIds.filter((id) => typeof id === "string" && id.length > 0 && id.length < 50))].slice(0, 24);
  if (ids.length === 0) return {};
  const rows = await db.emailTemplate.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { id: true, html: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.html]));
}

// ── Writing ─────────────────────────────────────────────────────────────────

const LIMIT_REACHED = `You've reached the limit of ${TEMPLATE_LIMITS.maxPerWorkspace} templates. Delete some you no longer need first.`;
const NOT_FOUND = "This template doesn't exist (or was deleted).";

export type CreateTemplateInput = {
  name?: unknown;
  /** Start from a starter template (in the workspace's brand)... */
  starterId?: unknown;
  /** ...or from an existing design. Neither = blank email. */
  document?: unknown;
  subject?: unknown;
  preheader?: unknown;
};

/**
 * Creates a template. The brand theme is looked up here (not passed in) so a
 * caller can't make a template "in someone else's brand".
 */
export async function createTemplate(
  workspace: { id: string; name?: string },
  userId: string,
  input: CreateTemplateInput,
): Promise<TemplateResult<{ templateId: string }>> {
  const workspaceId = workspace.id;
  // Not a transaction: two creates at the very same moment could end on 501.
  // That's harmless; the limit is only there to stop abuse.
  if ((await countTemplates(workspaceId)) >= TEMPLATE_LIMITS.maxPerWorkspace) return { ok: false, error: LIMIT_REACHED };

  let document: EmailDocument;
  let starterId: string | null = null;
  let subject = "";
  let preheader = "";
  let defaultName = "Untitled template";

  if (input.starterId !== undefined && input.starterId !== null && input.starterId !== "") {
    const meta = getStarterMeta(String(input.starterId));
    if (!meta) return { ok: false, error: "That starter template doesn't exist." };
    const theme = await getBrandTheme(workspace);
    document = buildStarter(meta.id, theme)!;
    starterId = meta.id;
    subject = meta.subject;
    preheader = meta.preheader;
    defaultName = meta.name;
  } else if (input.document !== undefined) {
    const checked = validateDocument(input.document);
    if (!checked.ok) return checked;
    document = checked.document;
  } else {
    document = emptyDocument(await getBrandTheme(workspace));
  }

  const name = templateNameSchema.safeParse(typeof input.name === "string" && input.name.trim() ? input.name : defaultName);
  if (!name.success) return { ok: false, error: firstIssue(name.error) };
  if (input.subject !== undefined) {
    const s = subjectSchema.safeParse(input.subject);
    if (!s.success) return { ok: false, error: firstIssue(s.error) };
    subject = s.data;
  }
  if (input.preheader !== undefined) {
    const p = preheaderSchema.safeParse(input.preheader);
    if (!p.success) return { ok: false, error: firstIssue(p.error) };
    preheader = p.data;
  }

  // Render straight away so the template has a preview and usable HTML even
  // before its first save in the editor.
  const rendered = await renderForStorage(document, subject, preheader);
  const row = await db.emailTemplate.create({
    data: {
      workspaceId,
      name: name.data,
      subject,
      preheader,
      starterId,
      document: document as Prisma.InputJsonValue,
      html: rendered.html,
      text: rendered.text,
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, templateId: row.id };
}

/** Saves the editor's work: validates the design, re-renders and stores HTML + text. */
export async function saveTemplate(
  workspaceId: string,
  templateId: string,
  input: { document?: unknown; subject?: unknown; preheader?: unknown },
): Promise<TemplateResult<{ warnings: string[]; updatedAt: Date }>> {
  const checked = validateDocument(input.document);
  if (!checked.ok) return checked;
  const subject = subjectSchema.safeParse(input.subject ?? "");
  if (!subject.success) return { ok: false, error: firstIssue(subject.error) };
  const preheader = preheaderSchema.safeParse(input.preheader ?? "");
  if (!preheader.success) return { ok: false, error: firstIssue(preheader.error) };

  // Check it exists in THIS workspace before doing the (slower) render.
  const exists = await db.emailTemplate.findFirst({ where: { id: String(templateId), workspaceId }, select: { id: true } });
  if (!exists) return { ok: false, error: NOT_FOUND };

  const rendered = await renderForStorage(checked.document, subject.data, preheader.data);
  // updateMany with BOTH ids: the workspace filter is part of the write itself.
  const result = await db.emailTemplate.updateMany({
    where: { id: exists.id, workspaceId },
    data: {
      document: checked.document as Prisma.InputJsonValue,
      subject: subject.data,
      preheader: preheader.data,
      html: rendered.html,
      text: rendered.text,
    },
  });
  if (result.count === 0) return { ok: false, error: NOT_FOUND };
  return { ok: true, warnings: rendered.warnings, updatedAt: new Date() };
}

export async function renameTemplate(workspaceId: string, templateId: string, name: unknown): Promise<TemplateResult> {
  const parsed = templateNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await db.emailTemplate.updateMany({
    where: { id: String(templateId), workspaceId },
    data: { name: parsed.data },
  });
  return result.count === 0 ? { ok: false, error: NOT_FOUND } : { ok: true };
}

/** Copies a template within the same workspace ("Copy of …"). */
export async function duplicateTemplate(
  workspaceId: string,
  userId: string,
  templateId: string,
): Promise<TemplateResult<{ templateId: string }>> {
  const source = await db.emailTemplate.findFirst({
    where: { id: String(templateId), workspaceId },
    select: { name: true, subject: true, preheader: true, starterId: true, document: true, html: true, text: true },
  });
  if (!source) return { ok: false, error: NOT_FOUND };
  if ((await countTemplates(workspaceId)) >= TEMPLATE_LIMITS.maxPerWorkspace) return { ok: false, error: LIMIT_REACHED };

  const name = `Copy of ${source.name}`.slice(0, TEMPLATE_LIMITS.nameMax);
  const row = await db.emailTemplate.create({
    data: {
      workspaceId,
      name,
      subject: source.subject,
      preheader: source.preheader,
      starterId: source.starterId,
      document: source.document as Prisma.InputJsonValue,
      html: source.html,
      text: source.text,
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, templateId: row.id };
}

/**
 * Deletes a template. Who may delete: OWNER/ADMIN can delete any template;
 * a MEMBER only the ones they created (so a teammate can't wipe others' work).
 */
export async function deleteTemplate(
  workspaceId: string,
  templateId: string,
  actor: { userId: string; role: "OWNER" | "ADMIN" | "MEMBER" },
): Promise<TemplateResult> {
  const row = await db.emailTemplate.findFirst({
    where: { id: String(templateId), workspaceId },
    select: { id: true, createdById: true },
  });
  if (!row) return { ok: false, error: NOT_FOUND };
  if (!canDeleteTemplate(actor, row.createdById)) {
    return { ok: false, error: "Only workspace owners and admins can delete templates made by someone else." };
  }
  await db.emailTemplate.deleteMany({ where: { id: row.id, workspaceId } });
  return { ok: true };
}

/** Shared rule so the page can hide the Delete button when it wouldn't work. */
export function canDeleteTemplate(actor: { userId: string; role: string }, createdById: string | null): boolean {
  return actor.role === "OWNER" || actor.role === "ADMIN" || (createdById !== null && createdById === actor.userId);
}
