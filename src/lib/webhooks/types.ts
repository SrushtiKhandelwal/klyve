// Shared shapes for provider webhooks (bounces, complaints, deliveries).
// Every provider's payload is turned into the same small "WebhookEvent", so
// the code that finds the recipient and records the event is written once.

export type WebhookEventType = "DELIVERED" | "BOUNCED" | "COMPLAINED";

/** One thing a provider told us about one email we sent. */
export type WebhookEvent = {
  type: WebhookEventType;
  /** Our CampaignRecipient id, read back from the tags/metadata we attached when sending. */
  recipientId?: string;
  /** Our Campaign id from the same tags (used as an extra consistency check). */
  campaignId?: string;
  /** The provider's id for the email (what the send call returned), as a fallback. */
  messageId?: string;
  /** Only for BOUNCED: "hard" = the address doesn't exist, "soft" = temporary. */
  bounceType?: "hard" | "soft";
  /** The provider's explanation, e.g. "550 5.1.1 user unknown" (shortened). */
  diagnostic?: string;
  /** The provider's id for THIS event, so a retried webhook isn't counted twice. */
  providerEventId?: string;
  /** When it happened, according to the provider. */
  at?: Date;
};

/** The ids we put on every campaign email (see src/lib/campaigns/send-one.ts). */
export type KlyveTags = { kind?: string; campaign_id?: string; recipient_id?: string };
