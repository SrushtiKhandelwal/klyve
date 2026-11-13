import { connection } from "next/server";
import { dayKey, formatDate } from "@/lib/format-date";
import { getMarketingStatistics } from "@/lib/statistics/marketing";
import { parseIncludeAutomation, parseStatsRange } from "@/lib/statistics/range";
import { toCsv } from "@/lib/statistics/csv";
import { getCurrentUser } from "@/lib/session";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";
import { getActiveWorkspace } from "@/lib/workspace";

// GET /api/statistics/export?range=30&type=daily|campaigns[&automation=0]
// Downloads the Statistics page's numbers as a CSV file:
//   type=daily      one row per day (the chart's numbers)
//   type=campaigns  one row per campaign sent in the range (the table)
//
// Checks: logged in → has an active workspace. Everything is read for THAT
// workspace only. Any member may export (they can see the page too).
// No CSRF check is needed: it's a GET that changes nothing.

const PRIVATE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: PRIVATE });
}

export async function GET(request: Request) {
  await connection(); // always run at request time (it reads the session)
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in.");
  const ws = await getActiveWorkspace();
  if (!ws) return fail(404, "No workspace found.");

  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const type = sp.type === "campaigns" ? "campaigns" : "daily";

  const prefs = await getWorkspaceDatePrefs(ws.id);
  const range = parseStatsRange(sp, dayKey(new Date(), prefs.timezone));
  const includeAutomation = parseIncludeAutomation(sp);

  try {
    const stats = await getMarketingStatistics(ws.id, range, { timezone: prefs.timezone, includeAutomation });

    let csv: string;
    if (type === "daily") {
      csv = toCsv(
        ["Date", "Emails sent", "Unique opens", "Unique clicks", "Unsubscribes", "Hard bounces", "Spam complaints"],
        stats.daily.map((d) => [d.day, d.sent, d.opens, d.clicks, d.unsubscribes, d.bounces, d.complaints]),
      );
    } else {
      csv = toCsv(
        [
          "Campaign",
          "Type",
          "Started",
          "Sent in this period",
          "Sent (total)",
          "Unique opens",
          "Unique clicks",
          "Open rate",
          "Click rate",
          "Unsubscribes",
          "Hard bounces",
          "Spam complaints",
        ],
        stats.campaigns.map((c) => [
          c.name,
          c.kind === "AUTOMATION" ? "Automation email" : "Campaign",
          c.startedAt ? formatDate(c.startedAt, prefs) : "",
          c.sentInRange,
          c.sent,
          c.trackOpens ? c.opens : "",
          c.trackClicks ? c.clicks : "",
          c.openRate === "—" ? "" : c.openRate,
          c.clickRate === "—" ? "" : c.clickRate,
          c.unsubscribes,
          c.bounces,
          c.complaints,
        ]),
      );
    }

    const fileName = `klyve-statistics-${type}-${range.from}-to-${range.to}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        ...PRIVATE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Statistics export failed:", error);
    return fail(500, "Couldn't build the export. Please try again.");
  }
}
