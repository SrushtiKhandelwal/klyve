// Plain-English names for consent events, for showing the consent record in
// the dashboard. No server code here, so client components can import it.

import type { ConsentEventType } from "@/generated/prisma/enums";

export const CONSENT_EVENT_LABELS: Record<ConsentEventType, string> = {
  SUBSCRIBED: "Signed up",
  CONFIRMATION_SENT: "Confirmation email sent",
  CONFIRMED: "Confirmed subscription",
  UNSUBSCRIBED: "Unsubscribed",
  RESUBSCRIBED: "Resubscribed",
  PREFERENCES_UPDATED: "Updated preferences",
  STATUS_CHANGED: "Status changed by your team",
  ERASED: "Data erased (GDPR)",
};

export const CONSENT_SOURCE_LABELS: Record<string, string> = {
  manual: "By hand (your team)",
  import: "CSV import",
  form: "Sign-up form",
  api: "API",
  unsubscribe_link: "Unsubscribe link",
  one_click: "One-click unsubscribe (email app)",
  preference_centre: "Preference centre",
  confirmation_link: "Confirmation link",
  webhook: "Provider report (bounce or complaint)",
  erasure: "GDPR erasure",
};

/** "form" → "Sign-up form"; unknown sources are shown as they are. */
export function consentSourceLabel(source: string): string {
  return CONSENT_SOURCE_LABELS[source] ?? source;
}
