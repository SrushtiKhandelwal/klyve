"use client";

import { useActionState, useEffect } from "react";
import { FormView, type AttributeKind } from "@/components/forms/form-view";
import { RENDERED_AT_FIELD, type FormConfig } from "@/lib/forms/schema";
import { IDLE_STATE, type HostedFormState } from "./state";
import { SuccessView } from "./success-view";

// The form on the hosted page, wired to its Server Action.
//
// useActionState keeps the action's answer (errors, or "thanks") and shows
// it. This also works with JavaScript OFF: the browser posts the form, Next
// runs the action and renders the page again with that answer filled in
// ("progressive enhancement"). With JavaScript on, it just swaps in place.

export function HostedForm({
  action,
  config,
  brand,
  attributeTypes,
  hiddenFields,
  initialErrors,
}: {
  action: (state: HostedFormState, formData: FormData) => Promise<HostedFormState>;
  config: FormConfig;
  brand: { name: string; logoUrl: string | null };
  attributeTypes: Record<string, AttributeKind>;
  /** The signed timestamp, the embed flag and the embedding page. */
  hiddenFields: Record<string, string>;
  /** Errors passed in the URL by the cross-site endpoint (?error=…). */
  initialErrors?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const continueUrl = state.status === "success" ? state.continueUrl : null;

  // Inside an iframe, try to open the "after signing up" page in the whole
  // window. Browsers may block that; the "Continue" link is the fallback.
  useEffect(() => {
    if (!continueUrl) return;
    try {
      if (window.top) window.top.location.href = continueUrl;
    } catch {
      // Blocked by the browser: the visitor can click "Continue".
    }
  }, [continueUrl]);

  if (state.status === "success") return <SuccessView config={config} brand={brand} continueUrl={continueUrl} />;

  const failed = state.status === "error" ? state : null;
  return (
    <FormView
      config={config}
      brand={brand}
      action={formAction}
      hiddenFields={{
        ...hiddenFields,
        ...(failed?.ts ? { [RENDERED_AT_FIELD]: failed.ts } : {}),
        ...(failed?.src ? { _src: failed.src } : {}),
      }}
      errors={failed ? failed.errors : initialErrors}
      values={failed?.values}
      attributeTypes={attributeTypes}
    />
  );
}
