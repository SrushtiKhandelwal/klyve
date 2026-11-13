import type { TransactionalStatusName } from "@/lib/transactional/schema";

// One place for how each transactional email status looks and what it means.
// Used by the logs list, the detail page and the API docs, so they never disagree.

export type StatusMeta = {
  label: string;
  /** Tailwind classes for the coloured pill. */
  className: string;
  /** One plain-English sentence. */
  meaning: string;
  /** Is this the end of the road (no more changes expected)? */
  final: boolean;
};

export const TRANSACTIONAL_STATUS_META: Record<TransactionalStatusName, StatusMeta> = {
  QUEUED: {
    label: "Queued",
    className: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
    meaning: "We accepted the email and it's waiting its turn to be sent. This usually takes a few seconds.",
    final: false,
  },
  SENDING: {
    label: "Sending",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
    meaning: "It's being handed to your sending provider right now. If the provider has a hiccup, we retry automatically.",
    final: false,
  },
  SENT: {
    label: "Sent",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    meaning: "Your sending provider accepted the email for delivery. It can still bounce later if the inbox doesn't exist.",
    final: false,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-50 text-red-700 ring-red-600/20",
    meaning: "We couldn't send it, even after retrying. Nothing reached the recipient.",
    final: true,
  },
  SUPPRESSED: {
    label: "Suppressed",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20",
    meaning:
      "Not sent, on purpose: this address hard-bounced before, marked your email as spam, or asked to be erased. Sending to it again would hurt your reputation.",
    final: true,
  },
  BOUNCED: {
    label: "Bounced",
    className: "bg-orange-50 text-orange-700 ring-orange-600/20",
    meaning: "It was sent, but the recipient's mail server rejected it (for example, the inbox doesn't exist).",
    final: true,
  },
  COMPLAINED: {
    label: "Complained",
    className: "bg-rose-50 text-rose-700 ring-rose-600/20",
    meaning: "It was delivered, and the recipient marked it as spam. We won't send them email again.",
    final: true,
  },
};

/** "sent" or "SENT" → "SENT"; anything unknown → null. */
export function parseStatus(value: string | null | undefined): TransactionalStatusName | null {
  const upper = String(value ?? "").toUpperCase();
  return Object.hasOwn(TRANSACTIONAL_STATUS_META, upper) ? (upper as TransactionalStatusName) : null;
}
