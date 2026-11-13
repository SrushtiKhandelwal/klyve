// Labels, colours and messages for the suppression list. Safe to import from
// BOTH server and client code (no database access here).

export const SUPPRESSION_REASONS = ["MANUAL", "HARD_BOUNCE", "COMPLAINT", "UNSUBSCRIBE", "IMPORT", "ERASURE"] as const;
export type SuppressionReasonValue = (typeof SUPPRESSION_REASONS)[number];

/** Reasons a person may pick when adding addresses by hand or from a file. */
export const MANUAL_REASONS = ["MANUAL", "IMPORT"] as const satisfies readonly SuppressionReasonValue[];
export type ManualReasonValue = (typeof MANUAL_REASONS)[number];

/** Badge text + colour + a one-line explanation for each reason. */
export const SUPPRESSION_REASON_META: Record<
  SuppressionReasonValue,
  { label: string; description: string; className: string }
> = {
  MANUAL: {
    label: "Manual",
    description: "Added by someone in this workspace.",
    className: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  },
  IMPORT: {
    label: "Imported",
    description: "Imported from another tool's suppression or unsubscribe list.",
    className: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  HARD_BOUNCE: {
    label: "Hard bounce",
    description: "The address doesn't exist. Added automatically.",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  COMPLAINT: {
    label: "Spam complaint",
    description: "Marked one of your emails as spam. Added automatically.",
    className: "bg-red-50 text-red-700 ring-red-600/20",
  },
  UNSUBSCRIBE: {
    label: "Unsubscribed",
    description: "Asked never to be emailed again.",
    className: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  ERASURE: {
    label: "Erased (GDPR)",
    description: "The person asked to be forgotten. Only a fingerprint (hash) of the address is kept.",
    className: "bg-zinc-800 text-white ring-zinc-900/20",
  },
};

/** Max addresses per "Add addresses" paste or CSV upload. */
export const MAX_SUPPRESSIONS_PER_ADD = 5_000;
/** Max length of the optional note. */
export const SUPPRESSION_NOTE_MAX = 500;

/** "sha256:" + 64 hex characters: how ERASURE rows store the address. */
export const ERASURE_KEY_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * The friendly message shown when someone tries to add, re-subscribe or
 * re-create an address that is suppressed.
 */
export function suppressedMessage(reason: SuppressionReasonValue): string {
  if (reason === "ERASURE") {
    return "This person asked for their data to be erased (GDPR), so this address can't be added again.";
  }
  return `This address is on your suppression list (reason: ${SUPPRESSION_REASON_META[reason].label.toLowerCase()}). Remove it there first if you're sure you have permission.`;
}

/** Splits pasted text into entries: one per line, or separated by commas/semicolons/spaces. */
export function splitSuppressionInput(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
