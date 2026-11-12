// Next.js calls register() ONCE when a server process starts (see
// node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
// We use it to start the background worker that sends campaigns
// (src/lib/campaigns/worker.ts).
//
// HOW TO RUN IT IN PRODUCTION
//  • Simplest (default): the worker runs inside the web server process.
//    `next start` = website + sending. Run ONE server instance.
//  • Several web servers, or keep sending separate from the website: set
//    RUN_CAMPAIGN_WORKER=false on the web servers and run exactly ONE extra
//    instance of the same app with the flag unset — that one does the sending.
//    (Claiming is safe with several workers, but each worker has its own
//    speed limiter, so more than one would exceed providers' per-second limits.)
//
// It never blocks or crashes startup: the worker starts in the background
// and any error is only logged.

export async function register() {
  // Only in the Node.js server (not the Edge runtime), and not while
  // `next build` pre-renders pages (Next.js also skips register() then;
  // this is a second safety check).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.RUN_CAMPAIGN_WORKER === "false") return;

  try {
    // Imported here (not at the top) so the Edge runtime never loads database code.
    const { startCampaignWorker } = await import("@/lib/campaigns/worker");
    // Safe if register() runs again after a hot reload: state lives on globalThis.
    startCampaignWorker();
  } catch (err) {
    console.error("[campaign worker] couldn't start:", err instanceof Error ? err.message : err);
  }
}
