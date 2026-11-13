import type { NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/app-url";
import { clientIp } from "@/lib/campaigns/unsubscribe";
import { cleanSourceUrl, encodeErrorCodes, errorMessages, isPlausiblePublicId } from "@/lib/forms/public";
import { FORM_SIZE_LIMITS } from "@/lib/forms/spam";
import { fieldsFromFormData, submitForm, type SubmitOutcome } from "@/lib/forms/submit";

// POST /api/forms/<publicId>/submit: where sign-up forms on OTHER websites
// send their data. Two kinds of callers:
//
//  1. A plain HTML snippet pasted into a website:
//       <form method="post" action="https://app/api/forms/<id>/submit">
//     No JavaScript. We answer with a 303 redirect: to the form's "after
//     signing up" page (with ?subscribed=1), or to our /f/<id>/thanks page.
//     If something needs fixing, back to our hosted form /f/<id>?error=…,
//     which shows the errors (as codes: no personal data in the URL).
//
//  2. JavaScript on a website (fetch with "Accept: application/json").
//     We answer JSON { ok, message, errors? } with CORS headers, so any
//     site may call us (and read the answer).
//
// Why no CSRF protection: CSRF tricks a browser into sending someone's
// login cookies along. This endpoint uses no cookies and no login at all, and
// being posted to from other sites is its whole purpose. A forged request can
// do nothing the attacker couldn't do by posting directly. CORS is "*"
// WITHOUT credentials for the same reason.
//
// All the real checks (spam, rate limits, validation, never revealing who's
// on the list) are in lib/forms/submit.ts, shared with the hosted page.

const COMMON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  // Any website may post here and read the JSON answer; no cookies involved.
  "Access-Control-Allow-Origin": "*",
};

/** The browser's "may I?" question before a cross-site fetch with custom headers. */
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...COMMON_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

type Parsed = { ok: true; fields: Record<string, string> } | { ok: false; status: 400 | 413 | 415; message: string };

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

/** The posted fields, from a urlencoded or multipart body of at most ~20 KB. */
async function readFields(request: NextRequest): Promise<Parsed> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/x-www-form-urlencoded") && !type.startsWith("multipart/form-data")) {
    return { ok: false, status: 415, message: "Send the form as application/x-www-form-urlencoded or multipart/form-data." };
  }
  const tooBig = { ok: false, status: 413, message: "The form data is too large." } as const;
  // Quick refusal when the size is announced; the capped read catches the rest.
  if (Number(request.headers.get("content-length") ?? 0) > FORM_SIZE_LIMITS.bodyBytes) return tooBig;
  const bytes = await readCapped(request.body, FORM_SIZE_LIMITS.bodyBytes);
  if (!bytes) return tooBig;
  try {
    // Response.formData() understands both encodings (and the multipart boundary).
    const formData = await new Response(bytes as BodyInit, { headers: { "Content-Type": type } }).formData();
    return { ok: true, fields: fieldsFromFormData(formData) };
  } catch {
    return { ok: false, status: 400, message: "The form data couldn't be read." };
  }
}

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...COMMON_HEADERS, ...extra } });
}

function text(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(message, { status, headers: { ...COMMON_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}

/** 303 = "now GET this page" (the browser leaves the POST behind). */
function seeOther(location: string) {
  return new Response(null, { status: 303, headers: { ...COMMON_HEADERS, Location: location } });
}

const formPage = (publicId: string, error?: string) =>
  absoluteUrl(`/f/${encodeURIComponent(publicId)}${error ? `?error=${encodeURIComponent(error)}` : ""}`);

const BUSY_MESSAGE = "Too many sign-ups right now. Please wait a few minutes and try again.";

/** JSON answer for fetch() callers. */
function asJson(outcome: SubmitOutcome): Response {
  switch (outcome.status) {
    case "not_found":
      return json(404, { ok: false, message: "This form doesn't exist." });
    case "paused":
      return json(409, { ok: false, message: "This form isn't accepting sign-ups right now." });
    case "busy":
      return json(429, { ok: false, message: BUSY_MESSAGE }, { "Retry-After": String(outcome.retryAfterSeconds) });
    case "invalid": {
      const errors = errorMessages(outcome.codes, outcome.form);
      const { _form, ...fieldErrors } = errors;
      return json(400, { ok: false, message: _form ?? "Please check the highlighted fields.", errors: fieldErrors });
    }
    case "success": {
      const { successTitle, successMessage } = outcome.form.config;
      return json(200, {
        ok: true,
        message: successMessage || successTitle,
        title: successTitle,
        // For the JS embed: where to send the visitor next (null = show the message).
        redirectUrl: outcome.redirectTo,
      });
    }
  }
}

/** Redirect answer for plain HTML forms (no JavaScript). */
function asRedirect(outcome: SubmitOutcome, publicId: string): Response {
  switch (outcome.status) {
    case "not_found":
      return text(404, "This form doesn't exist.");
    case "paused":
      // The hosted page explains that the form is paused.
      return seeOther(formPage(outcome.form.publicId));
    case "busy":
      if (!outcome.form && !isPlausiblePublicId(publicId)) return text(429, BUSY_MESSAGE);
      return seeOther(formPage(outcome.form?.publicId ?? publicId, "_form.busy"));
    case "invalid":
      return seeOther(formPage(outcome.form.publicId, encodeErrorCodes(outcome.codes)));
    case "success":
      return seeOther(outcome.redirectTo ?? absoluteUrl(`/f/${encodeURIComponent(outcome.form.publicId)}/thanks`));
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/forms/[publicId]/submit">) {
  const { publicId } = await ctx.params;
  const wantsJson = (request.headers.get("accept") ?? "").toLowerCase().includes("application/json");

  const parsed = await readFields(request);
  if (!parsed.ok) return wantsJson ? json(parsed.status, { ok: false, message: parsed.message }) : text(parsed.status, parsed.message);

  const outcome = await submitForm(publicId.slice(0, 64), parsed.fields, {
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    // The page the form is on. Browsers often send only the site (Origin) for
    // cross-site posts; cleanSourceUrl drops ?query/#hash and login details.
    sourceUrl: cleanSourceUrl(request.headers.get("referer")) ?? cleanSourceUrl(request.headers.get("origin")),
    channel: "snippet",
  });

  return wantsJson ? asJson(outcome) : asRedirect(outcome, publicId);
}
