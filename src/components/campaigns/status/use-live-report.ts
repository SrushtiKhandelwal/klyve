"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCampaignReportAction } from "@/app/actions/campaigns";
import type { CampaignReport } from "@/lib/tracking/reports";

// Keeps the campaign report fresh, without hammering the database:
//
//  - While SENDING: refreshed whenever the live progress numbers change
//    (`refreshKey`, from the progress polling), at most once every 10 seconds.
//  - While sending/paused, and for 48 hours after a campaign FINISHED (when most
//    opens and clicks arrive): a light refresh every 30 seconds.
//  - Older campaigns don't refresh by themselves; the Refresh button does it.
//
// Nothing is fetched while the tab is in the background, and requests never overlap.

const MIN_GAP_MS = 10_000;
const FRESH_POLL_MS = 30_000;
const FRESH_FOR_MS = 48 * 3_600_000;

export function useLiveReport(
  campaignId: string,
  initial: CampaignReport | null,
  live: { status: string; finishedAt: string | null; refreshKey: string },
) {
  const [report, setReport] = useState(initial);
  const [fromServer, setFromServer] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const inFlight = useRef(false);

  // The server re-rendered the page (e.g. after Pause): take its fresh report.
  if (initial !== fromServer) {
    setFromServer(initial);
    setReport(initial);
  }

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await getCampaignReportAction(campaignId);
      if (res.ok) {
        setReport(res.report);
        setError(null);
      } else setError(res.error);
    } catch {
      setError("Couldn't refresh the report. Check your connection.");
    } finally {
      inFlight.current = false;
      lastFetch.current = Date.now();
      setLoading(false);
    }
  }, [campaignId]);

  // The page arrived with a fresh report: count that as the last fetch.
  useEffect(() => {
    lastFetch.current = Date.now();
  }, []);

  const sending = live.status === "SENDING";

  // While sending: follow the progress polling, throttled.
  useEffect(() => {
    if (!sending) return;
    const wait = Math.max(0, lastFetch.current + MIN_GAP_MS - Date.now());
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") void refresh();
    }, wait);
    return () => clearTimeout(timer);
  }, [sending, live.refreshKey, refresh]);

  // Status changed (e.g. SENDING → SENT): refresh once so the report's status matches.
  const reportStatus = report?.status;
  useEffect(() => {
    if (!reportStatus || reportStatus === live.status) return;
    // In a timer (not right inside the effect), so React finishes this render first.
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [reportStatus, live.status, refresh]);

  // A light refresh every 30s while live, and for 48h after it finished.
  useEffect(() => {
    const finishedAt = live.finishedAt ? Date.parse(live.finishedAt) : null;
    const isLive = live.status === "SENDING" || live.status === "PAUSED";
    const isFresh = finishedAt !== null && Date.now() - finishedAt < FRESH_FOR_MS;
    if (!isLive && !isFresh) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current >= MIN_GAP_MS) void refresh();
    }, FRESH_POLL_MS);
    return () => clearInterval(timer);
  }, [live.status, live.finishedAt, refresh]);

  return { report, loading, error, refresh };
}
