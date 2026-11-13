"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleCheck, CircleX, Loader2, RefreshCw, Rocket, Send, TriangleAlert } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { toast } from "sonner";
import { launchCampaignAction, preflightCampaignAction } from "@/app/actions/campaigns";
import { formatDateTime, localTimeZoneLabel, useInBrowser } from "@/components/campaigns/local-time";
import { formatCount, people } from "@/components/campaigns/types";
import { useNow } from "@/components/settings/senders/use-now";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TrackingSwitches } from "./tracking-switches";

export type SectionId = "recipients" | "sender" | "subject" | "design";

type Problem = { code: string; message: string; fix?: { label: string; href: string } };
type Preflight = { ok: boolean; problems: Problem[]; warnings: string[]; recipientCount: number };
type CheckState = { kind: "checking"; last: Preflight | null } | { kind: "done"; result: Preflight } | { kind: "error"; message: string };

/** Which setup step fixes a problem (for problems without a link to another page). */
const SECTION_FOR_CODE: Record<string, SectionId> = {
  no_audience: "recipients",
  no_recipients: "recipients",
  audience_invalid: "recipients",
  no_sender: "sender",
  sender_unverified: "sender",
  no_subject: "subject",
  no_content: "design",
  invalid_document: "design",
  merge_tag: "design",
  no_unsubscribe: "design",
  image_missing: "design",
};

const SECTION_LABEL: Record<SectionId, string> = {
  recipients: "Choose recipients",
  sender: "Choose a sender",
  subject: "Edit subject",
  design: "Edit design",
};

/**
 * The last step: run the pre-send checks, then send now or schedule, behind a
 * clear confirmation. Sending can't be undone, so the dialog spells out the
 * subject, the number of people and the sender.
 */
export function ReviewSection({
  campaignId,
  subject,
  senderLabel,
  savedVersion,
  flush,
  onFixSection,
  tracking,
  onTrackingChange,
}: {
  campaignId: string;
  subject: string;
  senderLabel: string | null;
  /** Changes after each autosave, so the checks re-run on the latest data. */
  savedVersion: number;
  /** Saves anything still waiting; resolves false if that failed. */
  flush: () => Promise<boolean>;
  onFixSection: (section: SectionId) => void;
  /** The "Track opens" / "Track clicks" switches (saved with the draft). */
  tracking: { trackOpens: boolean; trackClicks: boolean };
  onTrackingChange: (patch: { trackOpens?: boolean; trackClicks?: boolean }) => void;
}) {
  const router = useRouter();
  const local = useInBrowser();
  // The current time, ticking each second (null before the page runs in the browser).
  const now = useNow();
  const [check, setCheck] = useState<CheckState>({ kind: "checking", last: null });
  const [runId, setRunId] = useState(0);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState(""); // "2026-11-14T10:30" in the viewer's own time zone
  const [confirm, setConfirm] = useState<{ scheduledAt: Date | null; recipients: number } | null>(null);
  const [launching, startLaunch] = useTransition();
  const [preparing, setPreparing] = useState(false);

  // Re-check a moment after each save (and when "Check again" is pressed).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCheck((c) => ({ kind: "checking", last: c.kind === "done" ? c.result : c.kind === "checking" ? c.last : null }));
      try {
        const res = await preflightCampaignAction(campaignId);
        if (cancelled) return;
        setCheck(res.ok ? { kind: "done", result: res.result } : { kind: "error", message: res.error });
      } catch {
        if (!cancelled) setCheck({ kind: "error", message: "Couldn't run the checks. Check your connection and try again." });
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [campaignId, savedVersion, runId]);

  const result = check.kind === "done" ? check.result : check.kind === "checking" ? check.last : null;
  const checking = check.kind === "checking";
  const scheduledAt = mode === "later" && when ? new Date(when) : null;
  const scheduleError =
    mode === "later" && when && scheduledAt && now !== null && scheduledAt.getTime() <= now ? "Pick a time in the future." : null;
  const canLaunch = !!result?.ok && !checking && !(mode === "later" && (!when || scheduleError));

  /** Saves, re-checks with the latest data, then opens the confirmation. */
  async function openConfirm() {
    setPreparing(true);
    try {
      if (!(await flush())) {
        toast.error("Your latest changes couldn't be saved. Fix that first, then try again.");
        return;
      }
      // Checked again with the chosen time, right before asking, so the number in the dialog is current.
      const res = await preflightCampaignAction(campaignId, { scheduledAt: scheduledAt?.toISOString() ?? null });
      if (!res.ok) return void toast.error(res.error);
      setCheck({ kind: "done", result: res.result });
      if (res.result.ok) setConfirm({ scheduledAt, recipients: res.result.recipientCount });
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setPreparing(false);
    }
  }

  function launch() {
    if (!confirm) return;
    startLaunch(async () => {
      try {
        const res = await launchCampaignAction(campaignId, { scheduledAt: confirm.scheduledAt?.toISOString() ?? null });
        if (!res.ok) {
          setConfirm(null);
          if (res.problems?.length) {
            setCheck({ kind: "done", result: { ok: false, problems: res.problems, warnings: [], recipientCount: 0 } });
            toast.error("It wasn't sent: something needs fixing first.");
          } else toast.error(res.error);
          return;
        }
        toast.success(confirm.scheduledAt ? "Campaign scheduled." : "Sending started. You can watch the progress here.");
        setConfirm(null);
        router.refresh(); // the page turns into the progress view
      } catch {
        toast.error("Couldn't reach the server. Nothing was sent. Please try again.");
      }
    });
  }

  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time; the earliest is "now".
  const minValue = now !== null ? toLocalInputValue(new Date(now + 60_000)) : undefined;

  return (
    <section id="review" aria-labelledby="review-title" className="scroll-mt-6 rounded-xl border bg-white">
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        <Glyph icon={Rocket} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 id="review-title" className="font-semibold text-zinc-900">
            Review &amp; send
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">We check everything before anything is sent.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRunId((n) => n + 1)} disabled={checking}>
          <RefreshCw className={cn(checking && "animate-spin")} aria-hidden />
          <span className="max-sm:sr-only">Check again</span>
        </Button>
      </div>

      <div className="flex flex-col gap-5 border-t px-4 py-5 sm:px-5">
        <Checks check={check} result={result} onFixSection={onFixSection} />

        <TrackingSwitches trackOpens={tracking.trackOpens} trackClicks={tracking.trackClicks} onChange={onTrackingChange} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium text-zinc-900">When should it go out?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <WhenOption checked={mode === "now"} onSelect={() => setMode("now")} icon={Send} title="Send now" text="Starts right away, at your provider's speed." />
            <WhenOption
              checked={mode === "later"}
              onSelect={() => setMode("later")}
              icon={CalendarClock}
              title="Schedule for later"
              text="Pick a date and time. You can unschedule until then."
            />
          </div>
          {mode === "later" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="schedule-at" className="text-sm font-medium text-zinc-900">
                Date and time
              </label>
              <input
                id="schedule-at"
                type="datetime-local"
                value={when}
                min={minValue}
                onChange={(e) => setWhen(e.target.value)}
                aria-invalid={scheduleError ? true : undefined}
                aria-describedby="schedule-tz"
                className="h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
              <p id="schedule-tz" className="text-xs text-zinc-500">
                {scheduleError ? (
                  <span className="text-destructive">{scheduleError}</span>
                ) : (
                  <>Your time zone: {local ? localTimeZoneLabel() : "…"}</>
                )}
              </p>
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            {result?.ok ? `Ready to go to ${people(result.recipientCount)}.` : "Fix the items above to unlock sending."}
          </p>
          <Button type="button" size="lg" className="px-4" disabled={!canLaunch || preparing || launching} onClick={openConfirm}>
            {preparing ? <Loader2 className="animate-spin" aria-hidden /> : mode === "now" ? <Send aria-hidden /> : <CalendarClock aria-hidden />}
            {mode === "now" ? "Send now…" : "Schedule…"}
          </Button>
        </div>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !launching && !open && setConfirm(null)}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.scheduledAt ? "Schedule this campaign?" : "Send this campaign now?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600">
              {confirm &&
                (confirm.scheduledAt ? (
                  <>
                    “<span className="font-medium text-zinc-900">{subject}</span>” will be sent to {people(confirm.recipients)} from{" "}
                    <span className="font-medium break-all text-zinc-900">{senderLabel}</span> on{" "}
                    <span className="font-medium text-zinc-900">{formatDateTime(confirm.scheduledAt, true)}</span> ({localTimeZoneLabel()}).
                    You can unschedule it until then.
                  </>
                ) : (
                  <>
                    Send “<span className="font-medium text-zinc-900">{subject}</span>” to {people(confirm.recipients)} from{" "}
                    <span className="font-medium break-all text-zinc-900">{senderLabel}</span>? This can&apos;t be undone.
                  </>
                ))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={launching}>Not yet</AlertDialogCancel>
            <Button onClick={launch} disabled={launching}>
              {launching ? <Loader2 className="animate-spin" aria-hidden /> : confirm?.scheduledAt ? <CalendarClock aria-hidden /> : <Send aria-hidden />}
              {confirm?.scheduledAt
                ? `Schedule for ${formatDateTime(confirm.scheduledAt, true)}`
                : `Send to ${formatCount(confirm?.recipients ?? 0)} ${confirm?.recipients === 1 ? "person" : "people"}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Checks({
  check,
  result,
  onFixSection,
}: {
  check: CheckState;
  result: Preflight | null;
  onFixSection: (section: SectionId) => void;
}) {
  if (check.kind === "error") {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
        {check.message}
      </p>
    );
  }
  if (!result) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking your campaign…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {result.ok ? (
        <p className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <span className="font-medium">Everything looks good.</span> {people(result.recipientCount)} will get this email.
          </span>
        </p>
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50/70 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-red-900">
            <CircleX className="size-4 shrink-0 text-red-600" aria-hidden />
            Fix {result.problems.length === 1 ? "this" : `these ${result.problems.length} things`} before sending
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {result.problems.map((p, i) => {
              const section = SECTION_FOR_CODE[p.code];
              return (
                <li key={`${p.code}-${i}`} className="flex flex-col gap-1 rounded-md bg-white/80 px-3 py-2 text-sm text-zinc-800 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="min-w-0">{p.message}</span>
                  {p.fix ? (
                    <Link href={p.fix.href} className="shrink-0 text-sm font-medium text-red-700 hover:underline">
                      {p.fix.label} →
                    </Link>
                  ) : section ? (
                    <button type="button" onClick={() => onFixSection(section)} className="w-fit shrink-0 text-sm font-medium text-red-700 hover:underline">
                      {SECTION_LABEL[section]} →
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
            Worth a look (these don&apos;t stop sending)
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-9 text-sm text-amber-900">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}

function WhenOption({
  checked,
  onSelect,
  icon: Icon,
  title,
  text,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: typeof Send;
  title: string;
  text: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-emerald-500/40",
        checked ? "border-emerald-500 bg-emerald-50/50" : "hover:border-zinc-300",
      )}
    >
      <input type="radio" name="send-when" checked={checked} onChange={onSelect} className="mt-1 size-4 shrink-0 accent-emerald-600" />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
          <Glyph icon={Icon} size="sm" />
          {title}
        </span>
        <span className="text-xs text-zinc-500">{text}</span>
      </span>
    </label>
  );
}

/** A Date as "YYYY-MM-DDTHH:mm" in the viewer's own time zone (what datetime-local expects). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
