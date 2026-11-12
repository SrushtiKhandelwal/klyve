"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { emailDocumentSchema } from "@/lib/templates/document";
import {
  buildMergeData,
  documentMergeTagErrors,
  personalize,
  TemplateError,
  type MergeData,
} from "@/lib/templates/personalize";
import { InvalidDocumentError, renderDocument } from "@/lib/templates/render";
import { previewMergeData } from "@/lib/templates/sample-data";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Action behind the editor's Preview tab (and "send test").
// Anyone can call a Server Action with any input, so we check the workspace,
// the size and the shape of everything again here.

/** Bigger than any real design (a full one is ~100 KB of JSON). */
const MAX_DOCUMENT_JSON = 1_000_000;

const optionsSchema = z.object({
  subject: z.string().max(500).optional(),
  preheader: z.string().max(500).optional(),
  /** "sample" = our pretend contact; otherwise a contact id from this workspace. */
  personalizeAs: z.union([z.literal("sample"), z.string().min(1).max(64)]).optional(),
});

export type PreviewOptions = z.infer<typeof optionsSchema>;

export type PreviewResult =
  | { ok: true; html: string; text: string; subject: string; warnings: string[] }
  | { ok: false; error: string };

export async function previewDocument(doc: unknown, options: PreviewOptions = {}): Promise<PreviewResult> {
  const ws = await requireActiveWorkspace();

  // Size first, before doing any real work with the input.
  let size: number;
  try {
    size = JSON.stringify(doc ?? null).length;
  } catch {
    return { ok: false, error: "This design couldn't be read." };
  }
  if (size > MAX_DOCUMENT_JSON) return { ok: false, error: "This design is too large to preview (over 1 MB)." };

  const opts = optionsSchema.safeParse(options ?? {});
  if (!opts.success) return { ok: false, error: "Invalid preview options." };

  const parsed = emailDocumentSchema.safeParse(doc);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
    return { ok: false, error: `This design isn't valid: ${issue?.message ?? "unknown problem"}${where}` };
  }

  // Broken merge tags, reported per block so the message says where.
  const tagErrors = documentMergeTagErrors(parsed.data, { subject: opts.data.subject, preheader: opts.data.preheader });
  if (tagErrors.length) return { ok: false, error: tagErrors[0] };

  // Who the preview is addressed to.
  const attributes = await db.contactAttribute.findMany({
    where: { workspaceId: ws.id },
    select: { key: true, type: true },
  });
  let data: MergeData;
  const as = opts.data.personalizeAs ?? "sample";
  if (as === "sample") {
    data = previewMergeData(attributes, { workspaceName: ws.name });
  } else {
    // The workspace filter is what stops anyone previewing another
    // workspace's contact by guessing its id.
    const contact = await db.contact.findFirst({
      where: { id: as, workspaceId: ws.id },
      select: { email: true, firstName: true, lastName: true, attributes: true },
    });
    if (!contact) return { ok: false, error: "That contact wasn't found in this workspace." };
    data = buildMergeData(contact, { unsubscribeUrl: "#", workspaceName: ws.name });
  }

  try {
    const rendered = await renderDocument(parsed.data, {
      subject: opts.data.subject,
      preheader: opts.data.preheader,
    });
    const filled = personalize(
      { html: rendered.html, text: rendered.text, subject: opts.data.subject ?? "" },
      data,
    );
    return { ok: true, ...filled, warnings: rendered.warnings };
  } catch (err) {
    if (err instanceof TemplateError || err instanceof InvalidDocumentError) {
      return { ok: false, error: err.message };
    }
    console.error("previewDocument failed:", err instanceof Error ? err.name : "unknown");
    return { ok: false, error: "The preview couldn't be created. Please try again." };
  }
}
