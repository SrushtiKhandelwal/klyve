import "server-only";
import { db } from "@/lib/db";
import { getAiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import { AI_BURST_PER_MINUTE, type AiFeature } from "@/lib/ai/feature-names";
import { dayAfter, dayKey, normalizeDatePrefs, startOfDay } from "@/lib/format-date";
import { createRateLimiter } from "@/lib/media/rate-limit";

// AI limits and the usage log (the AiUsage table).
//
// THREE LIMITS, all checked BEFORE we call the AI:
//  1. Burst: at most AI_BURST_PER_MINUTE requests per person per minute
//     (kept in this server's memory, like the upload limiter).
//  2. Daily: AI_DAILY_LIMIT_PER_USER requests per person per day.
//  3. Monthly: AI_MONTHLY_LIMIT_PER_WORKSPACE requests per workspace per
//     calendar month.
// "Day" and "month" follow the workspace's time zone (General settings).
//
// ONE ROW PER REQUEST SENT TO THE AI. We write the row BEFORE calling the AI
// (so two clicks at the same moment can't both squeeze past the limit) and
// fill in the result afterwards. If the request never left our server
// (e.g. no network), the row is removed again.
//
// RACES: the count and the insert happen in one transaction that holds a
// Postgres "advisory lock" for the workspace and one for the person. A second
// request for the same workspace waits until the first one has inserted its
// row, so it counts it.

export const aiBurstLimiter = createRateLimiter({ max: AI_BURST_PER_MINUTE, windowMs: 60_000 });

export type UsagePeriods = {
  timezone: string;
  monthStart: Date;
  nextMonthStart: Date;
  dayStart: Date;
  nextDayStart: Date;
};

/** The current calendar month and day in `timezone`, as UTC instants for database queries. */
export function usagePeriods(now: Date, timezone: string): UsagePeriods {
  const today = dayKey(now, timezone); // "2026-11-14"
  const [y, m] = today.split("-").map(Number);
  const monthKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextMonthKey = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return {
    timezone,
    monthStart: startOfDay(monthKey, timezone),
    nextMonthStart: startOfDay(nextMonthKey, timezone),
    dayStart: startOfDay(today, timezone),
    nextDayStart: startOfDay(dayAfter(today), timezone),
  };
}

/** "1 Dec" (in the workspace's time zone). */
export function formatResetDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: timezone }).format(date);
}

async function workspaceTimezone(workspaceId: string): Promise<string> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { timezone: true, dateFormat: true, timeFormat: true },
  });
  return normalizeDatePrefs(ws).timezone;
}

export function monthlyLimitMessage(limit: number, resetDay: string): string {
  if (limit === 0) return "AI requests are turned off for this workspace.";
  return `Your workspace has used all ${limit} AI requests for this month. They reset on ${resetDay}.`;
}

export function dailyLimitMessage(limit: number): string {
  if (limit === 0) return "AI requests are turned off on this server.";
  return `You've used all ${limit} of your AI requests for today. They reset at midnight.`;
}

/** Checks the burst limit for this person (counts this attempt). Throws AiError("burst"). */
export function checkBurst(userId: string, now: number = Date.now()): void {
  const result = aiBurstLimiter.hit(userId, now);
  if (!result.ok) {
    const wait = result.retryAfterSeconds;
    throw new AiError("burst", `You're going a bit fast. Please wait ${wait} ${wait === 1 ? "second" : "seconds"} and try again.`);
  }
}

/**
 * Checks the daily and monthly limits and, if there is room, writes a usage
 * row for the request we're about to send. Returns the row id.
 * Throws AiError("monthly_limit" | "daily_limit") when a limit is reached.
 */
export async function reserveAiRequest(input: {
  workspaceId: string;
  userId: string | null;
  feature: AiFeature;
  model: string;
  now?: Date;
}): Promise<string> {
  const { workspaceId, userId, feature, model } = input;
  const now = input.now ?? new Date();
  const config = getAiConfig();
  const periods = usagePeriods(now, await workspaceTimezone(workspaceId));

  return db.$transaction(async (tx) => {
    // Always the workspace lock first, then the person's: a fixed order means
    // two requests can never wait for each other forever (a deadlock).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai_usage:ws:" + workspaceId}))`;
    if (userId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai_usage:user:" + userId}))`;

    const monthCount = await tx.aiUsage.count({
      where: { workspaceId, createdAt: { gte: periods.monthStart, lt: periods.nextMonthStart } },
    });
    if (monthCount >= config.monthlyLimit) {
      throw new AiError("monthly_limit", monthlyLimitMessage(config.monthlyLimit, formatResetDay(periods.nextMonthStart, periods.timezone)));
    }

    if (userId) {
      // A person's daily limit counts their requests in every workspace.
      const dayCount = await tx.aiUsage.count({
        where: { userId, createdAt: { gte: periods.dayStart, lt: periods.nextDayStart } },
      });
      if (dayCount >= config.dailyLimit) throw new AiError("daily_limit", dailyLimitMessage(config.dailyLimit));
    }

    const row = await tx.aiUsage.create({
      data: { workspaceId, userId, feature, model: model.slice(0, 100), ok: false, createdAt: now },
      select: { id: true },
    });
    return row.id;
  });
}

/** Fills in the result of a request (did it work, how many tokens). */
export async function finishAiRequest(
  id: string,
  result: { ok: boolean; promptTokens?: number; completionTokens?: number; model?: string },
): Promise<void> {
  await db.aiUsage.update({
    where: { id },
    data: {
      ok: result.ok,
      promptTokens: result.promptTokens ?? 0,
      completionTokens: result.completionTokens ?? 0,
      ...(result.model ? { model: result.model.slice(0, 100) } : {}),
    },
  });
}

/** Removes the row of a request that never reached the AI (so it doesn't count). */
export async function cancelAiRequest(id: string): Promise<void> {
  await db.aiUsage.deleteMany({ where: { id } });
}

// ── For the Settings → AI page ──────────────────────────────────────────────

export type AiUsageOverview = {
  timezone: string;
  month: { used: number; limit: number; resetsOn: string };
  today: { used: number; limit: number };
  byFeature: { feature: string; requests: number; failed: number; tokens: number }[];
  recent: { id: string; feature: string; who: string; createdAt: string; ok: boolean }[];
};

/**
 * Usage numbers for the settings page. `workspaceId` MUST come from
 * requireActiveWorkspace(); `userId` from the session.
 */
export async function getAiUsageOverview(workspaceId: string, userId: string, now: Date = new Date()): Promise<AiUsageOverview> {
  const config = getAiConfig();
  const timezone = await workspaceTimezone(workspaceId);
  const periods = usagePeriods(now, timezone);
  const thisMonth = { workspaceId, createdAt: { gte: periods.monthStart, lt: periods.nextMonthStart } };

  const [monthUsed, todayUsed, grouped, recentRows] = await Promise.all([
    db.aiUsage.count({ where: thisMonth }),
    db.aiUsage.count({ where: { userId, createdAt: { gte: periods.dayStart, lt: periods.nextDayStart } } }),
    db.aiUsage.groupBy({
      by: ["feature", "ok"],
      where: thisMonth,
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    }),
    db.aiUsage.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, feature: true, userId: true, createdAt: true, ok: true },
    }),
  ]);

  const features = new Map<string, { feature: string; requests: number; failed: number; tokens: number }>();
  for (const g of grouped) {
    const entry = features.get(g.feature) ?? { feature: g.feature, requests: 0, failed: 0, tokens: 0 };
    entry.requests += g._count._all;
    if (!g.ok) entry.failed += g._count._all;
    entry.tokens += (g._sum.promptTokens ?? 0) + (g._sum.completionTokens ?? 0);
    features.set(g.feature, entry);
  }

  // Names of the people in the log. Only the names, and only for rows of this workspace.
  const userIds = [...new Set(recentRows.map((r) => r.userId).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));

  return {
    timezone,
    month: { used: monthUsed, limit: config.monthlyLimit, resetsOn: formatResetDay(periods.nextMonthStart, timezone) },
    today: { used: todayUsed, limit: config.dailyLimit },
    byFeature: [...features.values()].sort((a, b) => b.requests - a.requests),
    recent: recentRows.map((r) => ({
      id: r.id,
      feature: r.feature,
      who: r.userId === userId ? "You" : r.userId ? (names.get(r.userId) ?? "A former member") : "A former member",
      createdAt: r.createdAt.toISOString(),
      ok: r.ok,
    })),
  };
}
