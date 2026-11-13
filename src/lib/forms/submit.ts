import "server-only";
import { after } from "next/server";
import type { FormSubmissionResult } from "@/generated/prisma/client";
import { emailSchema, parseAttributeValue, type AttributeValue } from "@/lib/contacts/common";
import { db } from "@/lib/db";
import { addPendingContact } from "@/lib/optin";
import { hashIp } from "@/lib/tracking/ip";
import { attributeKeyOf, getPublicForm, subscribedRedirectUrl, type ErrorCodes, type PublicForm } from "./public";
import { HONEYPOT_FIELD, RENDERED_AT_FIELD } from "./schema";
import {
  FORM_SIZE_LIMITS,
  checkRenderedAtToken,
  hitBurstLimit,
  hitEmailLimit,
  hitSignupLimits,
  honeypotFilled,
} from "./spam";

// Handling one submission of a PUBLIC sign-up form. Used by both doors in:
//   - the hosted page's Server Action (src/app/f/[publicId]/actions.ts)
//   - the cross-site endpoint (src/app/api/forms/[publicId]/submit/route.ts)
//
// The most important rule: the visitor sees the SAME answer whether the
// address is new, already subscribed, unsubscribed, bounced or suppressed.
// Otherwise anyone could use the form to find out who is on a list.
// Only problems with what they typed (and "too busy") are shown.
//
// "The same answer" also means the same TIMING. Adding a new contact with
// double opt-in sends an email (slow); an existing subscriber needs nothing
// (fast). So the real work (adding the contact, sending the confirmation,
// recording the submission) runs with Next's `after()`, AFTER the response
// has been sent. The visitor's answer only depends on checks that take the
// same time for everyone.

/** Facts about the request, worked out by the route/action. */
export type SubmitMeta = {
  /** From clientIp(); "unknown" when there are no proxy headers. Only a hash is stored. */
  ip: string;
  userAgent: string | null;
  /** Already cleaned with cleanSourceUrl() (or null). */
  sourceUrl: string | null;
  /**
   * "hosted" = our own /f page, which always carries the signed timestamp.
   * "snippet" = a plain HTML form on another website posting to our API; it
   * can't carry a signed timestamp, so a missing one is accepted there.
   */
  channel: "hosted" | "snippet";
};

export type SubmitOutcome =
  /** No such form (or a malformed id). */
  | { status: "not_found" }
  /** The form is paused. */
  | { status: "paused"; form: PublicForm }
  /** A rate limit was hit; nothing was saved. `form` is missing when we didn't even look it up. */
  | { status: "busy"; retryAfterSeconds: number; form: PublicForm | null }
  /** Something the visitor typed needs fixing. `values` re-fills the form. */
  | { status: "invalid"; form: PublicForm; codes: ErrorCodes; values: Record<string, string> }
  /** Shown as "thanks" for EVERY accepted outcome (and for spam). */
  | { status: "success"; form: PublicForm; redirectTo: string | null };

/** Runs work after the response. Tests pass their own (after() needs a request). */
export type Defer = (task: () => Promise<void>) => void;

/**
 * FormData (from a Server Action or a multipart/urlencoded body) → plain
 * strings. Takes the first value of each name, skips files and Next's own
 * "$ACTION…" fields, and looks at a limited number of fields. Values are cut
 * just past the length limit, so "too long" is still detected without
 * keeping huge strings around.
 */
export function fieldsFromFormData(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || name.startsWith("$ACTION") || name in out) continue;
    if (++count > FORM_SIZE_LIMITS.fieldCount) break;
    out[name] = value.slice(0, FORM_SIZE_LIMITS.valueChars + 1);
  }
  return out;
}

type Valid = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  attributes: Record<string, AttributeValue>;
};

/** Checks every field of the form. Unknown/extra fields in the request are ignored. */
function validate(form: PublicForm, raw: Record<string, string>): { codes: ErrorCodes; values: Record<string, string>; data: Valid } {
  const codes: ErrorCodes = {};
  const values: Record<string, string> = {};
  const data: Valid = { email: "", firstName: null, lastName: null, attributes: {} };

  for (const field of form.config.fields) {
    const target = field.target;
    const rawValue = raw[target] ?? "";
    values[target] = rawValue.slice(0, FORM_SIZE_LIMITS.valueChars);
    let value = rawValue.trim();
    if (value.length > FORM_SIZE_LIMITS.valueChars) {
      codes[target] = "too_long";
      continue;
    }

    const key = attributeKeyOf(target);
    const type = key ? form.attributeTypes[key] : null;
    // A checkbox without a value="" attribute sends "on" when ticked.
    if (type === "BOOLEAN" && value.toLowerCase() === "on") value = "true";

    if (value === "") {
      if (field.required || target === "EMAIL") codes[target] = "required";
      continue;
    }

    if (target === "EMAIL") {
      const parsed = emailSchema.safeParse(value);
      if (parsed.success) data.email = parsed.data;
      else codes[target] = "invalid";
    } else if (target === "FIRSTNAME" || target === "LASTNAME") {
      if (value.length > 100) codes[target] = "too_long";
      else if (target === "FIRSTNAME") data.firstName = value;
      else data.lastName = value;
    } else if (key && type) {
      const parsed = parseAttributeValue(type, value);
      if (!parsed.ok) codes[target] = "invalid";
      else if (parsed.value !== null) data.attributes[key] = parsed.value;
    }
  }

  // The consent box, when the form has consent wording. Ticking it is the
  // visitor's proof of consent, so it can't be skipped.
  if (form.config.consentText) {
    if ((raw.consent ?? "").trim() === "") codes.consent = "required";
    else values.consent = "yes";
  }
  return { codes, values, data };
}

/** The visitor's email if it's a valid address (for recording spam), else null. */
function emailOrNull(raw: Record<string, string>): string | null {
  const parsed = emailSchema.safeParse((raw.EMAIL ?? "").slice(0, 300));
  return parsed.success ? parsed.data : null;
}

/**
 * Saves the FormSubmission row and (for real sign-ups) bumps the form's
 * counter in one transaction. SPAM isn't counted in submissionCount: that
 * number is "sign-ups" on the forms list; spam is visible in the stats.
 */
async function record(
  form: PublicForm,
  meta: SubmitMeta,
  row: { result: FormSubmissionResult; email: string | null; contactId: string | null },
): Promise<void> {
  const create = db.formSubmission.create({
    data: {
      formId: form.id,
      contactId: row.contactId,
      email: row.email,
      result: row.result,
      ipHash: hashIp(meta.ip),
      userAgent: meta.userAgent?.slice(0, 500) || null,
      sourceUrl: meta.sourceUrl,
    },
  });
  if (row.result === "SPAM") {
    await create;
    return;
  }
  await db.$transaction([create, db.signupForm.update({ where: { id: form.id }, data: { submissionCount: { increment: 1 } } })]);
}

/** Adds the contact (double opt-in aware) and records what happened. Runs after the response. */
async function processSignup(form: PublicForm, meta: SubmitMeta, data: Valid): Promise<void> {
  const workspaceId = form.workspaceId;
  // The form's own lists, and only those that still exist in ITS workspace.
  // List ids NEVER come from the request.
  const listIds = form.listIds.length
    ? (await db.contactList.findMany({ where: { workspaceId, id: { in: form.listIds } }, select: { id: true } })).map((l) => l.id)
    : [];

  // addPendingContact doesn't say "was already subscribed" vs "had
  // unsubscribed", so look at the status before and after.
  const before = await db.contact.findUnique({
    where: { workspaceId_email: { workspaceId, email: data.email } },
    select: { status: true },
  });
  const added = await addPendingContact(workspaceId, {
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    attributes: data.attributes,
    listIds,
    source: "form",
    ip: meta.ip === "unknown" ? null : meta.ip,
    userAgent: meta.userAgent,
  });

  let result: FormSubmissionResult;
  if (added.suppressed) result = "SUPPRESSED";
  else if (before?.status === "SUBSCRIBED") result = "ALREADY_SUBSCRIBED";
  // UNSUBSCRIBED, BOUNCED or COMPLAINED: they said no (or the address is dead). Never resubscribed.
  else if (before && before.status !== "PENDING") result = "NOT_RESUBSCRIBED";
  else {
    const now = added.contactId
      ? await db.contact.findUnique({ where: { id: added.contactId }, select: { status: true } })
      : null;
    result = now?.status === "SUBSCRIBED" ? "SUBSCRIBED" : "PENDING";
  }
  await record(form, meta, { result, email: data.email, contactId: added.contactId });
}

/** Runs a deferred task and logs (never throws) if it fails: the visitor already got their answer. */
function safely(defer: Defer, label: string, task: () => Promise<void>) {
  defer(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[forms] ${label} failed:`, error);
    }
  });
}

/**
 * Handles one submission. `raw` holds the posted fields (see
 * fieldsFromFormData). Never throws for bad input; the caller turns the
 * outcome into a page, a redirect or JSON.
 */
export async function submitForm(
  publicId: string,
  raw: Record<string, string>,
  meta: SubmitMeta,
  opts: { defer?: Defer } = {},
): Promise<SubmitOutcome> {
  const defer: Defer = opts.defer ?? ((task) => after(task));

  // Before any database work: one IP can't hammer us with junk.
  const burst = hitBurstLimit(meta.ip);
  if (!burst.ok) return { status: "busy", retryAfterSeconds: burst.retryAfterSeconds, form: null };

  const form = await getPublicForm(publicId);
  if (!form) return { status: "not_found" };
  if (!form.accepting) return { status: "paused", form };
  const success: SubmitOutcome = { status: "success", form, redirectTo: subscribedRedirectUrl(form.config.redirectUrl) };

  // ── Spam: honeypot and timing ──
  const stamp = raw[RENDERED_AT_FIELD];
  // The cross-site snippet can't sign a timestamp: a missing one is fine there
  // (but a present one must be genuine).
  const timing = meta.channel === "snippet" && !stamp ? "ok" : checkRenderedAtToken(form.id, stamp);
  if (honeypotFilled(raw[HONEYPOT_FIELD]) || timing === "missing" || timing === "invalid" || timing === "too_fast") {
    // Spam counts against the per-IP limit too, so a bot can't fill our
    // database with SPAM rows.
    const limit = hitSignupLimits(meta.ip, form.id);
    if (!limit.ok) return { status: "busy", retryAfterSeconds: limit.retryAfterSeconds, form };
    const email = emailOrNull(raw);
    safely(defer, "recording spam", () => record(form, meta, { result: "SPAM", email, contactId: null }));
    // The normal "thanks", so the bot can't tell it was caught.
    return success;
  }

  // ── What they typed ──
  const { codes, values, data } = validate(form, raw);
  if (Object.keys(codes).length) return { status: "invalid", form, codes, values };
  if (timing === "expired") return { status: "invalid", form, codes: { _form: "expired" }, values };

  // ── Rate limits (only sign-ups that would really be processed count) ──
  const limit = hitSignupLimits(meta.ip, form.id);
  if (!limit.ok) return { status: "busy", retryAfterSeconds: limit.retryAfterSeconds, form };
  if (!hitEmailLimit(data.email).ok) {
    // Someone keeps submitting this address (maybe to flood its inbox with
    // confirmation emails). Quietly do nothing, with the normal answer: an
    // error here would also tell a stranger that this address is "busy".
    safely(defer, "recording spam", () => record(form, meta, { result: "SPAM", email: data.email, contactId: null }));
    return success;
  }

  safely(defer, "processing a sign-up", () => processSignup(form, meta, data));
  return success;
}
