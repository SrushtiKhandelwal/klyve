// Shared contact rules used by the contact form, CSV import, custom
// attributes and segments. Safe to import from BOTH server and client code
// (no database access here).
import { z } from "zod";

/** "  Priya@Example.COM " → "priya@example.com". Always store emails like this. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Validates AND normalizes an email address. */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .pipe(z.email("Please enter a valid email address."))
  .transform(normalizeEmail);

export const CONTACT_STATUSES = ["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED", "COMPLAINED", "PENDING"] as const;
export type ContactStatusValue = (typeof CONTACT_STATUSES)[number];

/** Labels + badge colours for each status, so every screen shows them the same way. */
export const CONTACT_STATUS_META: Record<
  ContactStatusValue,
  { label: string; description: string; className: string }
> = {
  SUBSCRIBED: {
    label: "Subscribed",
    description: "Can receive campaigns.",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  UNSUBSCRIBED: {
    label: "Unsubscribed",
    description: "Opted out. Will not receive campaigns.",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
  },
  BOUNCED: {
    label: "Bounced",
    description: "The address could not receive email.",
    className: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  COMPLAINED: {
    label: "Complained",
    description: "Marked an email as spam. Will not receive campaigns.",
    className: "bg-red-50 text-red-700 ring-red-600/20",
  },
  PENDING: {
    label: "Awaiting confirmation",
    description: "Double opt-in: hasn't clicked the confirmation link yet. Won't receive campaigns until they do.",
    className: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
};

export const ATTRIBUTE_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN"] as const;
export type AttributeTypeValue = (typeof ATTRIBUTE_TYPES)[number];

export const ATTRIBUTE_TYPE_LABELS: Record<AttributeTypeValue, string> = {
  TEXT: "Text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / No",
};

/**
 * Built-in fields every contact has. Custom attribute keys may not reuse these.
 * Templates use them as {{ contact.EMAIL }}, {{ contact.FIRSTNAME }}, ...
 */
export const BUILTIN_FIELDS = [
  { key: "EMAIL", label: "Email", column: "email" },
  { key: "FIRSTNAME", label: "First name", column: "firstName" },
  { key: "LASTNAME", label: "Last name", column: "lastName" },
] as const;

export const RESERVED_ATTRIBUTE_KEYS = new Set<string>([
  ...BUILTIN_FIELDS.map((f) => f.key),
  "ID",
  "STATUS",
  "CREATED_AT",
  "UPDATED_AT",
  "LISTS",
]);

/** "Favourite colour" → "FAVOURITE_COLOUR". */
export function toAttributeKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** A valid key: starts with a letter, then letters/digits/underscores. */
export const attributeKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,39}$/, "Use capital letters, numbers and _ (start with a letter).")
  .refine((key) => !RESERVED_ATTRIBUTE_KEYS.has(key), "This name is reserved for a built-in field.");

/** The JSON value we store for one attribute. null means "no value". */
export type AttributeValue = string | number | boolean | null;

/**
 * Turns raw text (from a form field or a CSV cell) into the value we store
 * for an attribute of the given type. Empty input → null (clears the value).
 *  - TEXT:    trimmed string (max 1000 chars)
 *  - NUMBER:  finite number; accepts "1,234.5"
 *  - DATE:    "YYYY-MM-DD"; also accepts "DD/MM/YYYY" and "DD-MM-YYYY"
 *  - BOOLEAN: true for yes/true/1/y, false for no/false/0/n (any case)
 */
export function parseAttributeValue(
  type: AttributeTypeValue,
  raw: unknown,
): { ok: true; value: AttributeValue } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "boolean" && type === "BOOLEAN") return { ok: true, value: raw };
  if (typeof raw === "number" && type === "NUMBER" && Number.isFinite(raw)) {
    return { ok: true, value: raw };
  }

  const text = String(raw).trim();
  if (text === "") return { ok: true, value: null };

  switch (type) {
    case "TEXT":
      if (text.length > 1000) return { ok: false, error: "Text is longer than 1000 characters." };
      return { ok: true, value: text };

    case "NUMBER": {
      const n = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `"${text}" is not a number.` };
      return { ok: true, value: n };
    }

    case "DATE": {
      let iso: string | null = null;
      let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
      if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
      if (!iso && m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      // Check the date really exists (e.g. rejects 2025-02-30).
      if (iso) {
        const d = new Date(`${iso}T00:00:00Z`);
        if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso) {
          return { ok: true, value: iso };
        }
      }
      return { ok: false, error: `"${text}" is not a valid date (use YYYY-MM-DD).` };
    }

    case "BOOLEAN": {
      const v = text.toLowerCase();
      if (["true", "yes", "y", "1"].includes(v)) return { ok: true, value: true };
      if (["false", "no", "n", "0"].includes(v)) return { ok: true, value: false };
      return { ok: false, error: `"${text}" is not yes/no.` };
    }
  }
}

/** Reads a contact's `attributes` JSON column safely as a plain object. */
export function readAttributes(json: unknown): Record<string, AttributeValue> {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, AttributeValue>;
  }
  return {};
}

/** "Priya Sharma", or just the email when no name is saved. */
export function contactDisplayName(c: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}
