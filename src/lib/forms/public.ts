import "server-only";
import { cache } from "react";
import { getAppUrl } from "@/lib/app-url";
import { getBrandTheme } from "@/lib/brand-kit";
import type { AttributeTypeValue } from "@/lib/contacts/common";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { db } from "@/lib/db";
import { formConfigSchema, type FormConfig } from "./schema";

// Reading a sign-up form for the PUBLIC side (the hosted /f page, the
// thank-you page and the cross-site submit endpoint), plus small helpers they
// share: error codes and their wording, the redirect after signing up, and
// cleaning up the "where did this sign-up come from" address.
//
// Only what a visitor may see leaves this file: never list ids, counts or the
// workspace's internal names.

/** Public ids are random letters/digits; anything else can't be a form. */
const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export function isPlausiblePublicId(publicId: string): boolean {
  return PUBLIC_ID_RE.test(publicId);
}

export type PublicForm = {
  id: string;
  publicId: string;
  workspaceId: string;
  /** False when paused (or when the saved settings are broken). */
  accepting: boolean;
  /** The form's settings, minus fields whose custom field was deleted since. */
  config: FormConfig;
  /** The lists new subscribers join (server-side only; never sent to the page). */
  listIds: string[];
  /** The sender's look: brand kit logo and company name. */
  brand: { name: string; logoUrl: string | null };
  /** Type of each custom field on the form, keyed by attribute key ("CITY"). */
  attributeTypes: Record<string, AttributeTypeValue>;
};

/** "attr:CITY" → "CITY"; null for the built-in fields. */
export function attributeKeyOf(target: string): string | null {
  return target.startsWith("attr:") ? target.slice(5) : null;
}

/**
 * The form behind a public id, or null if there's no such form.
 * Wrapped in React's cache so the page and its metadata share one lookup.
 */
export const getPublicForm = cache(async (publicId: string): Promise<PublicForm | null> => {
  if (!isPlausiblePublicId(publicId)) return null;
  const form = await db.signupForm.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      workspaceId: true,
      status: true,
      config: true,
      listIds: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  if (!form) return null;

  const [theme, definitions] = await Promise.all([getBrandTheme(form.workspace), getAttributeDefinitions(form.workspaceId)]);
  const brand = { name: theme.companyName, logoUrl: theme.logoUrl };

  const parsed = formConfigSchema.safeParse(form.config);
  if (!parsed.success) {
    // Shouldn't happen (the builder validates before saving). Show the
    // "not accepting sign-ups" page rather than a broken form.
    console.warn(`[forms] form ${form.id} has invalid settings; showing it as paused.`);
    return {
      id: form.id,
      publicId: form.publicId,
      workspaceId: form.workspaceId,
      accepting: false,
      config: placeholderConfig(),
      listIds: [],
      brand,
      attributeTypes: {},
    };
  }

  // A custom field deleted after the form was built: drop it from the form
  // (we couldn't store the answer anyway).
  const types = new Map(definitions.map((d) => [d.key, d.type]));
  const fields = parsed.data.fields.filter((f) => {
    const key = attributeKeyOf(f.target);
    return key === null || types.has(key);
  });
  const attributeTypes: Record<string, AttributeTypeValue> = {};
  for (const f of fields) {
    const key = attributeKeyOf(f.target);
    if (key) attributeTypes[key] = types.get(key)!;
  }

  return {
    id: form.id,
    publicId: form.publicId,
    workspaceId: form.workspaceId,
    accepting: form.status === "ACTIVE",
    config: { ...parsed.data, fields },
    listIds: form.listIds,
    brand,
    attributeTypes,
  };
});

/** Minimal valid settings, only used to show a broken form as "paused". */
function placeholderConfig(): FormConfig {
  return {
    title: "",
    description: "",
    fields: [{ id: "f_email", target: "EMAIL", label: "Email", placeholder: "", required: true }],
    buttonLabel: "Subscribe",
    consentText: "",
    successTitle: "Thanks!",
    successMessage: "",
    redirectUrl: "",
    style: { accentColor: "#52525b", backgroundColor: "#ffffff", textColor: "#18181b", layout: "card", showLogo: true },
  };
}

// ── Errors ──────────────────────────────────────────────────────────────────
//
// Errors travel as short CODES ("EMAIL.invalid"), never as text built from
// what the visitor typed. That way the cross-site endpoint can pass them to
// the hosted page in the URL (?error=…) without putting anyone's data there,
// and both paths show exactly the same wording.

/** Problems with one field (or the consent box). */
export type FieldErrorCode = "required" | "invalid" | "too_long";
/** Problems with the whole submission (key "_form"). */
export type FormErrorCode = "busy" | "expired" | "failed" | "paused";
/** field target / "consent" / "_form" → code. */
export type ErrorCodes = Record<string, FieldErrorCode | FormErrorCode>;

const FIELD_CODES = new Set<string>(["required", "invalid", "too_long"]);
const FORM_CODES = new Set<string>(["busy", "expired", "failed", "paused"]);

const FORM_MESSAGES: Record<FormErrorCode, string> = {
  busy: "Too many sign-ups right now. Please wait a few minutes and try again.",
  expired: "This page was open for a long time. Please press the button again.",
  failed: "Something went wrong. Please try again.",
  paused: "This form isn't accepting sign-ups right now.",
};

const INVALID_BY_TYPE: Record<AttributeTypeValue, string> = {
  TEXT: "Please check this field.",
  NUMBER: "Please enter a number.",
  DATE: "Please enter a valid date (YYYY-MM-DD).",
  BOOLEAN: "Please choose yes or no.",
};

/** The wording for each error code, ready for the form. */
export function errorMessages(codes: ErrorCodes, form: Pick<PublicForm, "attributeTypes">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, code] of Object.entries(codes)) {
    if (key === "_form") {
      if (FORM_CODES.has(code)) out._form = FORM_MESSAGES[code as FormErrorCode];
      continue;
    }
    if (key === "consent") {
      out.consent = "Please tick the box to continue.";
      continue;
    }
    if (code === "too_long") out[key] = "This is too long.";
    else if (key === "EMAIL") out[key] = code === "required" ? "Please enter your email address." : "Please enter a valid email address.";
    else if (code === "required") out[key] = "This field is required.";
    else {
      const attrKey = attributeKeyOf(key);
      out[key] = INVALID_BY_TYPE[(attrKey && form.attributeTypes[attrKey]) || "TEXT"];
    }
  }
  return out;
}

/** {EMAIL: "invalid", consent: "required"} → "EMAIL.invalid,consent.required" (for ?error=). */
export function encodeErrorCodes(codes: ErrorCodes): string {
  return Object.entries(codes)
    .map(([key, code]) => `${key}.${code}`)
    .join(",");
}

/**
 * Reads ?error=… back. Anyone can type anything into a URL, so only keys that
 * exist on this form and codes we know survive (no made-up text can appear).
 */
export function decodeErrorCodes(raw: string, config: FormConfig): ErrorCodes {
  const keys = new Set<string>([...config.fields.map((f) => f.target), "consent", "_form"]);
  const out: ErrorCodes = {};
  for (const part of raw.slice(0, 1000).split(",")) {
    const dot = part.lastIndexOf(".");
    const key = part.slice(0, dot);
    const code = part.slice(dot + 1);
    if (dot <= 0 || !keys.has(key)) continue;
    if (key === "_form" ? FORM_CODES.has(code) : FIELD_CODES.has(code)) out[key] = code as FieldErrorCode;
  }
  return out;
}

// ── URLs ────────────────────────────────────────────────────────────────────

/**
 * The form's "send people here after signing up" address with ?subscribed=1
 * added, or null if it isn't a plain http(s) web address. The builder
 * validates it too; this is the last check before we redirect anyone.
 */
export function subscribedRedirectUrl(redirectUrl: string): string | null {
  if (!redirectUrl) return null;
  let url: URL;
  try {
    url = new URL(redirectUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // "https://user:pass@site" tricks people about where they're going.
  if (url.username || url.password) return null;
  url.searchParams.set("subscribed", "1");
  return url.toString();
}

/**
 * The page a sign-up came from (Referer/Origin), cleaned up for storing:
 * http(s) only, no login details, no ?query or #hash (they can hold personal
 * data such as an email address), at most 500 characters. Our own app's
 * pages don't count (that's just the hosted page or the dashboard).
 */
export function cleanSourceUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 4000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  let appOrigin = "";
  try {
    appOrigin = new URL(getAppUrl()).origin;
  } catch {}
  if (url.origin === appOrigin) return null;
  const clean = `${url.origin}${url.pathname}`;
  return clean.length > 500 ? clean.slice(0, 500) : clean;
}
