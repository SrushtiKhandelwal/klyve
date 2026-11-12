import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CampaignStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { campaignRates, formatRate, type CampaignStats } from "@/lib/tracking/metrics";

// Reports: the numbers behind the campaign report page and the dashboard.
//
// SECURITY: every function takes the workspace FIRST (only ever pass the one
// from requireActiveWorkspace()) and every query filters by it, so a campaign
// id from another workspace finds nothing.
//
// HONEST NUMBERS:
//  - The headline numbers (opened, clicked, bounced…) are the campaign's
//    unique-person counters, and every rate goes through campaignRates() in
//    metrics.ts, so the report, the campaigns list and the dashboard agree.
//  - Opens flagged as automated (isBot, e.g. Apple Mail privacy prefetch or a
//    security scanner) are left out of the timeline and only shown as
//    "N automated opens excluded".
//
// SPEED: everything is a handful of aggregate queries that use the indexes
// email_event(campaignId, type, createdAt) and campaign_recipient(campaignId, …).
// Results are plain JSON (dates as ISO strings) so they can go straight to the
// browser, also from a Server Action when the report refreshes.

type WorkspaceArg = string | { id: string };
const wsId = (ws: WorkspaceArg) => (typeof ws === "string" ? ws : ws.id);
const cleanId = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The timeline shows hours for the first 48 hours, then days up to 30 days. */
export const TIMELINE_HOURS = 48;
export const TIMELINE_DAYS = 30;

// ── Campaign report ─────────────────────────────────────────────────────────

/** One bar/point on the timeline: human opens and clicks starting at `t`. */
export type TimelinePoint = { t: string; opens: number; clicks: number };

export type TopLink = {
  id: string;
  position: number;
  /** The real destination, exactly as written (merge tags like {{ contact.ID }} kept). */
  url: string;
  /** A short, readable version for the table: "acme.com/sale/shoes". */
  shortUrl: string;
  /** Total clicks (the same person can click many times). */
  clicks: number;
  /** People who clicked this link at least once. */
  uniqueClicks: number;
};

export type CampaignReport = {
  campaignId: string;
  status: CampaignStatus;
  trackOpens: boolean;
  trackClicks: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  /** The campaign's unique-person counters (see metrics.ts). */
  stats: CampaignStats;
  /** Formatted rates ("12%", "—"), always from campaignRates(). */
  rates: ReturnType<typeof campaignRates>;
  /** Raw fractions (0.004 = 0.4%) to compare with COMPLAINT_RATE_LIMIT / BOUNCE_RATE_WARNING. */
  complaintRatio: number;
  bounceRatio: number;
  /**
   * Emails the provider confirmed reached the inbox server. Only providers
   * with webhooks report this; null = not reported (show "—", not 0).
   */
  delivered: number | null;
  /** The campaign's provider has sent us at least one webhook (bounce tracking is set up). */
  webhooksConnected: boolean;
  /**
   * hard = the address doesn't exist (this is the campaign's bounceCount, used
   * for the bounce rate). soft = only temporary problems (mailbox full…), not
   * counted in the rate because a later email may well arrive.
   */
  bounces: { hard: number; soft: number };
  /** Event totals: every human open/click (repeats included) and the automated ones we left out. */
  totals: { opens: number; clicks: number; botOpens: number; botClicks: number };
  /** Row counts per engagement filter (for the recipients table's chips; bounced = hard + soft). */
  recipients: { opened: number; clicked: number; notOpened: number; bounced: number; complained: number; unsubscribed: number };
  timeline: {
    /** Hour by hour for the first 48 hours after sending started (only hours that have begun). */
    hourly: TimelinePoint[];
    /** Day by day (24-hour periods from the start) up to 30 days (only days that have begun). */
    daily: TimelinePoint[];
    /** Which view to show first: hours while the campaign is fresh, days after that. */
    defaultView: "hourly" | "daily";
  };
  topLinks: TopLink[];
  /** When these numbers were worked out (for "Updated just now"). */
  generatedAt: string;
};

/** The full report for one campaign, or null if it isn't in this workspace. */
export async function getCampaignReport(ws: WorkspaceArg, campaignId: string): Promise<CampaignReport | null> {
  const workspaceId = wsId(ws);
  const id = cleanId(campaignId);
  if (!id) return null;

  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      status: true,
      trackOpens: true,
      trackClicks: true,
      startedAt: true,
      finishedAt: true,
      sentCount: true,
      openCount: true,
      clickCount: true,
      bounceCount: true,
      complaintCount: true,
      unsubscribeCount: true,
      provider: { select: { workspaceId: true, lastWebhookAt: true } },
    },
  });
  if (!campaign) return null;

  const [eventTotals, rowCounts, links, timeline, softRows] = await Promise.all([
    // Every open/click split by human vs automated. Uses the (campaignId, type, …) index.
    db.emailEvent.groupBy({
      by: ["type", "isBot"],
      where: { campaignId: campaign.id, workspaceId, type: { in: ["OPENED", "CLICKED"] } },
      _count: { _all: true },
    }),
    // One pass over the recipients for the breakdowns and the filter chips.
    db.$queryRaw<
      {
        delivered: number;
        opened: number;
        clicked: number;
        not_opened: number;
        hard: number;
        complained: number;
        unsubscribed: number;
      }[]
    >(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE "deliveredAt" IS NOT NULL)::int AS delivered,
        count(*) FILTER (WHERE "firstOpenedAt" IS NOT NULL)::int AS opened,
        count(*) FILTER (WHERE "firstClickedAt" IS NOT NULL)::int AS clicked,
        count(*) FILTER (WHERE status = 'SENT' AND "firstOpenedAt" IS NULL)::int AS not_opened,
        count(*) FILTER (WHERE "bouncedAt" IS NOT NULL)::int AS hard,
        count(*) FILTER (WHERE "complainedAt" IS NOT NULL)::int AS complained,
        count(*) FILTER (WHERE "unsubscribedAt" IS NOT NULL)::int AS unsubscribed
      FROM campaign_recipient
      WHERE "campaignId" = ${campaign.id}`),
    db.campaignLink.findMany({
      where: { campaignId: campaign.id },
      orderBy: [{ clickCount: "desc" }, { position: "asc" }],
      take: 50,
      select: { id: true, position: true, url: true, clickCount: true, uniqueClicks: true },
    }),
    campaign.startedAt ? getTimeline(workspaceId, campaign.id, campaign.startedAt) : null,
    // Soft bounces (mailbox full, server busy…) are only stored as events, not
    // counted on the recipient (the next email may well arrive). People who
    // ALSO hard-bounced are already in the hard count.
    db.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(DISTINCT e."recipientId")::int AS n
      FROM email_event e
      JOIN campaign_recipient r ON r.id = e."recipientId"
      WHERE e."campaignId" = ${campaign.id} AND e.type = 'BOUNCED' AND e.detail->>'bounceType' = 'soft' AND r."bouncedAt" IS NULL`),
  ]);

  const count = (type: "OPENED" | "CLICKED", isBot: boolean) =>
    eventTotals.find((g) => g.type === type && g.isBot === isBot)?._count._all ?? 0;
  const rc = rowCounts[0];
  const soft = softRows[0]?.n ?? 0;

  const stats: CampaignStats = {
    sentCount: campaign.sentCount,
    openCount: campaign.openCount,
    clickCount: campaign.clickCount,
    bounceCount: campaign.bounceCount,
    complaintCount: campaign.complaintCount,
    unsubscribeCount: campaign.unsubscribeCount,
  };
  const ratio = (part: number) => (campaign.sentCount > 0 ? part / campaign.sentCount : 0);
  const provider = campaign.provider?.workspaceId === workspaceId ? campaign.provider : null;

  return {
    campaignId: campaign.id,
    status: campaign.status,
    trackOpens: campaign.trackOpens,
    trackClicks: campaign.trackClicks,
    startedAt: campaign.startedAt?.toISOString() ?? null,
    finishedAt: campaign.finishedAt?.toISOString() ?? null,
    stats,
    rates: campaignRates(stats),
    complaintRatio: ratio(campaign.complaintCount),
    bounceRatio: ratio(campaign.bounceCount),
    // 0 confirmed deliveries almost always means "the provider doesn't tell us", not "none arrived".
    delivered: rc && rc.delivered > 0 ? rc.delivered : null,
    webhooksConnected: !!provider?.lastWebhookAt,
    bounces: { hard: rc?.hard ?? 0, soft },
    totals: {
      opens: count("OPENED", false),
      clicks: count("CLICKED", false),
      botOpens: count("OPENED", true),
      botClicks: count("CLICKED", true),
    },
    recipients: {
      opened: rc?.opened ?? 0,
      clicked: rc?.clicked ?? 0,
      notOpened: rc?.not_opened ?? 0,
      bounced: (rc?.hard ?? 0) + soft,
      complained: rc?.complained ?? 0,
      unsubscribed: rc?.unsubscribed ?? 0,
    },
    timeline: timeline ?? { hourly: [], daily: [], defaultView: "hourly" },
    topLinks: links.map((l) => ({
      id: l.id,
      position: l.position,
      url: l.url,
      shortUrl: shortenUrl(l.url),
      clicks: l.clickCount,
      uniqueClicks: l.uniqueClicks,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Human opens and clicks over time. ONE query groups the events by clock hour
 * (SQL date_trunc) for the first 30 days after sending started; the hours are
 * then laid out as the 48-hour view and added up into 24-hour days.
 *
 * Days are counted from the hour sending started ("Day 1" = the first 24
 * hours), not calendar days, because the server doesn't know the viewer's time
 * zone and "day 1 after sending" is what matters for a campaign anyway.
 */
async function getTimeline(workspaceId: string, campaignId: string, startedAt: Date): Promise<CampaignReport["timeline"]> {
  const start = Math.floor(startedAt.getTime() / HOUR) * HOUR; // the hour sending started
  const now = Date.now();

  // The time window is worked out in SQL from the campaign's own startedAt,
  // so no dates are passed in (and no time zone conversions can sneak in).
  // Timestamps are stored in UTC, so epoch seconds of the hour are exact.
  const rows = await db.$queryRaw<{ h: number; type: "OPENED" | "CLICKED"; n: number }[]>(Prisma.sql`
    SELECT extract(epoch FROM date_trunc('hour', e."createdAt"))::float8 AS h,
           e.type::text AS type,
           count(*)::int AS n
    FROM email_event e
    JOIN campaign c ON c.id = e."campaignId"
    WHERE c.id = ${campaignId}
      AND c."workspaceId" = ${workspaceId}
      AND e."campaignId" = ${campaignId}
      AND e.type IN ('OPENED', 'CLICKED')
      AND e."isBot" = false
      AND e."createdAt" >= date_trunc('hour', c."startedAt")
      AND e."createdAt" < date_trunc('hour', c."startedAt") + interval '30 days' -- = TIMELINE_DAYS
    GROUP BY 1, 2`);

  // Only hours/days that have already begun (a fresh campaign shouldn't show
  // a long row of "future" zeros). At least one, so the chart has something.
  const elapsedHours = Math.max(1, Math.ceil((now - start) / HOUR));
  const hourCount = Math.min(TIMELINE_HOURS, elapsedHours);
  const dayCount = Math.min(TIMELINE_DAYS, Math.max(1, Math.ceil(elapsedHours / 24)));

  const hourly = Array.from({ length: hourCount }, (_, i) => ({ t: new Date(start + i * HOUR).toISOString(), opens: 0, clicks: 0 }));
  const daily = Array.from({ length: dayCount }, (_, i) => ({ t: new Date(start + i * DAY).toISOString(), opens: 0, clicks: 0 }));

  for (const row of rows) {
    const offset = Math.round((Number(row.h) * 1000 - start) / HOUR); // hours since the start hour
    if (offset < 0) continue;
    const key = row.type === "OPENED" ? "opens" : "clicks";
    if (offset < hourly.length) hourly[offset][key] += row.n;
    const day = Math.floor(offset / 24);
    if (day < daily.length) daily[day][key] += row.n;
  }

  return { hourly, daily, defaultView: now - start < TIMELINE_HOURS * HOUR ? "hourly" : "daily" };
}

/**
 * "https://www.acme.com/sale/shoes?utm_source=klyve" → "acme.com/sale/shoes?utm_source=klyve",
 * cut in the middle if it's still long. Merge tags are left exactly as written.
 */
export function shortenUrl(url: string, max = 60): string {
  let s = url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (s.endsWith("/") && s.indexOf("/") === s.length - 1) s = s.slice(0, -1); // "acme.com/" → "acme.com"
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) * 0.65);
  const tail = max - 1 - head;
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

// ── Workspace performance (dashboard) ───────────────────────────────────────

export type PeriodTotals = {
  /** Campaigns that sent at least one email in the period. */
  campaigns: number;
  emailsSent: number;
  opens: number;
  clicks: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
  /** Fractions (0.25 = 25%), or null when nothing could be measured (e.g. tracking was off everywhere). */
  openRate: number | null;
  clickRate: number | null;
  bounceRate: number | null;
  complaintRate: number | null;
  /** The same rates, formatted with formatRate() ("25%", "—"). */
  openRateText: string;
  clickRateText: string;
  bounceRateText: string;
  complaintRateText: string;
};

export type WorkspacePerformance = {
  days: number;
  current: PeriodTotals;
  /** The `days` before that, for the up/down arrows. */
  previous: PeriodTotals;
};

/**
 * Totals for the last `days` days, compared with the `days` before that.
 * A campaign belongs to the period in which it STARTED sending.
 *
 * "Average" rates are weighted by size (all opens ÷ all delivered emails),
 * which is what the totals really were; a mean of per-campaign rates would let
 * a 10-person test count as much as a 10,000-person newsletter. Campaigns with
 * open tracking off are left out of the open rate (same for clicks), so they
 * don't drag it down with zeros.
 */
export async function getWorkspacePerformance(ws: WorkspaceArg, options: { days?: number } = {}): Promise<WorkspacePerformance> {
  const workspaceId = wsId(ws);
  const days = Math.min(365, Math.max(1, Math.floor(options.days ?? 30)));
  const now = new Date();
  const currentStart = new Date(now.getTime() - days * DAY);
  const previousStart = new Date(now.getTime() - 2 * days * DAY);

  const rows = await db.campaign.findMany({
    where: { workspaceId, startedAt: { gte: previousStart, lt: now }, sentCount: { gt: 0 } },
    select: {
      startedAt: true,
      trackOpens: true,
      trackClicks: true,
      sentCount: true,
      openCount: true,
      clickCount: true,
      bounceCount: true,
      complaintCount: true,
      unsubscribeCount: true,
    },
  });

  const current = rows.filter((r) => r.startedAt! >= currentStart);
  const previous = rows.filter((r) => r.startedAt! < currentStart);
  return { days, current: totals(current), previous: totals(previous) };
}

type PerfRow = {
  trackOpens: boolean;
  trackClicks: boolean;
  sentCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
};

function totals(rows: PerfRow[]): PeriodTotals {
  const sum = (list: PerfRow[], key: keyof Omit<PerfRow, "trackOpens" | "trackClicks">) => list.reduce((a, r) => a + r[key], 0);
  const opensRows = rows.filter((r) => r.trackOpens);
  const clickRows = rows.filter((r) => r.trackClicks);

  const emailsSent = sum(rows, "sentCount");
  const bounces = sum(rows, "bounceCount");
  const complaints = sum(rows, "complaintCount");
  const opens = sum(opensRows, "openCount");
  const clicks = sum(clickRows, "clickCount");
  // Same definition as campaignRates(): opens and clicks per DELIVERED email (sent minus bounces).
  const openBase = Math.max(0, sum(opensRows, "sentCount") - sum(opensRows, "bounceCount"));
  const clickBase = Math.max(0, sum(clickRows, "sentCount") - sum(clickRows, "bounceCount"));
  const frac = (part: number, whole: number) => (whole > 0 ? part / whole : null);

  return {
    campaigns: rows.length,
    emailsSent,
    opens,
    clicks,
    bounces,
    complaints,
    unsubscribes: sum(rows, "unsubscribeCount"),
    openRate: frac(opens, openBase),
    clickRate: frac(clicks, clickBase),
    bounceRate: frac(bounces, emailsSent),
    complaintRate: frac(complaints, emailsSent),
    openRateText: formatRate(opens, openBase),
    clickRateText: formatRate(clicks, clickBase),
    bounceRateText: formatRate(bounces, emailsSent),
    complaintRateText: formatRate(complaints, emailsSent),
  };
}
