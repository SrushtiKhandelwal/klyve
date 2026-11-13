import "server-only";
import { z } from "zod";
import { getBrandTheme } from "@/lib/brand-kit";
import { db } from "@/lib/db";
import { getListOptions } from "@/lib/contacts/lookups";
import { getVerifiedSenders } from "@/lib/email/senders";
import { emptyDocument } from "@/lib/templates/document";
import {
  newStepId,
  stepsSchema,
  triggerSchema,
  type AutomationStep,
  type AutomationTrigger,
} from "@/lib/automations/schema";
import { buildRecipe, RECIPES } from "@/lib/automations/recipes";
import { MANUAL_ENROLL_MAX } from "@/lib/automations/triggers";

// Data Access Layer for the automation BUILDER screens (list, builder, create).
// The engine side (activate, pause, save drafts, enrol…) lives in lifecycle.ts.
//
// SECURITY (multi-tenant isolation): every function takes the workspace FIRST
// and every query filters by it. ONLY pass the workspace from
// requireActiveWorkspace(). An automation id from the browser is always used
// together with that workspace id, so another workspace's id finds nothing.

export const AUTOMATION_LIMITS = {
  /** Automations per workspace. Plenty for real use; stops runaway scripts. */
  maxPerWorkspace: 50,
  nameMax: 100,
} as const;

type WorkspaceRef = { id: string; name?: string };

export type AutomationStatusValue = "DRAFT" | "ACTIVE" | "PAUSED";
export type AutomationResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Line breaks in a name would look broken everywhere it's shown.
export const automationNameSchema = z
  .string()
  .trim()
  .min(1, "Give the automation a name.")
  .max(AUTOMATION_LIMITS.nameMax, `Keep the name under ${AUTOMATION_LIMITS.nameMax} characters.`)
  .refine((v) => ![...v].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f), "The name can't contain line breaks.");

const LIMIT_REACHED = `You've reached the limit of ${AUTOMATION_LIMITS.maxPerWorkspace} automations. Delete one you no longer need first.`;
const NOT_FOUND = "This automation doesn't exist (or was deleted).";

// ── Reading stored JSON safely ──────────────────────────────────────────────
// trigger/steps were validated when saved, but parse again so a bad row (e.g.
// edited by hand, or saved by an older version) can't crash the builder.

export function readTrigger(json: unknown): AutomationTrigger {
  const parsed = triggerSchema.safeParse(json);
  return parsed.success ? parsed.data : { type: "manual" };
}

export function readSteps(json: unknown): AutomationStep[] {
  const parsed = stepsSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type AutomationListItem = {
  id: string;
  name: string;
  status: AutomationStatusValue;
  trigger: AutomationTrigger;
  /** How many steps (all branches), for "3 steps". */
  stepCount: number;
  /** People in it right now (running or waiting). */
  activeCount: number;
  completedCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** All automations in the workspace, newest first, with live people counts. */
export async function listAutomations(ws: WorkspaceRef): Promise<AutomationListItem[]> {
  const rows = await db.automation.findMany({
    where: { workspaceId: ws.id },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: AUTOMATION_LIMITS.maxPerWorkspace,
    select: { id: true, name: true, status: true, trigger: true, steps: true, createdAt: true, updatedAt: true },
  });
  if (rows.length === 0) return [];

  // ONE grouped count for all cards (not one query per automation). The ids
  // were just read with the workspace filter, so they're all ours.
  const counts = await db.automationRun.groupBy({
    by: ["automationId", "status"],
    where: { automationId: { in: rows.map((r) => r.id) }, status: { in: ["ACTIVE", "WAITING", "COMPLETED"] } },
    _count: { _all: true },
  });
  const tally = new Map<string, { active: number; completed: number }>();
  for (const c of counts) {
    const t = tally.get(c.automationId) ?? { active: 0, completed: 0 };
    if (c.status === "COMPLETED") t.completed += c._count._all;
    else t.active += c._count._all;
    tally.set(c.automationId, t);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    trigger: readTrigger(r.trigger),
    stepCount: countSteps(readSteps(r.steps)),
    activeCount: tally.get(r.id)?.active ?? 0,
    completedCount: tally.get(r.id)?.completed ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

function countSteps(steps: AutomationStep[]): number {
  return steps.reduce((n, s) => n + 1 + (s.type === "condition" ? countSteps(s.yes) + countSteps(s.no) : 0), 0);
}

export type AutomationDetail = {
  id: string;
  name: string;
  status: AutomationStatusValue;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  allowReentry: boolean;
  recipeId: string | null;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** One automation with its workflow, or null if it doesn't exist in this workspace. */
export async function getAutomation(ws: WorkspaceRef, automationId: string): Promise<AutomationDetail | null> {
  if (typeof automationId !== "string" || automationId.length === 0 || automationId.length > 64) return null;
  const row = await db.automation.findFirst({
    where: { id: automationId, workspaceId: ws.id },
    select: {
      id: true,
      name: true,
      status: true,
      trigger: true,
      steps: true,
      allowReentry: true,
      recipeId: true,
      activatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) return null;
  return { ...row, trigger: readTrigger(row.trigger), steps: readSteps(row.steps) };
}

// ── Creating ────────────────────────────────────────────────────────────────

export type CreateAutomationInput = { name?: unknown; recipeId?: unknown };

/**
 * Creates a DRAFT automation, either from a ready-made recipe or as a blank
 * workflow: "when someone joins <first list>" (or "manual" if there are no
 * lists yet) → one "Send email" step in the brand's colours.
 */
export async function createAutomation(
  ws: WorkspaceRef,
  userId: string,
  input: CreateAutomationInput,
): Promise<AutomationResult<{ automationId: string }>> {
  const recipeId = typeof input.recipeId === "string" && input.recipeId ? input.recipeId : null;
  if (recipeId && !RECIPES.some((r) => r.id === recipeId)) return { ok: false, error: "That ready-made automation wasn't found." };

  const count = await db.automation.count({ where: { workspaceId: ws.id } });
  if (count >= AUTOMATION_LIMITS.maxPerWorkspace) return { ok: false, error: LIMIT_REACHED };

  const [theme, lists, senders, forms, dateFields] = await Promise.all([
    getBrandTheme(ws),
    getListOptions(ws.id),
    getVerifiedSenders(ws.id),
    db.signupForm.findMany({ where: { workspaceId: ws.id }, orderBy: { updatedAt: "desc" }, select: { id: true }, take: 1 }),
    db.contactAttribute.findMany({ where: { workspaceId: ws.id, type: "DATE" }, orderBy: { createdAt: "asc" }, select: { key: true } }),
  ]);
  const senderId = senders[0]?.id ?? null;
  const listId = lists[0]?.id ?? null;

  let name: string;
  let trigger: AutomationTrigger;
  let steps: AutomationStep[];
  let allowReentry = false;

  if (recipeId) {
    // Pre-filled with this workspace's first list/form/sender, so many recipes
    // are ready to turn on. Gaps are left for the user to choose (see recipes).
    const birthdayKey = dateFields.find((f) => f.key.includes("BIRTH"))?.key ?? dateFields[0]?.key ?? null;
    const built = buildRecipe(recipeId, { theme, senderId, listId, formId: forms[0]?.id ?? null, birthdayKey });
    if (!built) return { ok: false, error: "That ready-made automation wasn't found." };
    name = built.name;
    trigger = built.trigger;
    steps = built.steps;
    allowReentry = built.allowReentry;
  } else {
    name = "Untitled automation";
    trigger = listId ? { type: "list_joined", listId } : { type: "manual" };
    steps = [
      {
        id: newStepId(),
        type: "send_email",
        name: "Welcome email",
        subject: "",
        preheader: "",
        senderId,
        document: emptyDocument(theme),
      },
    ];
  }

  // A name typed by the user wins over the default/recipe name.
  if (input.name !== undefined && input.name !== "") {
    const parsedName = automationNameSchema.safeParse(input.name);
    if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0]?.message ?? "Check the name." };
    name = parsedName.data;
  }

  // Never store a workflow the builder/engine can't read back.
  const t = triggerSchema.safeParse(trigger);
  const s = stepsSchema.safeParse(steps);
  if (!t.success || !s.success) {
    console.error("createAutomation: invalid workflow", recipeId, t.error?.issues[0], s.error?.issues[0]);
    return { ok: false, error: "This automation couldn't be created. Please try again." };
  }

  const row = await db.automation.create({
    data: {
      workspaceId: ws.id,
      name: automationNameSchema.safeParse(name).success ? name.trim() : "Untitled automation",
      trigger: t.data,
      steps: s.data,
      allowReentry,
      recipeId,
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, automationId: row.id };
}

/** A copy (as a DRAFT, "… (copy)"), with fresh step ids so reports never mix them up. */
export async function duplicateAutomation(
  ws: WorkspaceRef,
  userId: string,
  automationId: string,
): Promise<AutomationResult<{ automationId: string }>> {
  const source = await getAutomation(ws, automationId);
  if (!source) return { ok: false, error: NOT_FOUND };
  const count = await db.automation.count({ where: { workspaceId: ws.id } });
  if (count >= AUTOMATION_LIMITS.maxPerWorkspace) return { ok: false, error: LIMIT_REACHED };

  const steps = withFreshStepIds(source.steps);
  const suffix = " (copy)";
  const row = await db.automation.create({
    data: {
      workspaceId: ws.id,
      name: source.name.slice(0, AUTOMATION_LIMITS.nameMax - suffix.length) + suffix,
      trigger: source.trigger,
      steps,
      allowReentry: source.allowReentry,
      recipeId: source.recipeId,
      createdById: userId,
    },
    select: { id: true },
  });
  return { ok: true, automationId: row.id };
}

/**
 * New ids for every step, keeping "if they opened <email>" conditions pointing
 * at the COPY of that email.
 */
export function withFreshStepIds(steps: AutomationStep[]): AutomationStep[] {
  const map = new Map<string, string>();
  const assign = (list: AutomationStep[]) => {
    for (const s of list) {
      map.set(s.id, newStepId());
      if (s.type === "condition") {
        assign(s.yes);
        assign(s.no);
      }
    }
  };
  assign(steps);
  const copy = (list: AutomationStep[]): AutomationStep[] =>
    list.map((s): AutomationStep => {
      const id = map.get(s.id) ?? newStepId();
      if (s.type !== "condition") return { ...s, id };
      const condition =
        s.condition.kind === "email_activity"
          ? { ...s.condition, stepId: map.get(s.condition.stepId) ?? s.condition.stepId }
          : s.condition;
      return { ...s, id, condition, yes: copy(s.yes), no: copy(s.no) };
    });
  return copy(steps);
}

/** Renaming is always allowed (even while it runs): the name only labels it. */
export async function renameAutomation(ws: WorkspaceRef, automationId: string, name: unknown): Promise<AutomationResult> {
  const parsed = automationNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the name." };
  const result = await db.automation.updateMany({
    where: { id: automationId, workspaceId: ws.id },
    data: { name: parsed.data },
  });
  return result.count === 1 ? { ok: true } : { ok: false, error: NOT_FOUND };
}

// ── Names for the plain-English summaries ───────────────────────────────────

export type AutomationLookups = {
  lists: { id: string; name: string }[];
  segments: { id: string; name: string }[];
  forms: { id: string; name: string }[];
  attributes: { key: string; label: string; type: string }[];
};

/** Lists, segments, forms and custom fields of this workspace (names only). */
export async function getAutomationLookups(ws: WorkspaceRef): Promise<AutomationLookups> {
  const [lists, segments, forms, attributes] = await Promise.all([
    getListOptions(ws.id),
    db.segment.findMany({ where: { workspaceId: ws.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.signupForm.findMany({ where: { workspaceId: ws.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.contactAttribute.findMany({
      where: { workspaceId: ws.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { key: true, label: true, type: true },
    }),
  ]);
  return { lists, segments, forms, attributes };
}

// ── Manual enrolment helpers ────────────────────────────────────────────────

/** Most people that can be added by hand in one go (the engine's own limit). */
export const MANUAL_ENROLL_CAP = MANUAL_ENROLL_MAX;

/**
 * Subscribed contact ids in a list of THIS workspace, at most cap + 1 (so the
 * caller can tell "too many"). null = the list isn't in this workspace.
 */
export async function listContactIdsForEnrolment(ws: WorkspaceRef, listId: string, cap = MANUAL_ENROLL_CAP): Promise<string[] | null> {
  const list = await db.contactList.findFirst({ where: { id: listId, workspaceId: ws.id }, select: { id: true } });
  if (!list) return null;
  const rows = await db.listMembership.findMany({
    where: { listId: list.id, contact: { workspaceId: ws.id, status: "SUBSCRIBED" } },
    select: { contactId: true },
    orderBy: { contactId: "asc" },
    take: cap + 1,
  });
  return rows.map((r) => r.contactId);
}
