"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/campaigns/unsubscribe";
import { cleanSourceUrl, errorMessages, type PublicForm } from "@/lib/forms/public";
import { createRenderedAtToken } from "@/lib/forms/spam";
import { fieldsFromFormData, submitForm } from "@/lib/forms/submit";
import type { HostedFormState } from "./state";

// The "Subscribe" button on the hosted form page (/f/<publicId>), also when
// that page is shown in an <iframe> on another website.
//
// No login and no cookies: anyone may submit. All the checks (spam, rate
// limits, validation, never revealing who is already on the list) live in
// lib/forms/submit.ts, shared with the cross-site endpoint.
//
// Works with JavaScript switched off too: the browser posts the form, Next
// runs this action and renders the page again with the returned state (via
// useActionState in hosted-form.tsx), or follows our 303 redirect.

export async function submitHostedFormAction(
  publicId: string,
  _previous: HostedFormState,
  formData: FormData,
): Promise<HostedFormState> {
  const h = await headers();
  const raw = fieldsFromFormData(formData);
  // Hidden fields set by our own page (but sent by the browser, so untrusted):
  // "embed" = shown in an iframe; "_src" = the website around the iframe.
  const embed = raw.embed === "1";
  const src = cleanSourceUrl(raw._src);

  const outcome = await submitForm(
    String(publicId).slice(0, 64),
    raw,
    { ip: clientIp(h), userAgent: h.get("user-agent"), sourceUrl: src, channel: "hosted" },
  );

  const fail = (errors: Record<string, string>, values: Record<string, string> = {}, ts?: string): HostedFormState => ({
    status: "error",
    errors,
    values,
    ...(ts ? { ts } : {}),
    ...(src ? { src } : {}),
  });

  switch (outcome.status) {
    case "not_found":
      return fail({ _form: "This form no longer exists." });
    case "paused":
      return fail(errorMessages({ _form: "paused" }, outcome.form));
    case "busy":
      return fail(errorMessages({ _form: "busy" }, { attributeTypes: {} }), pick(raw, outcome.form));
    case "invalid":
      return fail(
        errorMessages(outcome.codes, outcome.form),
        outcome.values,
        // The page was open too long: give the next try a fresh timestamp.
        outcome.codes._form === "expired" ? createRenderedAtToken(outcome.form.id) : undefined,
      );
    case "success":
      // Inside an iframe a server redirect would only move the iframe, so the
      // page shows the thanks message with a "Continue" link instead.
      if (outcome.redirectTo && !embed) redirect(outcome.redirectTo);
      return { status: "success", continueUrl: embed ? outcome.redirectTo : null };
  }
}

/** The visitor's values for the form's own fields (to re-fill after "too busy"). */
function pick(raw: Record<string, string>, form: PublicForm | null): Record<string, string> {
  if (!form) return {};
  const values = Object.fromEntries(form.config.fields.map((f) => [f.target, (raw[f.target] ?? "").slice(0, 1000)]));
  if (raw.consent) values.consent = "yes";
  return values;
}
