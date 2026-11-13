// The shape of a transactional "send one email" request and of the email
// object the API returns. Shared by the API routes, the sending code, the
// logs pages and the docs. Safe to import from server AND client.
//
//   POST /api/v1/emails
//   Authorization: Bearer klv_...
//   Idempotency-Key: order-1234-receipt        (optional)
//   {
//     "from": "Shop <hello@shop.com>" | { "email": "...", "name": "..." },
//     "to":   "anita@example.com"     | { "email": "...", "name": "..." },
//     "subject": "Your receipt",         ← optional with a template (the template's subject is used)
//     "html": "<p>Hi {{ params.name }}</p>", "text": "...",   ← OR "templateId"
//     "templateId": "cm...",
//     "params": { "name": "Anita", "order_id": 1234 },
//     "replyTo": "support@shop.com",
//     "tags": ["receipt"], "metadata": { "orderId": "1234" }
//   }
import { z } from "zod";

// ── Limits (also shown in the docs) ─────────────────────────────────────────

export const TRANSACTIONAL_LIMITS = {
  /** Largest HTML body accepted (characters). */
  htmlMax: 512_000,
  textMax: 200_000,
  subjectMax: 200,
  /** "params" as JSON. */
  paramsMaxBytes: 20_000,
  /** "metadata" as JSON. */
  metadataMaxBytes: 4_000,
  tagsMax: 10,
  tagMax: 50,
  idempotencyKeyMax: 100,
  /** Requests per second per API key (short bursts up to `burst`). */
  requestsPerSecond: 10,
  burst: 20,
  /** Active (not revoked) keys per workspace. */
  keysPerWorkspace: 20,
  /** Full email content is kept this long, then cleared (the log row stays). */
  contentRetentionDays: 30,
  /** Log rows are deleted after this many days. */
  logRetentionDays: 90,
} as const;

// ── Addresses ────────────────────────────────────────────────────────────────

const email = z.string().trim().toLowerCase().email().max(254);
const displayName = z
  .string()
  .trim()
  .max(100)
  // A name must not be able to add email headers.
  .refine((v) => !/[\r\n]/.test(v), "Names can't contain line breaks.");

/**
 * "anita@example.com", "Anita <anita@example.com>" or { email, name }.
 * Always comes out as { email, name? }.
 */
export const addressSchema = z.union([
  z.object({ email, name: displayName.optional() }),
  z.string().transform((raw, ctx) => {
    const m = raw.trim().match(/^(?:"?([^"<>]*?)"?\s*<([^<>]+)>|([^<>\s]+))$/);
    const parsedEmail = email.safeParse(m ? (m[2] ?? m[3]) : "");
    const parsedName = displayName.safeParse(m?.[1] ?? "");
    if (!m || !parsedEmail.success || !parsedName.success) {
      ctx.addIssue({ code: "custom", message: `"${raw.slice(0, 80)}" isn't a valid email address.` });
      return z.NEVER;
    }
    return { email: parsedEmail.data, name: parsedName.data || undefined };
  }),
]);
export type Address = { email: string; name?: string };

const jsonSize = (max: number, label: string) => (v: unknown, ctx: z.RefinementCtx) => {
  if (v !== undefined && JSON.stringify(v).length > max) {
    ctx.addIssue({ code: "custom", message: `"${label}" is too large (max ${max.toLocaleString("en")} bytes as JSON).` });
  }
};

// ── The request ──────────────────────────────────────────────────────────────

export const sendEmailInputSchema = z
  .object({
    from: addressSchema,
    to: addressSchema,
    subject: z
      .string()
      .trim()
      .max(TRANSACTIONAL_LIMITS.subjectMax)
      .refine((v) => !/[\r\n]/.test(v), "The subject can't contain line breaks.")
      .optional(),
    html: z.string().max(TRANSACTIONAL_LIMITS.htmlMax).optional(),
    text: z.string().max(TRANSACTIONAL_LIMITS.textMax).optional(),
    templateId: z.string().trim().min(1).max(40).optional(),
    /** Values for {{ params.* }} merge tags. */
    params: z.record(z.string(), z.unknown()).optional().superRefine(jsonSize(TRANSACTIONAL_LIMITS.paramsMaxBytes, "params")),
    replyTo: addressSchema.optional(),
    tags: z
      .array(z.string().trim().min(1).max(TRANSACTIONAL_LIMITS.tagMax).regex(/^[\w.:-]+$/, "Tags may use letters, numbers, _ . : -"))
      .max(TRANSACTIONAL_LIMITS.tagsMax)
      .optional(),
    /** Your own data, returned as-is when you read the email back. */
    metadata: z.record(z.string(), z.unknown()).optional().superRefine(jsonSize(TRANSACTIONAL_LIMITS.metadataMaxBytes, "metadata")),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.templateId && (v.html !== undefined || v.text !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["templateId"], message: "Send either a templateId or html/text, not both." });
    }
    if (!v.templateId && v.html === undefined && v.text === undefined) {
      ctx.addIssue({ code: "custom", path: ["html"], message: "Send html and/or text, or a templateId." });
    }
    if (!v.templateId && !v.subject) {
      ctx.addIssue({ code: "custom", path: ["subject"], message: "A subject is required (unless you use a template)." });
    }
  });
export type SendEmailInput = z.infer<typeof sendEmailInputSchema>;

// ── What the API returns ─────────────────────────────────────────────────────

export const TRANSACTIONAL_STATUSES = ["QUEUED", "SENDING", "SENT", "FAILED", "SUPPRESSED", "BOUNCED", "COMPLAINED"] as const;
export type TransactionalStatusName = (typeof TRANSACTIONAL_STATUSES)[number];

/** The JSON object for one email (lower-case status, ISO dates). */
export type PublicEmail = {
  id: string;
  object: "email";
  status: Lowercase<TransactionalStatusName>;
  to: Address;
  from: Address;
  replyTo: string | null;
  subject: string;
  templateId: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  /** Why it failed / was suppressed / bounced, in plain English. */
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

/** Every error the API returns looks like this, with a matching HTTP status. */
export type ApiErrorBody = { error: { code: ApiErrorCode; message: string; details?: unknown } };

export const API_ERROR_CODES = {
  invalid_request: 400, // body isn't valid JSON / fails validation (details = field problems)
  unauthorized: 401, // missing, wrong or revoked API key
  forbidden: 403, // e.g. the account's email isn't verified
  not_found: 404, // unknown email / template / contact id
  sender_not_verified: 422, // "from" isn't a verified sender of this workspace
  no_provider: 422, // no working sending provider
  idempotency_conflict: 409, // same Idempotency-Key, different body
  rate_limited: 429, // too many requests (Retry-After header says when to retry)
  internal_error: 500,
} as const;
export type ApiErrorCode = keyof typeof API_ERROR_CODES;

/** Shown in the docs and the dashboard. Keys look like klv_ + 40 letters/digits. */
export const API_KEY_PREFIX = "klv_";
export const API_KEY_PATTERN = /^klv_[A-Za-z0-9]{40}$/;
