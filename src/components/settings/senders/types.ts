// Plain data the Senders page hands to its client components.
// (Dates are ISO strings so they pass cleanly from server to browser.)

export type SenderView = {
  id: string;
  email: string;
  name: string;
  replyTo: string | null;
  provider: { id: string; name: string } | null;
  verified: boolean;
  /** When the last code was sent (for the resend countdown). */
  verificationSentAt: string | null;
  /** A code was sent and can still be entered. */
  codeActive: boolean;
};

export type ProviderOption = {
  id: string;
  name: string;
  /** e.g. "Amazon SES" */
  typeLabel: string;
  isDefault: boolean;
};

/**
 * For the countdown on the "Resend code" button only. The server enforces the
 * real limit (SENDER_RULES.resendCooldownSeconds in src/lib/email/senders.ts).
 */
export const RESEND_COOLDOWN_SECONDS = 60;
