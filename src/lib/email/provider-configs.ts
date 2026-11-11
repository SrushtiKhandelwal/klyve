// What each email provider needs from the user, in ONE place.
// The settings form is generated from `fields`, the server validates with
// `schema`, the adapters (src/lib/email/providers/*) receive the parsed value,
// and `hint` builds the safe summary we may show in the UI.
// Safe to import from server AND client (no secrets live here).
import { z } from "zod";

export const PROVIDER_TYPES = [
  "SMTP",
  "AMAZON_SES",
  "RESEND",
  "SENDGRID",
  "MAILGUN",
  "POSTMARK",
] as const;
export type ProviderTypeValue = (typeof PROVIDER_TYPES)[number];

export type ProviderField = {
  name: string;
  label: string;
  kind: "text" | "password" | "number" | "select" | "checkbox";
  placeholder?: string;
  help?: string;
  /** Secrets are never sent back to the browser; leaving them blank on edit keeps the old value. */
  secret?: boolean;
  optional?: boolean;
  options?: { value: string; label: string }[];
};

const trimmed = (label: string) => z.string().trim().min(1, `${label} is required.`).max(500);
const secret = (label: string) => z.string().trim().min(1, `${label} is required.`).max(2000);

// ── Credential shapes ────────────────────────────────────────────────────────

export const smtpSchema = z.object({
  host: trimmed("Host").regex(/^[a-zA-Z0-9.-]+$/, "Enter a hostname like smtp.example.com."),
  port: z.coerce.number().int().min(1).max(65535),
  /** true = TLS from the start (usually port 465). false = STARTTLS upgrade (usually 587). */
  // Not z.coerce.boolean(): that turns the TEXT "false" into true.
  secure: z
    .union([z.boolean(), z.enum(["true", "false", "on", "off"]).transform((v) => v === "true" || v === "on")])
    .default(false),
  username: trimmed("Username"),
  password: secret("Password"),
});

export const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2", "ca-central-1",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1", "eu-south-1",
  "ap-south-1", "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "ap-northeast-3", "sa-east-1", "me-south-1", "af-south-1", "il-central-1",
] as const;

export const sesSchema = z.object({
  region: z.enum(AWS_REGIONS),
  accessKeyId: trimmed("Access key ID").regex(/^[A-Z0-9]{16,128}$/, "That doesn't look like an AWS access key ID."),
  secretAccessKey: secret("Secret access key"),
  configurationSet: z.string().trim().max(64).optional().or(z.literal("")).transform((v) => v || undefined),
});

export const resendSchema = z.object({ apiKey: secret("API key") });
export const sendgridSchema = z.object({ apiKey: secret("API key") });

export const mailgunSchema = z.object({
  apiKey: secret("API key"),
  domain: trimmed("Sending domain").regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, "Enter a domain like mg.example.com."),
  region: z.enum(["us", "eu"]),
});

export const postmarkSchema = z.object({
  serverToken: secret("Server API token"),
  /** Postmark requires marketing email to use a "broadcast" stream. */
  messageStream: z.string().trim().min(1).max(100).default("broadcast"),
});

export type SmtpCredentials = z.infer<typeof smtpSchema>;
export type SesCredentials = z.infer<typeof sesSchema>;
export type ResendCredentials = z.infer<typeof resendSchema>;
export type SendgridCredentials = z.infer<typeof sendgridSchema>;
export type MailgunCredentials = z.infer<typeof mailgunSchema>;
export type PostmarkCredentials = z.infer<typeof postmarkSchema>;

/** Credentials for a provider, tagged by type. This is what gets encrypted. */
export type ProviderCredentials =
  | { type: "SMTP"; config: SmtpCredentials }
  | { type: "AMAZON_SES"; config: SesCredentials }
  | { type: "RESEND"; config: ResendCredentials }
  | { type: "SENDGRID"; config: SendgridCredentials }
  | { type: "MAILGUN"; config: MailgunCredentials }
  | { type: "POSTMARK"; config: PostmarkCredentials };

const last4 = (s: string) => (s ? `••••${s.slice(-4)}` : "");

// ── Per-provider definitions ─────────────────────────────────────────────────

export type ProviderDefinition = {
  type: ProviderTypeValue;
  label: string;
  description: string;
  /** Where the user gets their credentials. */
  docsUrl: string;
  fields: ProviderField[];
  schema: z.ZodType;
  /** Safe summary for the UI (never includes full secrets). */
  hint: (config: Record<string, unknown>) => Record<string, string>;
  /** A sensible starting speed limit (emails per second). */
  defaultMaxPerSecond: number;
  /** DKIM selectors this provider usually uses, for the domain checker. */
  dkimSelectorHints: string[];
};

export const PROVIDERS: Record<ProviderTypeValue, ProviderDefinition> = {
  SMTP: {
    type: "SMTP",
    label: "SMTP server",
    description: "Gmail, Outlook, Zoho, Brevo SMTP, or any mail server that speaks SMTP.",
    docsUrl: "https://support.google.com/mail/answer/185833",
    fields: [
      { name: "host", label: "Host", kind: "text", placeholder: "smtp.gmail.com" },
      { name: "port", label: "Port", kind: "number", placeholder: "465", help: "465 for SSL/TLS, 587 for STARTTLS." },
      { name: "secure", label: "Use SSL/TLS from the start (port 465)", kind: "checkbox" },
      { name: "username", label: "Username", kind: "text", placeholder: "you@gmail.com" },
      {
        name: "password",
        label: "Password",
        kind: "password",
        secret: true,
        help: "For Gmail, create an App Password (Google Account → Security → App passwords). Your normal password won't work.",
      },
    ],
    schema: smtpSchema,
    hint: (c) => ({ host: `${c.host}:${c.port}`, username: String(c.username ?? "") }),
    defaultMaxPerSecond: 1,
    dkimSelectorHints: ["google", "selector1", "selector2", "default"],
  },
  AMAZON_SES: {
    type: "AMAZON_SES",
    label: "Amazon SES",
    description: "Very cheap at scale (about $0.10 per 1,000 emails). Uses an IAM access key.",
    docsUrl: "https://docs.aws.amazon.com/ses/latest/dg/send-email-set-up.html",
    fields: [
      {
        name: "region",
        label: "Region",
        kind: "select",
        options: AWS_REGIONS.map((r) => ({ value: r, label: r })),
        help: "The region where your SES identities are verified.",
      },
      { name: "accessKeyId", label: "Access key ID", kind: "text", placeholder: "AKIA…" },
      {
        name: "secretAccessKey",
        label: "Secret access key",
        kind: "password",
        secret: true,
        help: "Create an IAM user that only has the ses:SendEmail and ses:GetAccount permissions.",
      },
      { name: "configurationSet", label: "Configuration set", kind: "text", optional: true, help: "Optional. Used for tracking bounces in Phase 5." },
    ],
    schema: sesSchema,
    hint: (c) => ({ region: String(c.region ?? ""), accessKeyId: last4(String(c.accessKeyId ?? "")) }),
    defaultMaxPerSecond: 1,
    dkimSelectorHints: [],
  },
  RESEND: {
    type: "RESEND",
    label: "Resend",
    description: "Developer-friendly email API with a free tier.",
    docsUrl: "https://resend.com/docs/dashboard/api-keys/introduction",
    fields: [{ name: "apiKey", label: "API key", kind: "password", secret: true, placeholder: "re_…" }],
    schema: resendSchema,
    hint: (c) => ({ apiKey: last4(String(c.apiKey ?? "")) }),
    defaultMaxPerSecond: 2,
    dkimSelectorHints: ["resend"],
  },
  SENDGRID: {
    type: "SENDGRID",
    label: "SendGrid",
    description: "Twilio SendGrid email API.",
    docsUrl: "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys",
    fields: [{ name: "apiKey", label: "API key", kind: "password", secret: true, placeholder: "SG.…", help: "Needs the Mail Send permission." }],
    schema: sendgridSchema,
    hint: (c) => ({ apiKey: last4(String(c.apiKey ?? "")) }),
    defaultMaxPerSecond: 10,
    dkimSelectorHints: ["s1", "s2"],
  },
  MAILGUN: {
    type: "MAILGUN",
    label: "Mailgun",
    description: "Mailgun email API (US or EU region).",
    docsUrl: "https://documentation.mailgun.com/docs/mailgun/user-manual/get-started/",
    fields: [
      { name: "apiKey", label: "API key", kind: "password", secret: true },
      { name: "domain", label: "Sending domain", kind: "text", placeholder: "mg.example.com" },
      {
        name: "region",
        label: "Region",
        kind: "select",
        options: [
          { value: "us", label: "US (api.mailgun.net)" },
          { value: "eu", label: "EU (api.eu.mailgun.net)" },
        ],
      },
    ],
    schema: mailgunSchema,
    hint: (c) => ({ domain: String(c.domain ?? ""), region: String(c.region ?? "").toUpperCase(), apiKey: last4(String(c.apiKey ?? "")) }),
    defaultMaxPerSecond: 10,
    dkimSelectorHints: ["mx", "smtp", "k1", "pic"],
  },
  POSTMARK: {
    type: "POSTMARK",
    label: "Postmark",
    description: "Postmark email API. Marketing email must use a Broadcast stream.",
    docsUrl: "https://postmarkapp.com/support/article/1008-what-are-the-account-and-server-api-tokens",
    fields: [
      { name: "serverToken", label: "Server API token", kind: "password", secret: true },
      { name: "messageStream", label: "Message stream", kind: "text", placeholder: "broadcast", help: "The ID of a Broadcast message stream in your Postmark server." },
    ],
    schema: postmarkSchema,
    hint: (c) => ({ messageStream: String(c.messageStream ?? ""), serverToken: last4(String(c.serverToken ?? "")) }),
    defaultMaxPerSecond: 10,
    dkimSelectorHints: [],
  },
};

/** Parses raw form values into typed credentials for a provider. */
export function parseProviderCredentials(
  type: ProviderTypeValue,
  raw: Record<string, unknown>,
): { ok: true; credentials: ProviderCredentials } | { ok: false; errors: Record<string, string[]> } {
  const result = PROVIDERS[type].schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, errors: z.flattenError(result.error).fieldErrors as Record<string, string[]> };
  }
  return { ok: true, credentials: { type, config: result.data } as ProviderCredentials };
}

// ── Ready-made SMTP settings for popular services ───────────────────────────

export type SmtpPreset = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  note: string;
  maxPerSecond: number;
  /** Daily sending limit the service enforces (for information / default cap). */
  dailyLimit?: number;
};

export const SMTP_PRESETS: SmtpPreset[] = [
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    note: "Needs 2-step verification and an App Password. Free Gmail allows about 500 emails a day; Google Workspace about 2,000.",
    maxPerSecond: 1,
    dailyLimit: 500,
  },
  {
    id: "outlook",
    label: "Outlook / Microsoft 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    note: "SMTP AUTH must be enabled for the mailbox. Limit about 10,000 recipients a day.",
    maxPerSecond: 1,
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    note: "Use smtp.zoho.in / smtp.zoho.eu if your account is in that region.",
    maxPerSecond: 1,
  },
  {
    id: "brevo",
    label: "Brevo SMTP relay",
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    note: "Use your SMTP login and an SMTP key from Brevo → SMTP & API.",
    maxPerSecond: 5,
  },
];
