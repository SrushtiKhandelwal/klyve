import "server-only";
import { Prisma, type CampaignStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayAfter, startOfDay } from "@/lib/format-date";
import { eachDay, type StatsRange } from "@/lib/statistics/range";
import { campaignRates, formatRate } from "@/lib/tracking/metrics";

// The numbers behind Statistics (like Brevo's Marketing → Statistics): what
// happened to the workspace's marketing emails during a date range.
//
// SECURITY: takes the workspace id FIRST (only pass the one from
// requireActiveWorkspace()) and every query filters by it.
//
// WHAT COUNTS AS "IN THE RANGE"
//  - Emails sent: recipients whose email went out in the range (sentAt).
//  - Opens, clicks, unsubscribes, bounces, complaints: things that HAPPENED
//    in the range (EmailEvent.createdAt), each person counted once ("unique").
//    So an email sent on the 31st and opened on the 2nd counts as sent in
//    October and opened in November, the same as Brevo and Mailchimp do it.
//  - Automated opens/clicks (Apple Mail privacy prefetch, security scanners)
//    are left out, exactly like every other report in the app.
//  - Days are calendar days in the workspace time zone.
//
// RATES use the same definitions as campaign reports (metrics.ts): opens and
// clicks per DELIVERED email (sent minus hard bounces), the rest per sent email.
//
// SPEED: a handful of GROUP BY queries. Events use the
// email_event(workspaceId, createdAt) index; recipients are reached through
// the workspace's campaigns that had started by the end of the range.

const CAMPAIGN_TABLE_MAX = 200;

export type DailyStat = {
  /** "YYYY-MM-DD" in the workspace time zone. */
  day: string;
  sent: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
  complaints: number;
};

export type CampaignStatRow = {
  id: string;
  name: string;
  kind: "REGULAR" | "AUTOMATION";
  status: CampaignStatus;
  startedAt: string | null;
  /** Emails this campaign sent IN THE RANGE. */
  sentInRange: number;
  /** The campaign's totals so far (its own counters, as on the campaign report). */
  sent: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
  complaints: number;
  trackOpens: boolean;
  trackClicks: boolean;
  openRate: string;
  clickRate: string;
};

export type MarketingStatistics = {
  range: StatsRange;
  timezone: string;
  includeAutomation: boolean;
  totals: {
    sent: number;
    /** Different people (addresses) emailed. */
    recipients: number;
    uniqueOpens: number;
    uniqueClicks: number;
    unsubscribes: number;
    /** Hard bounces (the address doesn't exist): the ones that count in the bounce rate. */
    bounces: number;
    /** Temporary problems (mailbox full…), shown for information. */
    softBounces: number;
    complaints: number;
    delivered: number;
    openRate: string;
    clickRate: string;
    unsubscribeRate: string;
    bounceRate: string;
    complaintRate: string;
  };
  daily: DailyStat[];
  campaigns: CampaignStatRow[];
  /** More campaigns sent in the range than the table shows. */
  campaignsTruncated: boolean;
};

export async function getMarketingStatistics(
  workspaceId: string,
  range: StatsRange,
  options: { timezone: string; includeAutomation: boolean },
): Promise<MarketingStatistics> {
  const { timezone: tz, includeAutomation } = options;
  // Database bounds: [start of the first day, start of the day after the last).
  const fromAt = startOfDay(range.from, tz);
  const toAt = startOfDay(dayAfter(range.to), tz);
  const from = Prisma.sql`${fromAt}::timestamp`;
  const to = Prisma.sql`${toAt}::timestamp`;
  const kind = includeAutomation ? Prisma.empty : Prisma.sql`AND c.kind = 'REGULAR'`;
  // Timestamps are stored in UTC without a zone; this turns one into the
  // calendar day it fell on in the workspace's time zone.
  const localDay = (column: Prisma.Sql) => Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text, 'YYYY-MM-DD')`;

  const sentWhere = Prisma.sql`
    c."workspaceId" = ${workspaceId} ${kind}
    AND c."startedAt" IS NOT NULL AND c."startedAt" < ${to}
    AND r.status = 'SENT' AND r."sentAt" >= ${from} AND r."sentAt" < ${to}`;
  const eventWhere = Prisma.sql`
    e."workspaceId" = ${workspaceId} AND c."workspaceId" = ${workspaceId} ${kind}
    AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
    AND e."isBot" = false
    AND e.type IN ('OPENED', 'CLICKED', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED')`;

  const [sentRows, recipientRows, eventDays, eventTotals] = await Promise.all([
    // Emails sent per day AND per campaign (the campaign table needs both).
    db.$queryRaw<{ day: string; cid: string; n: number }[]>(Prisma.sql`
      SELECT ${localDay(Prisma.sql`r."sentAt"`)} AS day, r."campaignId" AS cid, count(*)::int AS n
      FROM campaign_recipient r
      JOIN campaign c ON c.id = r."campaignId"
      WHERE ${sentWhere}
      GROUP BY 1, 2`),
    db.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(DISTINCT lower(r.email))::int AS n
      FROM campaign_recipient r
      JOIN campaign c ON c.id = r."campaignId"
      WHERE ${sentWhere}`),
    // Unique people per day and type. A hard bounce is the one that counts.
    db.$queryRaw<{ day: string; type: string; n: number }[]>(Prisma.sql`
      SELECT ${localDay(Prisma.sql`e."createdAt"`)} AS day,
             CASE WHEN e.type = 'BOUNCED' AND e.detail->>'bounceType' = 'soft' THEN 'SOFT_BOUNCED' ELSE e.type::text END AS type,
             count(DISTINCT e."recipientId")::int AS n
      FROM email_event e
      JOIN campaign c ON c.id = e."campaignId"
      WHERE ${eventWhere}
      GROUP BY 1, 2`),
    // The same over the whole range (someone opening on two days is ONE unique open).
    db.$queryRaw<
      { opens: number; clicks: number; unsubscribes: number; hard: number; soft: number; complaints: number }[]
    >(Prisma.sql`
      SELECT
        count(DISTINCT e."recipientId") FILTER (WHERE e.type = 'OPENED')::int AS opens,
        count(DISTINCT e."recipientId") FILTER (WHERE e.type = 'CLICKED')::int AS clicks,
        count(DISTINCT e."recipientId") FILTER (WHERE e.type = 'UNSUBSCRIBED')::int AS unsubscribes,
        count(DISTINCT e."recipientId") FILTER (WHERE e.type = 'BOUNCED' AND coalesce(e.detail->>'bounceType', 'hard') <> 'soft')::int AS hard,
        count(DISTINCT e."recipientId") FILTER (WHERE e.type = 'BOUNCED' AND e.detail->>'bounceType' = 'soft')::int AS soft,
        count(DISTINCT e."recipientId") FILTER (WHERE e.type = 'COMPLAINED')::int AS complaints
      FROM email_event e
      JOIN campaign c ON c.id = e."campaignId"
      WHERE ${eventWhere}`),
  ]);

  // ── Daily series (every day of the range, zero-filled) ──
  const daily: DailyStat[] = eachDay(range.from, range.to).map((day) => ({
    day,
    sent: 0,
    opens: 0,
    clicks: 0,
    unsubscribes: 0,
    bounces: 0,
    complaints: 0,
  }));
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const sentByCampaign = new Map<string, number>();
  let sent = 0;
  for (const r of sentRows) {
    sent += r.n;
    sentByCampaign.set(r.cid, (sentByCampaign.get(r.cid) ?? 0) + r.n);
    const d = byDay.get(r.day);
    if (d) d.sent += r.n;
  }
  const typeKey: Record<string, keyof Omit<DailyStat, "day" | "sent">> = {
    OPENED: "opens",
    CLICKED: "clicks",
    UNSUBSCRIBED: "unsubscribes",
    BOUNCED: "bounces",
    COMPLAINED: "complaints",
  };
  for (const r of eventDays) {
    const d = byDay.get(r.day);
    const key = typeKey[r.type];
    if (d && key) d[key] += r.n;
  }

  // ── Totals ──
  const t = eventTotals[0] ?? { opens: 0, clicks: 0, unsubscribes: 0, hard: 0, soft: 0, complaints: 0 };
  const delivered = Math.max(0, sent - t.hard);

  // ── Campaigns that sent in the range, newest first ──
  const ids = [...sentByCampaign.keys()];
  const campaignRows = ids.length
    ? await db.campaign.findMany({
        where: { workspaceId, id: { in: ids } },
        orderBy: [{ startedAt: "desc" }, { id: "asc" }],
        take: CAMPAIGN_TABLE_MAX,
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
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
      })
    : [];

  const campaigns: CampaignStatRow[] = campaignRows.map((c) => {
    const rates = campaignRates({
      sentCount: c.sentCount,
      openCount: c.openCount,
      clickCount: c.clickCount,
      bounceCount: c.bounceCount,
      complaintCount: c.complaintCount,
      unsubscribeCount: c.unsubscribeCount,
    });
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      startedAt: c.startedAt?.toISOString() ?? null,
      sentInRange: sentByCampaign.get(c.id) ?? 0,
      sent: c.sentCount,
      opens: c.openCount,
      clicks: c.clickCount,
      unsubscribes: c.unsubscribeCount,
      bounces: c.bounceCount,
      complaints: c.complaintCount,
      trackOpens: c.trackOpens,
      trackClicks: c.trackClicks,
      // "—" when that kind of tracking was off: a 0% would be misleading.
      openRate: c.trackOpens ? rates.openRate : "—",
      clickRate: c.trackClicks ? rates.clickRate : "—",
    };
  });

  return {
    range,
    timezone: tz,
    includeAutomation,
    totals: {
      sent,
      recipients: recipientRows[0]?.n ?? 0,
      uniqueOpens: t.opens,
      uniqueClicks: t.clicks,
      unsubscribes: t.unsubscribes,
      bounces: t.hard,
      softBounces: t.soft,
      complaints: t.complaints,
      delivered,
      openRate: formatRate(t.opens, delivered),
      clickRate: formatRate(t.clicks, delivered),
      unsubscribeRate: formatRate(t.unsubscribes, sent),
      bounceRate: formatRate(t.hard, sent),
      complaintRate: formatRate(t.complaints, sent),
    },
    daily,
    campaigns,
    campaignsTruncated: ids.length > campaigns.length,
  };
}
