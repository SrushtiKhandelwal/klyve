import "server-only";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from "@/lib/transactional/schema";

// JSON helpers for the public API (/api/v1/*).
//
// Every answer:
//  - is JSON,
//  - has "Cache-Control: no-store" (API answers are private and change all
//    the time: no browser, proxy or CDN may keep a copy),
//  - has an "X-Request-Id" header (added by the route wrapper in handler.ts),
//    so a developer can quote it to support and we can find it in our logs.
//
// Errors always look like { "error": { "code", "message", "details"? } } with
// the HTTP status that API_ERROR_CODES gives the code. Internal problems are
// logged on the server; the caller only ever sees a short, safe message
// (never a stack trace or a database error).

/** Headers every API response carries. */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** "req_" + 24 hex characters, unique enough to find one request in the logs. */
export function newRequestId(): string {
  return `req_${randomBytes(12).toString("hex")}`;
}

/** A JSON success answer (200 unless told otherwise). */
export function apiJson(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(data, { status, headers: { ...BASE_HEADERS, ...headers } });
}

/** A JSON error answer; the HTTP status comes from the error code. */
export function apiError(code: ApiErrorCode, message: string, details?: unknown, headers: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: { code, message, ...(details !== undefined ? { details } : {}) } };
  return Response.json(body, { status: API_ERROR_CODES[code], headers: { ...BASE_HEADERS, ...headers } });
}

/** 405 with the "Allow" header listing the methods this URL does accept. */
export function methodNotAllowed(allow: string[], message?: string): Response {
  const list = allow.join(", ");
  const body = {
    error: { code: "method_not_allowed", message: message ?? `This endpoint only accepts ${list}.` },
  };
  return Response.json(body, { status: 405, headers: { ...BASE_HEADERS, Allow: list } });
}

// ── Validation details ──────────────────────────────────────────────────────

/** One field problem, e.g. { path: "to.email", message: "Invalid email address" }. */
export type IssueDetail = { path: string; message: string };

/** ["to", "email"] → "to.email"; ["tags", 0] → "tags[0]"; [] → "" (the whole body). */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

type Issue = z.core.$ZodIssue;

/**
 * Turns zod's issues into a short, readable list. Two special cases make the
 * messages much friendlier:
 *  - unknown fields (the schemas are .strict()) get one line per field;
 *  - "one of several shapes" fields (an address can be a string OR an
 *    object) report the most useful branch instead of just "Invalid input".
 */
export function zodDetails(error: z.ZodError, basePath: ReadonlyArray<PropertyKey> = []): IssueDetail[] {
  const out: IssueDetail[] = [];
  const walk = (issues: readonly Issue[], prefix: ReadonlyArray<PropertyKey>) => {
    for (const issue of issues) {
      const path = [...prefix, ...issue.path];
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) out.push({ path: formatPath([...path, key]), message: "Unknown field." });
      } else if (issue.code === "invalid_union" && issue.errors.length) {
        // Prefer a branch that got past the "wrong type" stage: its message is
        // about the actual value (e.g. "isn't a valid email address").
        const best = issue.errors.find((branch) => branch.some((i) => i.code !== "invalid_type")) ?? issue.errors[0];
        walk(best, path);
      } else {
        out.push({ path: formatPath(path), message: issue.message });
      }
    }
  };
  walk(error.issues, basePath);
  // The same problem can be reported twice (e.g. by two union branches).
  const seen = new Set<string>();
  return out.filter((d) => {
    const key = `${d.path}\u0000${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 400 invalid_request with the field problems in `details`. */
export function validationError(error: z.ZodError, message = "Some fields are missing or invalid. See details."): Response {
  return apiError("invalid_request", message, zodDetails(error));
}

// ── Query strings ───────────────────────────────────────────────────────────

/** "?limit=20&cursor=…" checked against a zod object schema (use .strict() to catch typos). */
export function readQuery<T extends z.ZodType>(
  request: Request,
  schema: T,
): { ok: true; data: z.infer<T> } | { ok: false; response: Response } {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) raw[key] = value;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, response: validationError(parsed.error, "Some query parameters are invalid. See details.") };
}

// ── Reading the JSON body safely ────────────────────────────────────────────

/** Largest request body we read (an HTML email is at most ~512 KB, plus params). */
export const MAX_BODY_BYTES = 1_500_000;

/** Reads at most `limit` bytes; null if the body is bigger (we stop reading). */
async function readCapped(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export type BodyResult = { ok: true; data: unknown } | { ok: false; response: Response };

/**
 * The request's JSON body, or a ready-made 400 answer. Checks, in order:
 * the Content-Type is JSON, the body isn't bigger than MAX_BODY_BYTES (we
 * stop reading as soon as it is, so a huge upload can't fill our memory),
 * it's valid UTF-8 JSON, and it's a JSON object.
 */
export async function readJsonBody(request: Request): Promise<BodyResult> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
  if (type !== "application/json") {
    return {
      ok: false,
      response: apiError("invalid_request", 'Send the body as JSON with the header "Content-Type: application/json".'),
    };
  }
  const tooBig = {
    ok: false,
    response: apiError("invalid_request", `The request body is too large (max ${(MAX_BODY_BYTES / 1_000_000).toLocaleString("en")} MB).`),
  } as const;
  // Quick refusal when the size is announced; the capped read catches the rest.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return tooBig;
  const bytes = await readCapped(request.body, MAX_BODY_BYTES);
  if (!bytes) return tooBig;

  let data: unknown;
  try {
    // fatal: true → invalid UTF-8 is an error instead of silently becoming "�".
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, response: apiError("invalid_request", "The request body isn't valid JSON.") };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, response: apiError("invalid_request", "The request body must be a JSON object ({ ... }).") };
  }
  return { ok: true, data };
}
