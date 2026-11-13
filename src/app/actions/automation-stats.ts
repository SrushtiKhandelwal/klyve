"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { enrollContacts } from "@/lib/automations/lifecycle";
import { triggerSchema } from "@/lib/automations/schema";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the "Automations" card on a contact's page: add the
// person to an automation by hand, or take them out of one.
//
// Server Actions are public endpoints, so the workspace always comes from the
// session (requireActiveWorkspace), never from the browser, and every id from
// the browser is looked up TOGETHER with that workspace. Another workspace's
// contact, automation or run simply isn't found.

export type AutomationCardResult = { ok: true; message: string } | { ok: false; message: string };

const idSchema = z.string().trim().min(1).max(64);
const enrollSchema = z.object({ contactId: idSchema, automationId: idSchema });
const removeSchema = z.object({ runId: idSchema });

const NOT_FOUND = "This contact or automation doesn't exist (or was deleted).";

/** Adds one contact to an ACTIVE automation that starts "when you add people by hand". */
export async function addContactToAutomation(input: unknown): Promise<AutomationCardResult> {
  const ws = await requireActiveWorkspace();
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose an automation first." };

  const [contact, automation] = await Promise.all([
    db.contact.findFirst({ where: { id: parsed.data.contactId, workspaceId: ws.id }, select: { id: true, status: true } }),
    db.automation.findFirst({
      where: { id: parsed.data.automationId, workspaceId: ws.id },
      select: { id: true, name: true, status: true, trigger: true },
    }),
  ]);
  if (!contact || !automation) return { ok: false, message: NOT_FOUND };

  if (automation.status !== "ACTIVE") {
    return { ok: false, message: `“${automation.name}” isn't turned on. Turn it on first, then add people to it.` };
  }
  // Other triggers start on their own (joined a list, birthday…); adding
  // someone by hand there would skip the rules the user set up.
  if (triggerSchema.safeParse(automation.trigger).data?.type !== "manual") {
    return { ok: false, message: `“${automation.name}” starts on its own, so people can't be added to it by hand.` };
  }
  if (contact.status !== "SUBSCRIBED") {
    return { ok: false, message: "Only subscribed contacts can be added to an automation." };
  }

  try {
    // The engine decides the rest (already inside? allowed to go through
    // again?) and creates the run in one place for every way of enrolling.
    const result = await enrollContacts(ws, automation.id, [contact.id], { source: "manual" });
    if (result.error) return { ok: false, message: result.error };
    if (result.enrolled === 0) {
      return {
        ok: false,
        message: `They weren't added: they're already in “${automation.name}”, have been through it before, or are on the suppression list.`,
      };
    }
  } catch (error) {
    console.error("addContactToAutomation failed:", error);
    return { ok: false, message: "Couldn't add them right now. Please try again." };
  }

  refresh();
  return { ok: true, message: `Added to “${automation.name}”. The first step runs within a minute.` };
}

/** Takes a contact out of an automation they're still going through. */
export async function removeContactFromAutomation(input: unknown): Promise<AutomationCardResult> {
  const ws = await requireActiveWorkspace();
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  const user = await getCurrentUser();
  const who = user?.name?.trim() || user?.email || "a team member";
  const reason = `Removed by ${who}`.slice(0, 200);

  // The run must belong to an automation in THIS workspace.
  const run = await db.automationRun.findFirst({
    where: { id: parsed.data.runId, automation: { workspaceId: ws.id } },
    select: { id: true, status: true, currentStepId: true, automation: { select: { name: true } } },
  });
  if (!run) return { ok: false, message: "This automation run doesn't exist (or was deleted)." };

  const now = new Date();
  // Conditional update: only a run that's still in progress can be removed.
  // If the engine finished it a moment ago, nothing changes (count 0).
  const updated = await db.automationRun.updateMany({
    where: { id: run.id, status: { in: ["ACTIVE", "WAITING"] }, automation: { workspaceId: ws.id } },
    data: { status: "EXITED", finishedAt: now, lastError: reason, currentStepId: null, lockedAt: null },
  });
  if (updated.count === 0) {
    return { ok: false, message: "They've already left this automation." };
  }

  // Their history shows who took them out, and from which step.
  await db.automationLog.create({
    data: {
      runId: run.id,
      stepId: run.currentStepId ?? "manual",
      action: "exited",
      detail: { reason, by: user?.id ?? null },
      createdAt: now,
    },
  });

  refresh();
  return { ok: true, message: `Removed from “${run.automation.name}”.` };
}
