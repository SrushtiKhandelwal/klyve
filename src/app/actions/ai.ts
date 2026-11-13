"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aiFailure, getAiActor, type AiActionResult } from "@/lib/ai/action";
import { isAiConfigured } from "@/lib/ai/config";
import type { AutomationSuggestion } from "@/lib/ai/features/automation";
import type { Explanation } from "@/lib/ai/features/explain";
import type { SegmentSuggestion } from "@/lib/ai/features/segment";
import {
  createAutomationWithSetting,
  describeAutomation,
  describeSegment,
  explainReport,
  generateCampaign,
  improveText,
  suggestSubjects,
} from "@/lib/ai/service";
import { CampaignError } from "@/lib/campaigns/queries";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the AI features. Each one is a thin wrapper:
//   1. work out the workspace and the person from the SESSION (getAiActor),
//   2. check the input,
//   3. call the feature in src/lib/ai/service.ts, which goes through
//      runAiFeature (limits, usage log, answer checks) for every AI request.
// Results are always { ok: true, … } or { ok: false, error } with a message
// that is safe to show. The Groq key never leaves the server.

const idSchema = z.string().trim().min(1).max(64);
const INVALID = "Invalid request.";

/** Turns errors into a safe result; CampaignError messages are meant for the user too. */
function fail(where: string, error: unknown): { ok: false; error: string } {
  if (error instanceof CampaignError) return { ok: false, error: error.message };
  return aiFailure(where, error);
}

/** Is AI set up on this server? (So the buttons can show a friendly note instead.) */
export async function getAiStatusAction(): Promise<{ configured: boolean }> {
  // Only for logged-in members; says nothing about the key itself.
  await requireActiveWorkspace();
  return { configured: isAiConfigured() };
}

/** "Generate campaign with AI": creates a DRAFT campaign and returns its id. */
export async function generateCampaignAction(input: unknown): Promise<AiActionResult<{ id: string }>> {
  const { ws, actor } = await getAiActor();
  try {
    const { id } = await generateCampaign(ws, actor, input);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail("generateCampaignAction", error);
  }
}

/** 5 subject lines + a preview text, based on the campaign's current content. */
export async function suggestSubjectsAction(
  campaignId: unknown,
): Promise<AiActionResult<{ subjects: string[]; preheader: string }>> {
  const { ws, actor } = await getAiActor();
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    return { ok: true, ...(await suggestSubjects(ws, actor, id.data)) };
  } catch (error) {
    return fail("suggestSubjectsAction", error);
  }
}

/** Rewrites one heading/text/button. Merge tags and links are kept exactly. */
export async function improveTextAction(input: unknown): Promise<AiActionResult<{ content: string }>> {
  const { actor } = await getAiActor();
  try {
    return { ok: true, ...(await improveText(actor, input)) };
  } catch (error) {
    return fail("improveTextAction", error);
  }
}

/** Segment rules from a description. The user still reviews and saves them. */
export async function describeSegmentAction(description: unknown): Promise<AiActionResult<SegmentSuggestion>> {
  const { ws, actor } = await getAiActor();
  try {
    return { ok: true, ...(await describeSegment(ws, actor, description)) };
  } catch (error) {
    return fail("describeSegmentAction", error);
  }
}

/** The best ready-made automation for a description (or the closest one). */
export async function describeAutomationAction(
  description: unknown,
): Promise<AiActionResult<{ suggestion: AutomationSuggestion }>> {
  const { ws, actor } = await getAiActor();
  try {
    return { ok: true, suggestion: await describeAutomation(ws, actor, description) };
  } catch (error) {
    return fail("describeAutomationAction", error);
  }
}

/**
 * The "Create automation" form on the AI-prefilled recipe page: creates the
 * draft with the chosen list/form/date field, then opens the builder.
 */
export async function createAutomationFromAiForm(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const field = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" ? v.slice(0, 500) : undefined;
  };
  let automationId: string;
  try {
    const result = await createAutomationWithSetting(ws, user.id, {
      recipeId: field("recipeId"),
      name: field("name"),
      setting: field("setting") ?? "",
    });
    if (!result.ok) return { error: result.error };
    automationId = result.automationId;
  } catch (error) {
    console.error("createAutomationFromAiForm failed:", error instanceof Error ? error.message : error);
    return { error: "Something went wrong. Please try again." };
  }
  // redirect() works by throwing, so it must be outside the try/catch.
  redirect(`/automations/${automationId}`);
}

/** A plain-English summary of a sent campaign's results + 3 suggestions. */
export async function explainReportAction(campaignId: unknown): Promise<AiActionResult<Explanation>> {
  const { ws, actor } = await getAiActor();
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    return { ok: true, ...(await explainReport(ws, actor, id.data)) };
  } catch (error) {
    return fail("explainReportAction", error);
  }
}
