"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { utmValueProblem } from "@/lib/tracking/utm";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Action for Settings → Link tracking (UTM tags).
// The browser can send anything, so it works out the workspace from the
// session, checks the role (owners and admins only) and validates the input.

export type TrackingSettingsResult = { ok: true; message: string } | { ok: false; error: string };

const inputSchema = z.object({
  enabled: z.boolean(),
  source: z.string().trim().max(200),
  medium: z.string().trim().max(200),
});

/** Saves "Add UTM tags to links" and the utm_source / utm_medium values. */
export async function saveUtmSettings(input: unknown): Promise<TrackingSettingsResult> {
  const ws = await requireActiveWorkspace();
  if (ws.role !== "OWNER" && ws.role !== "ADMIN") {
    return { ok: false, error: "Only workspace owners and admins can change link tracking." };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those settings aren't valid. Please check them and try again." };
  const { enabled, source, medium } = parsed.data;

  const problem = utmValueProblem("source (utm_source)", source) ?? utmValueProblem("medium (utm_medium)", medium);
  if (problem) return { ok: false, error: problem };

  try {
    await db.workspace.update({
      where: { id: ws.id },
      data: { utmEnabled: enabled, utmSource: source, utmMedium: medium },
    });
  } catch (error) {
    console.error("saveUtmSettings failed:", error);
    return { ok: false, error: "Couldn't save the settings. Please try again." };
  }
  refresh();
  return {
    ok: true,
    message: enabled
      ? "Saved. Campaigns you send from now on get UTM tags on their links."
      : "Saved. UTM tags are off.",
  };
}
