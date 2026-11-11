// Shared types for sending email. Safe to import from server AND client.

export type EmailAddress = { email: string; name?: string };

/** One email, ready to hand to a provider. */
export type OutgoingEmail = {
  from: EmailAddress;
  to: EmailAddress;
  replyTo?: string;
  subject: string;
  html: string;
  /** Plain-text version. Strongly recommended for deliverability. */
  text?: string;
  /** Extra headers, e.g. List-Unsubscribe (used from Phase 4/6). */
  headers?: Record<string, string>;
  /** Our own id for this message, passed to providers that support tags/metadata. */
  tags?: Record<string, string>;
};

export type SendResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      error: string;
      /** true = temporary problem (rate limit, timeout): worth retrying later. */
      retryable: boolean;
    };

export type ConnectionCheckResult =
  | {
      ok: true;
      detail?: string;
      /** Rate limits the provider reported (e.g. Amazon SES quotas), to suggest a speed limit. */
      limits?: { maxPerSecond?: number; max24Hour?: number };
    }
  | { ok: false; error: string };
