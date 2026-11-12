"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { audienceSchema } from "@/lib/campaigns/audience";
import { preflightCampaign, type PreflightProblem, type PreflightResult } from "@/lib/campaigns/checks";
import {
  cancelCampaign,
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
  sendCampaignTest,
  unscheduleCampaign,
  type LaunchResult,
} from "@/lib/campaigns/launch";
import {
  CampaignError,
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaignProgress,
  listCampaignRecipients,
  updateCampaignDraft,
  validateAudienceForWorkspace,
  type CampaignProgress,
  type RecipientsPage,
} from "@/lib/campaigns/queries";
import {
  AudienceError,
  countAudience,
  countSegmentSubscribed,
  type AudienceCount,
} from "@/lib/campaigns/resolve-audience";
import { getListsWithCounts } from "@/lib/contacts/lists";
import { getCampaignReport, type CampaignReport } from "@/lib/tracking/reports";
import { getVerifiedSenders } from "@/lib/email/senders";
import { listSegments } from "@/lib/segments/queries";
import { listTemplates } from "@/lib/templates/queries";
import { STARTERS, type StarterMeta } from "@/lib/templates/starters";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for Campaigns: thin wrappers over src/lib/campaigns/*.
//
// Server Actions are public endpoints: anyone can call them with any input.
// So every action (1) works out the workspace from the session with
// requireActiveWorkspace(), (2) checks its input with zod, and (3) passes
// browser ids only TOGETHER with that workspace id (another workspace's id
// finds nothing). Results are always { ok: true, … } or { ok: false, error }.
//
// refresh() re-renders the current page after changes the page shows (status,
// lists). The draft autosave (updateCampaignDraftAction) does NOT refresh: the
// editor already shows what was saved.
//
// WHO CAN DO WHAT: any member can create, edit, test, launch, pause, resume,
// cancel and unschedule. Delete: OWNER/ADMIN any campaign, a MEMBER only their own.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SERVER_ERROR = "Something went wrong. Please try again.";
const INVALID = "Invalid request.";

const idSchema = z.string().trim().min(1).max(64);

/** Logs unexpected errors; CampaignError messages are meant for the user. */
function fail(where: string, error: unknown): { ok: false; error: string } {
  if (error instanceof CampaignError) return { ok: false, error: error.message };
  console.error(`${where} failed:`, error);
  return { ok: false, error: SERVER_ERROR };
}

// ── Create / edit / duplicate / delete ──────────────────────────────────────

const CreateSchema = z.object({
  name: z.string().max(200).optional(),
  templateId: idSchema.nullish(),
  starterId: z.string().trim().max(64).nullish(),
});

/** New DRAFT from a template, a starter, or blank. Returns its id so the page can open it. */
export async function createCampaignAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const parsed = CreateSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: INVALID };
  try {
    const { id } = await createCampaign(ws, user.id, {
      name: parsed.data.name,
      templateId: parsed.data.templateId || null,
      starterId: parsed.data.starterId || null,
    });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail("createCampaignAction", error);
  }
}

const PatchSchema = z
  .object({
    name: z.string().max(500),
    subject: z.string().max(2000),
    preheader: z.string().max(2000),
    senderId: idSchema.nullable(),
    audience: audienceSchema,
    // The design is checked in full by updateCampaignDraft (validateDocument).
    document: z.unknown(),
    // Phase 5 tracking switches (DRAFT only, like every field here).
    trackOpens: z.boolean(),
    trackClicks: z.boolean(),
  })
  .partial()
  .strict();

/** Saves changes to a DRAFT (autosave). Only the fields sent are changed. */
export async function updateCampaignDraftAction(campaignId: unknown, patch: unknown): Promise<ActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(campaignId);
  const parsed = PatchSchema.safeParse(patch ?? {});
  if (!id.success || !parsed.success) return { ok: false, error: INVALID };
  try {
    return await updateCampaignDraft(ws.id, id.data, parsed.data);
  } catch (error) {
    return fail("updateCampaignDraftAction", error);
  }
}

export async function duplicateCampaignAction(campaignId: unknown): Promise<ActionResult<{ id: string }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    const copy = await duplicateCampaign(ws.id, user.id, id.data);
    refresh();
    return { ok: true, id: copy.id };
  } catch (error) {
    return fail("duplicateCampaignAction", error);
  }
}

export async function deleteCampaignAction(campaignId: unknown): Promise<ActionResult> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    const result = await deleteCampaign(ws.id, id.data, { role: ws.role, userId: user.id });
    if (result.ok) refresh();
    return result;
  } catch (error) {
    return fail("deleteCampaignAction", error);
  }
}

// ── Checks and launching ────────────────────────────────────────────────────

const ScheduleSchema = z.object({
  // An ISO date string (or Date) for "schedule", null/absent for "send now".
  // The browser converts the user's local date/time to this instant.
  scheduledAt: z.union([z.null(), z.coerce.date()]).optional(),
});

/**
 * The pre-send checklist: { ok: true, result: PreflightResult }. (`ok: false`
 * only means the checks couldn't run; the checks' own verdict is result.ok.)
 * Pass `scheduledAt` to also check a chosen time.
 */
export async function preflightCampaignAction(
  campaignId: unknown,
  input?: unknown,
): Promise<ActionResult<{ result: PreflightResult }>> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(campaignId);
  const opts = ScheduleSchema.safeParse(input ?? {});
  if (!id.success || !opts.success) return { ok: false, error: INVALID };
  try {
    return { ok: true, result: await preflightCampaign(ws.id, id.data, user.id, { scheduledAt: opts.data.scheduledAt ?? null }) };
  } catch (error) {
    return fail("preflightCampaignAction", error);
  }
}

/**
 * Send now (no scheduledAt) or schedule. Returns `problems` from the checks
 * if anything blocks it; nothing changes in that case.
 */
export async function launchCampaignAction(
  campaignId: unknown,
  input?: unknown,
): Promise<{ ok: true; status: "SCHEDULED" | "SENDING" } | { ok: false; error: string; problems?: PreflightProblem[] }> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(campaignId);
  const opts = ScheduleSchema.safeParse(input ?? {});
  if (!id.success || !opts.success) return { ok: false, error: INVALID };
  try {
    const result: LaunchResult = await launchCampaign(ws, id.data, user.id, { scheduledAt: opts.data.scheduledAt ?? null });
    refresh();
    if (result.ok) return result;
    return {
      ok: false,
      error: result.problems[0]?.message ?? "This campaign can't be sent yet.",
      problems: result.problems,
    };
  } catch (error) {
    return fail("launchCampaignAction", error);
  }
}

/** Shared wrapper for pause / resume / cancel / unschedule. */
async function stateAction(
  where: string,
  campaignId: unknown,
  run: (wsId: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>,
): Promise<ActionResult> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    const result = await run(ws.id, id.data);
    refresh();
    return result;
  } catch (error) {
    return fail(where, error);
  }
}

export async function pauseCampaignAction(campaignId: unknown): Promise<ActionResult> {
  return stateAction("pauseCampaignAction", campaignId, pauseCampaign);
}

export async function resumeCampaignAction(campaignId: unknown): Promise<ActionResult> {
  return stateAction("resumeCampaignAction", campaignId, resumeCampaign);
}

export async function cancelCampaignAction(campaignId: unknown): Promise<ActionResult> {
  return stateAction("cancelCampaignAction", campaignId, cancelCampaign);
}

export async function unscheduleCampaignAction(campaignId: unknown): Promise<ActionResult> {
  return stateAction("unscheduleCampaignAction", campaignId, unscheduleCampaign);
}

const TestSchema = z.object({ to: z.string().max(320) });

/** Sends the campaign to one address as a test (max 20 test emails per user per hour). */
/** { ok, message }: the message says what happened either way. */
export async function sendCampaignTestAction(campaignId: unknown, input: unknown): Promise<{ ok: boolean; message: string }> {
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const id = idSchema.safeParse(campaignId);
  const parsed = TestSchema.safeParse(input ?? {});
  if (!id.success || !parsed.success) return { ok: false, message: INVALID };
  try {
    return await sendCampaignTest(ws, user.id, id.data, { to: parsed.data.to });
  } catch (error) {
    console.error("sendCampaignTestAction failed:", error);
    return { ok: false, message: "Couldn't send the test email. Please try again." };
  }
}

// ── Progress (for live polling) ─────────────────────────────────────────────

export async function getCampaignProgressAction(campaignId: unknown): Promise<ActionResult<{ progress: CampaignProgress }>> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    const progress = await getCampaignProgress(ws.id, id.data);
    return progress ? { ok: true, progress } : { ok: false, error: "This campaign doesn't exist (or was deleted)." };
  } catch (error) {
    return fail("getCampaignProgressAction", error);
  }
}

const RecipientsQuerySchema = z.object({
  status: z.string().max(20).optional(),
  // "opened", "clicked", "not_opened", "bounced", "complained", "unsubscribed" (anything else is ignored).
  engagement: z.string().max(20).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
});

export async function listCampaignRecipientsAction(
  campaignId: unknown,
  input?: unknown,
): Promise<ActionResult<{ page: RecipientsPage }>> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(campaignId);
  const parsed = RecipientsQuerySchema.safeParse(input ?? {});
  if (!id.success || !parsed.success) return { ok: false, error: INVALID };
  try {
    return { ok: true, page: await listCampaignRecipients(ws.id, id.data, parsed.data) };
  } catch (error) {
    return fail("listCampaignRecipientsAction", error);
  }
}

/**
 * The campaign report (opens, clicks, bounces, timeline, top links), for the
 * status page's refresh. Read-only, and scoped to the active workspace.
 */
export async function getCampaignReportAction(campaignId: unknown): Promise<ActionResult<{ report: CampaignReport }>> {
  const ws = await requireActiveWorkspace();
  const id = idSchema.safeParse(campaignId);
  if (!id.success) return { ok: false, error: INVALID };
  try {
    const report = await getCampaignReport(ws.id, id.data);
    return report ? { ok: true, report } : { ok: false, error: "This campaign doesn't exist (or was deleted)." };
  } catch (error) {
    return fail("getCampaignReportAction", error);
  }
}

// ── Pickers for the campaign editor ─────────────────────────────────────────

/** Live "N people will get this" for the audience picker: { ok, count: { recipients, perSource } }. */
export async function getAudienceCountAction(audience: unknown): Promise<ActionResult<{ count: AudienceCount }>> {
  const ws = await requireActiveWorkspace();
  try {
    // Rejects lists/segments from other workspaces (instead of quietly ignoring them).
    const checked = await validateAudienceForWorkspace(ws.id, audience);
    if (!checked.ok) return checked;
    return { ok: true, count: await countAudience(ws.id, checked.audience) };
  } catch (error) {
    if (error instanceof AudienceError) return { ok: false, error: error.message };
    return fail("getAudienceCountAction", error);
  }
}

export type AudienceSources = {
  lists: { id: string; name: string; totalMembers: number; subscribed: number }[];
  /** `subscribed` is null if the segment's rules no longer work. */
  segments: { id: string; name: string; subscribed: number | null }[];
};

/**
 * The workspace's lists and segments, each with how many SUBSCRIBED contacts
 * it has (the only ones a campaign can reach), for the audience picker.
 */
export async function getAudienceSourcesAction(): Promise<ActionResult<{ sources: AudienceSources }>> {
  const ws = await requireActiveWorkspace();
  try {
    const [lists, segments] = await Promise.all([getListsWithCounts(ws.id), listSegments(ws.id)]);
    const counts = await Promise.all(segments.map((s) => countSegmentSubscribed(ws.id, s.rules)));
    return {
      ok: true,
      sources: {
        lists: lists.map((l) => ({ id: l.id, name: l.name, totalMembers: l.totalMembers, subscribed: l.subscribedMembers })),
        segments: segments.map((s, i) => ({ id: s.id, name: s.name, subscribed: counts[i] })),
      },
    };
  } catch (error) {
    return fail("getAudienceSourcesAction", error);
  }
}

/** Verified senders only: the only ones a campaign may use. */
export async function getSendersForCampaignAction(): Promise<
  ActionResult<{ senders: { id: string; email: string; name: string; replyTo: string | null }[] }>
> {
  const ws = await requireActiveWorkspace();
  try {
    const senders = await getVerifiedSenders(ws.id);
    return { ok: true, senders: senders.map(({ id, email, name, replyTo }) => ({ id, email, name, replyTo })) };
  } catch (error) {
    return fail("getSendersForCampaignAction", error);
  }
}

/** Saved templates (light fields) and the starter library, for "choose content". */
export async function getTemplatesForCampaignAction(): Promise<
  ActionResult<{ templates: { id: string; name: string; subject: string; updatedAt: Date }[]; starters: StarterMeta[] }>
> {
  const ws = await requireActiveWorkspace();
  try {
    const templates = await listTemplates(ws.id);
    return {
      ok: true,
      templates: templates.map(({ id, name, subject, updatedAt }) => ({ id, name, subject, updatedAt })),
      starters: STARTERS,
    };
  } catch (error) {
    return fail("getTemplatesForCampaignAction", error);
  }
}
