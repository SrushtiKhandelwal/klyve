// What the "Bounce & complaint tracking" card shows for each provider type:
// setup steps, docs links and the signing-secret fields.
// Safe to import from server AND client (no secrets live here).
import type { ProviderTypeValue } from "@/lib/email/provider-configs";

export type WebhookProviderType = Exclude<ProviderTypeValue, "SMTP">;

export type WebhookSecretField = {
  name: string;
  label: string;
  help?: string;
  placeholder?: string;
  /** Hidden while typing (password-style input). */
  masked?: boolean;
};

export type WebhookGuide = {
  /** Plain-language steps, shown as a numbered list. */
  steps: string[];
  /** The events to tick in the provider's dashboard. */
  events: string[];
  docsUrl: string;
  docsLabel: string;
  /** Title of the signing-secret section. */
  secretTitle: string;
  secretDescription: string;
  secretFields: WebhookSecretField[];
  /**
   * true when the provider can sign its webhooks: without the secret we then
   * show a "add your signing secret for full protection" warning.
   */
  supportsSignature: boolean;
};

export const WEBHOOK_GUIDES: Record<WebhookProviderType, WebhookGuide> = {
  AMAZON_SES: {
    steps: [
      "In the AWS console, open Amazon SNS in the same region as SES, and create a Standard topic (e.g. “klyve-events”).",
      "In that topic, create a subscription: protocol HTTPS, endpoint = the webhook URL above. Leave “raw message delivery” OFF. Klyve confirms the subscription automatically within a minute (its status turns “Confirmed”).",
      "In Amazon SES, open Configuration sets, create one (or use yours), and enter its name in this provider's “Configuration set” field above, then save.",
      "In the configuration set, add an event destination: choose the event types below, destination type Amazon SNS, and pick the topic from step 1.",
    ],
    events: ["Hard bounces", "Complaints", "Deliveries"],
    docsUrl: "https://docs.aws.amazon.com/ses/latest/dg/event-publishing-add-event-destination-sns.html",
    docsLabel: "AWS guide: SNS event destinations",
    secretTitle: "Topic lock",
    secretDescription:
      "Amazon signs every message with its own certificate, which Klyve checks, so no signing secret is needed. When the first subscription is confirmed, Klyve also locks this URL to that SNS topic, so messages from any other topic are refused.",
    secretFields: [
      {
        name: "topicArn",
        label: "SNS topic ARN",
        placeholder: "arn:aws:sns:us-east-1:123456789012:klyve-events",
        help: "Filled in automatically when the subscription is confirmed. Only change it if you move to another topic.",
      },
    ],
    supportsSignature: true,
  },
  RESEND: {
    steps: [
      "In Resend, open Webhooks and click “Add Webhook”.",
      "Paste the webhook URL above as the endpoint URL.",
      "Tick the events below, then save.",
      "Open the new webhook, copy its “Signing Secret” (starts with whsec_) and paste it below.",
    ],
    events: ["email.delivered", "email.bounced", "email.complained"],
    docsUrl: "https://resend.com/docs/dashboard/webhooks/introduction",
    docsLabel: "Resend guide: webhooks",
    secretTitle: "Signing secret",
    secretDescription: "Lets Klyve check that each event really comes from Resend.",
    secretFields: [{ name: "signingSecret", label: "Signing secret", placeholder: "whsec_…", masked: true }],
    supportsSignature: true,
  },
  SENDGRID: {
    steps: [
      "In SendGrid, open Settings → Mail Settings → Event Webhooks, and create a new webhook.",
      "Paste the webhook URL above as the “Post URL”.",
      "Under actions to be posted, tick the events below.",
      "Turn on “Signed Event Webhook Requests” (Security features), save, then copy the “Verification Key” and paste it below.",
    ],
    events: ["Delivered", "Bounced", "Dropped", "Spam Reports"],
    docsUrl: "https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features",
    docsLabel: "SendGrid guide: signed event webhooks",
    secretTitle: "Verification key",
    secretDescription: "SendGrid's public key. Klyve uses it to check that each event really comes from SendGrid.",
    secretFields: [
      {
        name: "publicKey",
        label: "Verification key (public key)",
        placeholder: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE…",
        help: "A long code starting with MFkw. It's a public key, so it's fine to paste it here.",
      },
    ],
    supportsSignature: true,
  },
  MAILGUN: {
    steps: [
      "In Mailgun, open Sending → Webhooks and pick your sending domain.",
      "For each event below, click “Add webhook”, choose the event type and paste the webhook URL above.",
      "On the same page, copy the “HTTP webhook signing key” and paste it below.",
    ],
    events: ["Delivered messages", "Permanent failure", "Temporary failure", "Spam complaints"],
    docsUrl: "https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks",
    docsLabel: "Mailgun guide: webhooks",
    secretTitle: "Webhook signing key",
    secretDescription: "Lets Klyve check that each event really comes from Mailgun.",
    secretFields: [{ name: "signingKey", label: "HTTP webhook signing key", masked: true }],
    supportsSignature: true,
  },
  POSTMARK: {
    steps: [
      "In Postmark, open your server, then the message stream you send campaigns with (usually “Broadcasts”).",
      "Open the Webhooks tab and click “Add webhook”.",
      "Paste the webhook URL above, and tick the events below.",
      "Optional but recommended: choose a username and password under “Basic auth credentials” in that form, and enter the same ones below.",
    ],
    events: ["Delivery", "Bounce", "Spam Complaint"],
    docsUrl: "https://postmarkapp.com/developer/webhooks/webhooks-overview",
    docsLabel: "Postmark guide: webhooks",
    secretTitle: "Basic auth (optional)",
    secretDescription:
      "Postmark doesn't sign its webhooks. The secret URL already protects them; a username and password add a second lock.",
    secretFields: [
      { name: "username", label: "Username", placeholder: "klyve" },
      { name: "password", label: "Password", masked: true },
    ],
    supportsSignature: false,
  },
};

export function isWebhookProviderType(type: ProviderTypeValue): type is WebhookProviderType {
  return type !== "SMTP";
}
