import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { AiError } from "@/lib/ai/errors";
import {
  buildGeneratedCampaign,
  campaignAnswerSchema,
  campaignPrompt,
} from "@/lib/ai/features/campaign";
import { acceptAutomation, automationAnswerSchema, automationPrompt, type AutomationSuggestion } from "@/lib/ai/features/automation";
import { acceptExplanation, explainAnswerSchema, explainPrompt, linkForAi, type Explanation, type ReportFacts } from "@/lib/ai/features/explain";
import { acceptImproved, improveAnswerSchema, improvePrompt, prepareImprove } from "@/lib/ai/features/improve";
import { acceptSegment, segmentAnswerSchema, segmentPrompt, type SegmentSuggestion } from "@/lib/ai/features/segment";
import { acceptSubjects, campaignContentForAi, subjectsAnswerSchema, subjectsPrompt } from "@/lib/ai/features/subjects";
import { describeInputSchema, generateCampaignInputSchema, improveTextInputSchema } from "@/lib/ai/inputs";
import {
  applyRecipeSetting,
  findRecipe,
  loadRecipeOptions,
  recipeSettingKind,
  validSettingValue,
} from "@/lib/ai/recipe-settings";
import { runAiFeature, type AiActor } from "@/lib/ai/run";
import { createAutomation, type AutomationResult } from "@/lib/automations/queries";
import { stepsSchema, triggerSchema } from "@/lib/automations/schema";
import { getBrandTheme } from "@/lib/brand-kit";
import { CampaignError, createCampaign, updateCampaignDraft } from "@/lib/campaigns/queries";
import { getAttributeDefinitions, getListOptions } from "@/lib/contacts/lookups";
import { db } from "@/lib/db";
import { dayKey, normalizeDatePrefs } from "@/lib/format-date";
import { loadRulesContext } from "@/lib/segments/engine";
import { listSegmentCampaignOptions } from "@/lib/segments/queries";
import { validateDocument } from "@/lib/templates/queries";
import { getCampaignReport } from "@/lib/tracking/reports";

// The AI features, start to finish, WITHOUT the session part: the Server
// Actions (src/app/actions/ai.ts) work out the workspace and user from the
// session and call these. Keeping them separate lets us test them directly.
//
// SECURITY: `ws` must come from requireActiveWorkspace() and `actor` from the
// session. Every query here filters by that workspace id.

type Ws = { id: string; name: string };

const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Please check what you typed.";

async function workspaceTimezone(workspaceId: string): Promise<string> {
  const row = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { timezone: true, dateFormat: true, timeFormat: true },
  });
  return normalizeDatePrefs(row).timezone;
}

// ── 1. Generate campaign ────────────────────────────────────────────────────

/** Writes the email with AI and saves it as a new DRAFT campaign. Returns its id. */
export async function generateCampaign(ws: Ws, actor: AiActor, input: unknown): Promise<{ id: string }> {
  const parsed = generateCampaignInputSchema.safeParse(input);
  if (!parsed.success) throw new AiError("invalid_input", firstIssue(parsed.error));
  const { about, tone, language, buttonText, buttonUrl } = parsed.data;

  const theme = await getBrandTheme(ws);
  const prompt = campaignPrompt({ about, tone, language, hasButton: !!buttonUrl, buttonText, companyName: theme.companyName });

  const generated = await runAiFeature(actor, "generate_campaign", {
    ...prompt,
    maxTokens: 1200,
    temperature: 0.7,
    schema: campaignAnswerSchema,
    accept: (answer) => {
      const result = buildGeneratedCampaign(answer, { theme, buttonUrl, buttonText, fallbackName: "AI campaign" });
      // The same check every saved design goes through.
      const checked = validateDocument(result.document);
      if (!checked.ok) throw new AiError("bad_output");
      return { ...result, document: checked.document };
    },
  });

  // Created exactly like "Create campaign" does (sender default, brand…),
  // then filled with the AI's words. Both steps validate their input.
  const { id } = await createCampaign(ws, actor.userId, { name: generated.name });
  const saved = await updateCampaignDraft(ws.id, id, {
    subject: generated.subject,
    preheader: generated.preheader,
    document: generated.document,
  });
  if (!saved.ok) {
    await db.campaign.deleteMany({ where: { id, workspaceId: ws.id, status: "DRAFT" } });
    throw new CampaignError(saved.error);
  }
  return { id };
}

// ── 2. Subject line ideas ───────────────────────────────────────────────────

export async function suggestSubjects(ws: Ws, actor: AiActor, campaignId: string): Promise<{ subjects: string[]; preheader: string }> {
  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, workspaceId: ws.id },
    select: { name: true, subject: true, document: true, html: true },
  });
  if (!campaign) throw new AiError("invalid_input", "This campaign doesn't exist (or was deleted).");

  const content = campaignContentForAi(campaign);
  return runAiFeature(actor, "subject_ideas", {
    ...subjectsPrompt({ name: campaign.name, content, currentSubject: campaign.subject }),
    maxTokens: 400,
    temperature: 0.9,
    schema: subjectsAnswerSchema,
    accept: acceptSubjects,
  });
}

// ── 3. Improve text ─────────────────────────────────────────────────────────

/** Rewrites one block's text. Returns the new HTML (heading/text) or label (button). */
export async function improveText(actor: AiActor, input: unknown): Promise<{ content: string }> {
  const parsed = improveTextInputSchema.safeParse(input);
  if (!parsed.success) throw new AiError("invalid_input", firstIssue(parsed.error));
  const { blockType, action, content } = parsed.data;
  if (!content.replace(/<[^>]*>/g, "").trim()) throw new AiError("invalid_input", "This block has no text to improve yet.");

  const prepared = prepareImprove(content);
  const result = await runAiFeature(actor, "improve_text", {
    ...improvePrompt({ blockType, action, protectedContent: prepared.text }),
    // Room for a translation (Devanagari takes more tokens than English).
    maxTokens: Math.min(4000, 400 + Math.ceil(content.length * 1.5)),
    temperature: action === "fix" ? 0.1 : 0.5,
    schema: improveAnswerSchema,
    accept: (answer) => acceptImproved(blockType, content, prepared.restore, answer),
  });
  return { content: result };
}

// ── 4. Segment from a description ───────────────────────────────────────────

export async function describeSegment(ws: Ws, actor: AiActor, description: unknown): Promise<SegmentSuggestion> {
  const parsed = describeInputSchema.safeParse(description);
  if (!parsed.success) throw new AiError("invalid_input", firstIssue(parsed.error));

  const [attributes, lists, campaigns, rulesContext, timezone] = await Promise.all([
    getAttributeDefinitions(ws.id),
    getListOptions(ws.id),
    listSegmentCampaignOptions(ws.id),
    loadRulesContext(ws.id),
    workspaceTimezone(ws.id),
  ]);
  const ctx = {
    attributes: attributes.map((a) => ({ key: a.key, label: a.label, type: a.type })),
    lists,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
    today: dayKey(new Date(), timezone),
  };

  return runAiFeature(actor, "segment", {
    ...segmentPrompt(parsed.data, ctx),
    maxTokens: 700,
    temperature: 0.1,
    schema: segmentAnswerSchema,
    accept: (answer) => acceptSegment(answer, ctx, rulesContext),
  });
}

// ── 5. Automation from a description ────────────────────────────────────────

export async function describeAutomation(ws: Ws, actor: AiActor, description: unknown): Promise<AutomationSuggestion> {
  const parsed = describeInputSchema.safeParse(description);
  if (!parsed.success) throw new AiError("invalid_input", firstIssue(parsed.error));
  const options = await loadRecipeOptions(ws.id);
  return runAiFeature(actor, "automation", {
    ...automationPrompt(parsed.data, options),
    maxTokens: 400,
    temperature: 0.1,
    schema: automationAnswerSchema,
    accept: (answer) => acceptAutomation(answer, options),
  });
}

/**
 * Creates a DRAFT automation from a recipe (exactly like the normal "Create
 * automation" button), then puts in the setting the user confirmed (which
 * list / form / date field). The setting is checked against this workspace.
 */
export async function createAutomationWithSetting(
  ws: Ws,
  userId: string,
  input: { recipeId: unknown; name: unknown; setting: unknown },
): Promise<AutomationResult<{ automationId: string }>> {
  const recipe = findRecipe(input.recipeId);
  if (!recipe) return { ok: false, error: "That ready-made automation wasn't found." };

  const kind = recipeSettingKind(recipe);
  let value: string | null = null;
  if (kind && typeof input.setting === "string" && input.setting !== "") {
    value = validSettingValue(kind, input.setting, await loadRecipeOptions(ws.id));
    if (!value) return { ok: false, error: "That choice no longer exists. Please pick another one." };
  }

  const created = await createAutomation(ws, userId, { recipeId: recipe.id, name: input.name });
  if (!created.ok) return created;

  const row = await db.automation.findFirst({
    where: { id: created.automationId, workspaceId: ws.id },
    select: { trigger: true, steps: true },
  });
  const trigger = triggerSchema.safeParse(row?.trigger);
  const steps = stepsSchema.safeParse(row?.steps);
  if (!trigger.success || !steps.success) return created;

  const changed = applyRecipeSetting(trigger.data, steps.data, kind, value);
  if (changed) {
    const t = triggerSchema.safeParse(changed.trigger);
    const s = stepsSchema.safeParse(changed.steps);
    if (t.success && s.success) {
      await db.automation.updateMany({
        where: { id: created.automationId, workspaceId: ws.id, status: "DRAFT" },
        data: { trigger: t.data as Prisma.InputJsonValue, steps: s.data as unknown as Prisma.InputJsonValue },
      });
    }
  }
  return created;
}

// ── 6. Explain my results ───────────────────────────────────────────────────

/** Totals only: nothing about any single contact. */
export async function reportFactsFor(ws: Ws, campaignId: string): Promise<ReportFacts> {
  const report = await getCampaignReport(ws.id, campaignId);
  if (!report) throw new AiError("invalid_input", "This campaign doesn't exist (or was deleted).");
  if (report.stats.sentCount === 0) throw new AiError("invalid_input", "There are no results to explain yet: nothing has been sent.");

  let sentAt: string | null = null;
  if (report.startedAt) {
    const timezone = await workspaceTimezone(ws.id);
    const when = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date(report.startedAt));
    sentAt = `${when} (${timezone})`;
  }

  const topLinks = report.topLinks
    .slice(0, 5)
    .map((l) => ({ url: linkForAi(l.url), clicks: l.clicks, uniqueClicks: l.uniqueClicks }))
    .filter((l): l is { url: string; clicks: number; uniqueClicks: number } => l.url !== null);

  return {
    status: report.status,
    sent: report.stats.sentCount,
    delivered: report.rates.delivered,
    uniqueOpens: report.stats.openCount,
    uniqueClicks: report.stats.clickCount,
    openRate: report.rates.openRate,
    clickRate: report.rates.clickRate,
    clickToOpenRate: report.rates.clickToOpen,
    hardBounces: report.bounces.hard,
    softBounces: report.bounces.soft,
    bounceRate: report.rates.bounceRate,
    complaints: report.stats.complaintCount,
    complaintRate: report.rates.complaintRate,
    unsubscribes: report.stats.unsubscribeCount,
    unsubscribeRate: report.rates.unsubscribeRate,
    opensTracked: report.trackOpens,
    clicksTracked: report.trackClicks,
    automatedOpensExcluded: report.totals.botOpens,
    sentAt,
    topLinks,
  };
}

export async function explainReport(ws: Ws, actor: AiActor, campaignId: string): Promise<Explanation> {
  const facts = await reportFactsFor(ws, campaignId);
  return runAiFeature(actor, "explain_report", {
    ...explainPrompt(facts),
    maxTokens: 600,
    temperature: 0.4,
    schema: explainAnswerSchema,
    accept: acceptExplanation,
  });
}
