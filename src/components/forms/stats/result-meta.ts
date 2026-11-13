import type { FormSubmissionResult } from "@/generated/prisma/client";

/** Plain-English names and badge colours for what happened to a submission. */
export const RESULT_META: Record<FormSubmissionResult, { label: string; help: string; className: string }> = {
  SUBSCRIBED: {
    label: "Subscribed",
    help: "Added to your contacts and lists.",
    className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  },
  PENDING: {
    label: "Awaiting confirmation",
    help: "We sent the confirmation email; they haven't clicked it yet.",
    className: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  ALREADY_SUBSCRIBED: {
    label: "Already subscribed",
    help: "They were already a subscriber, so nothing changed.",
    className: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  },
  NOT_RESUBSCRIBED: {
    label: "Not re-added",
    help: "They had unsubscribed, bounced or complained before, so we respected that.",
    className: "bg-orange-50 text-orange-800 ring-orange-600/20",
  },
  SUPPRESSED: {
    label: "On suppression list",
    help: "The address is on your suppression list, so it wasn't added.",
    className: "bg-orange-50 text-orange-800 ring-orange-600/20",
  },
  SPAM: {
    label: "Spam blocked",
    help: "Caught by the spam checks (hidden field, too fast or too many tries).",
    className: "bg-red-50 text-red-700 ring-red-600/20",
  },
};
