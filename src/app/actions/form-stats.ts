"use server";

import { z } from "zod";
import { getAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { formConfigSchema, type FormConfig } from "@/lib/forms/schema";
import { requireActiveWorkspace } from "@/lib/workspace";
import { formUrls, type AttributeTypes, type FormUrls } from "@/components/forms/embed/snippets";

// Server Actions for a form's "Share & embed" panel.
//
// Server Actions are public endpoints, so the workspace always comes from the
// session (requireActiveWorkspace), never from the browser. A public id from
// another workspace simply isn't found.

export type FormEmbedData = {
  formName: string;
  status: "ACTIVE" | "PAUSED";
  urls: FormUrls;
  /** The last SAVED settings (null if they're somehow invalid). */
  config: FormConfig | null;
  /** Types of the workspace's custom fields used on the form (missing = deleted). */
  attributeTypes: AttributeTypes;
};

export type FormEmbedResult = { ok: true; data: FormEmbedData } | { ok: false; message: string };

const publicIdSchema = z.string().trim().min(1).max(64);

/** What the embed panel needs to build its codes: the form's public URLs and its saved settings. */
export async function getFormEmbedData(publicId: string): Promise<FormEmbedResult> {
  const ws = await requireActiveWorkspace();
  const parsed = publicIdSchema.safeParse(publicId);
  if (!parsed.success) return { ok: false, message: "This form doesn't exist (or was deleted)." };

  const form = await db.signupForm.findFirst({
    where: { publicId: parsed.data, workspaceId: ws.id },
    select: { name: true, status: true, publicId: true, config: true },
  });
  if (!form) return { ok: false, message: "This form doesn't exist (or was deleted)." };

  const config = formConfigSchema.safeParse(form.config);

  // The HTML code needs each custom field's type (number, date, yes/no).
  const keys = (config.success ? config.data.fields : [])
    .map((f) => (f.target.startsWith("attr:") ? f.target.slice(5) : null))
    .filter((k): k is string => k !== null);
  const attributes = keys.length
    ? await db.contactAttribute.findMany({ where: { workspaceId: ws.id, key: { in: keys } }, select: { key: true, type: true } })
    : [];

  return {
    ok: true,
    data: {
      formName: form.name,
      status: form.status,
      // Absolute URLs from the app's configured public address, so the codes
      // work when pasted on other websites.
      urls: formUrls(getAppUrl(), form.publicId),
      config: config.success ? config.data : null,
      attributeTypes: Object.fromEntries(attributes.map((a) => [a.key, a.type])),
    },
  };
}
