import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getBrandTheme } from "@/lib/brand-kit";
import { db } from "@/lib/db";
import { defaultFormConfig, formConfigSchema, type FormConfig } from "@/lib/forms/schema";

// Data Access Layer for sign-up forms (the dashboard side).
//
// SECURITY (multi-tenant isolation): every function takes the workspace FIRST
// and every query filters by it. ONLY pass the workspace from
// requireActiveWorkspace(). A form id from the browser is always used together
// with that workspace id, so another workspace's id simply finds nothing.
// Role checks (who may delete) are the caller's job: see src/app/actions/forms.ts.

export const FORM_LIMITS = {
  /** Forms per workspace. Plenty for real use; stops runaway scripts. */
  maxPerWorkspace: 100,
  nameMax: 100,
  /** Lists one form can add people to. */
  maxLists: 50,
} as const;

export type FormStatusValue = "ACTIVE" | "PAUSED";
export type FormResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** A workspace object (from requireActiveWorkspace) or just its id. */
type WorkspaceRef = string | { id: string; name?: string };
const wsId = (ws: WorkspaceRef) => (typeof ws === "string" ? ws : ws.id);

const NOT_FOUND = "This form doesn't exist (or was deleted).";
const LIMIT_REACHED = `You've reached the limit of ${FORM_LIMITS.maxPerWorkspace} forms. Delete some you no longer need first.`;

// ── Validation ──────────────────────────────────────────────────────────────

export const formNameSchema = z
  .string()
  .trim()
  .min(1, "Give the form a name.")
  .max(FORM_LIMITS.nameMax, `Keep the name under ${FORM_LIMITS.nameMax} characters.`)
  // Line breaks and other control characters have no place in a name.
  .refine((v) => ![...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f), "The name can't contain line breaks.");

export const formStatusSchema = z.enum(["ACTIVE", "PAUSED"]);

const firstIssue = (error: z.ZodError, fallback = "Something in the form isn't valid.") => error.issues[0]?.message ?? fallback;

/** 16 random URL-safe characters (12 random bytes = 96 bits): impossible to guess. */
function newPublicId(): string {
  return randomBytes(12).toString("base64url");
}

/** "https://example.com/thanks" yes; "https://" or "example.com" no. */
function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0 && /^https?:\/\//i.test(value);
  } catch {
    return false;
  }
}

/** Parses a stored config. A broken row (e.g. edited by hand) falls back to a plain default so pages never crash. */
function readConfig(raw: unknown): FormConfig {
  const parsed = formConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return defaultFormConfig({ companyName: "us", primaryColor: "#059669", textColor: "#27272a" });
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type FormListItem = {
  id: string;
  name: string;
  publicId: string;
  status: FormStatusValue;
  config: FormConfig;
  listIds: string[];
  submissionCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const SELECT = {
  id: true,
  name: true,
  publicId: true,
  status: true,
  config: true,
  listIds: true,
  submissionCount: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = Prisma.SignupFormGetPayload<{ select: typeof SELECT }>;

function toItem(row: Row): FormListItem {
  return {
    id: row.id,
    name: row.name,
    publicId: row.publicId,
    status: row.status,
    config: readConfig(row.config),
    listIds: row.listIds,
    submissionCount: row.submissionCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All forms in the workspace, most recently edited first. */
export async function listForms(ws: WorkspaceRef): Promise<FormListItem[]> {
  const rows = await db.signupForm.findMany({
    where: { workspaceId: wsId(ws) },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: FORM_LIMITS.maxPerWorkspace,
    select: SELECT,
  });
  return rows.map(toItem);
}

export async function countForms(ws: WorkspaceRef): Promise<number> {
  return db.signupForm.count({ where: { workspaceId: wsId(ws) } });
}

export type FormDetail = FormListItem & { createdById: string | null };

/**
 * One form, or null if it doesn't exist in this workspace. List ids of lists
 * that were deleted since are dropped, so the builder only shows real lists.
 */
export async function getForm(ws: WorkspaceRef, formId: string): Promise<FormDetail | null> {
  if (!formId || typeof formId !== "string" || formId.length > 64) return null;
  const workspaceId = wsId(ws);
  const row = await db.signupForm.findFirst({ where: { id: formId, workspaceId }, select: SELECT });
  if (!row) return null;
  const existing = row.listIds.length
    ? await db.contactList.findMany({ where: { workspaceId, id: { in: row.listIds } }, select: { id: true } })
    : [];
  const keep = new Set(existing.map((l) => l.id));
  return { ...toItem(row), listIds: row.listIds.filter((id) => keep.has(id)), createdById: row.createdById };
}

/** Whether new sign-ups must confirm by email first (Settings → Compliance). */
export async function getDoubleOptIn(ws: WorkspaceRef): Promise<boolean> {
  const row = await db.workspace.findUnique({ where: { id: wsId(ws) }, select: { doubleOptIn: true } });
  return row?.doubleOptIn ?? false;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Creates a form that's ready to use: email + first name, in the workspace's
 * brand colours. The brand is looked up here (not passed in) so a caller
 * can't create a form "in someone else's brand".
 */
export async function createForm(
  ws: { id: string; name?: string },
  userId: string,
  input: { name?: unknown },
): Promise<FormResult<{ formId: string }>> {
  const name = formNameSchema.safeParse(typeof input.name === "string" && input.name.trim() ? input.name : "Newsletter sign-up");
  if (!name.success) return { ok: false, error: firstIssue(name.error) };

  // Not a transaction: two creates at the very same moment could end on 101.
  // Harmless: the limit is only there to stop abuse.
  if ((await countForms(ws)) >= FORM_LIMITS.maxPerWorkspace) return { ok: false, error: LIMIT_REACHED };

  const theme = await getBrandTheme(ws);
  const config = defaultFormConfig({
    companyName: theme.companyName,
    primaryColor: theme.primaryColor,
    textColor: theme.textColor,
  });
  const row = await createWithFreshPublicId({
    workspaceId: ws.id,
    name: name.data,
    config: config as Prisma.InputJsonValue,
    createdById: userId,
  });
  return { ok: true, formId: row.id };
}

/** Inserts a form. If the random public id ever clashes (practically never), tries another. */
async function createWithFreshPublicId(data: Omit<Prisma.SignupFormUncheckedCreateInput, "publicId">) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.signupForm.create({ data: { ...data, publicId: newPublicId() }, select: { id: true } });
    } catch (error) {
      const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!clash || attempt >= 3) throw error;
    }
  }
}

export type SaveFormInput = {
  name?: unknown;
  config?: unknown;
  listIds?: unknown;
  status?: unknown;
};

/**
 * Saves the builder's changes. Only the parts given are changed. Everything
 * is checked first:
 *  - the config against formConfigSchema (one required Email field, no field twice, ...);
 *  - every custom field ("attr:KEY") must exist in this workspace;
 *  - every list must belong to this workspace.
 */
export async function saveForm(
  ws: WorkspaceRef,
  formId: string,
  input: SaveFormInput,
): Promise<FormResult<{ updatedAt: Date }>> {
  const workspaceId = wsId(ws);
  const data: Prisma.SignupFormUpdateManyMutationInput = {};

  if (input.name !== undefined) {
    const name = formNameSchema.safeParse(input.name);
    if (!name.success) return { ok: false, error: firstIssue(name.error) };
    data.name = name.data;
  }

  if (input.status !== undefined) {
    const status = formStatusSchema.safeParse(input.status);
    if (!status.success) return { ok: false, error: "Choose Active or Paused." };
    data.status = status.data;
  }

  if (input.config !== undefined) {
    const parsed = formConfigSchema.safeParse(input.config);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const config = parsed.data;
    // The schema only checks the start ("https://"); make sure it's a real address too.
    if (config.redirectUrl && !isWebAddress(config.redirectUrl)) {
      return { ok: false, error: "Use a full web address for the page after sign-up, like https://example.com/thanks" };
    }

    // Custom fields must be real fields of THIS workspace.
    const keys = config.fields.filter((f) => f.target.startsWith("attr:")).map((f) => f.target.slice(5));
    if (keys.length) {
      const found = await db.contactAttribute.findMany({ where: { workspaceId, key: { in: keys } }, select: { key: true } });
      const known = new Set(found.map((a) => a.key));
      const missing = config.fields.find((f) => f.target.startsWith("attr:") && !known.has(f.target.slice(5)));
      if (missing) {
        return { ok: false, error: `The custom field "${missing.label}" no longer exists. Remove it from the form.` };
      }
    }
    data.config = config as Prisma.InputJsonValue;
  }

  if (input.listIds !== undefined) {
    const ids = z.array(z.string().min(1).max(64)).max(FORM_LIMITS.maxLists).safeParse(input.listIds);
    if (!ids.success) return { ok: false, error: "Those lists couldn't be read." };
    const unique = [...new Set(ids.data)];
    if (unique.length) {
      const found = await db.contactList.count({ where: { workspaceId, id: { in: unique } } });
      if (found !== unique.length) return { ok: false, error: "One of the chosen lists doesn't exist (it may have been deleted)." };
    }
    data.listIds = unique;
  }

  // updateMany with BOTH ids: the workspace filter is part of the write itself.
  // An empty update still bumps updatedAt, so "nothing to save" also checks the form exists.
  const result = await db.signupForm.updateMany({ where: { id: String(formId), workspaceId }, data: { ...data, updatedAt: new Date() } });
  if (result.count === 0) return { ok: false, error: NOT_FOUND };
  return { ok: true, updatedAt: new Date() };
}

/** Copies a form within the same workspace ("Copy of …"), with a new public link and zero sign-ups. */
export async function duplicateForm(ws: WorkspaceRef, userId: string, formId: string): Promise<FormResult<{ formId: string }>> {
  const workspaceId = wsId(ws);
  const source = await db.signupForm.findFirst({
    where: { id: String(formId), workspaceId },
    select: { name: true, status: true, config: true, listIds: true },
  });
  if (!source) return { ok: false, error: NOT_FOUND };
  if ((await countForms(workspaceId)) >= FORM_LIMITS.maxPerWorkspace) return { ok: false, error: LIMIT_REACHED };

  const row = await createWithFreshPublicId({
    workspaceId,
    name: `Copy of ${source.name}`.slice(0, FORM_LIMITS.nameMax),
    status: source.status,
    config: source.config as Prisma.InputJsonValue,
    listIds: source.listIds,
    createdById: userId,
  });
  return { ok: true, formId: row.id };
}

/**
 * Deletes a form and its sign-up log. Contacts who signed up stay (with their
 * consent history); only the form is gone, and its link stops working.
 */
export async function deleteForm(ws: WorkspaceRef, formId: string): Promise<FormResult> {
  const result = await db.signupForm.deleteMany({ where: { id: String(formId), workspaceId: wsId(ws) } });
  return result.count === 0 ? { ok: false, error: NOT_FOUND } : { ok: true };
}

/** Shared rule so pages can hide the Delete button when it wouldn't work. */
export function canDeleteForm(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
