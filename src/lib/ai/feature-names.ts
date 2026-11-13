// The AI features, as stored in AiUsage.feature, with their names for people.
//
// Safe to import from server AND client.

export const AI_FEATURES = [
  "generate_campaign",
  "subject_ideas",
  "improve_text",
  "segment",
  "automation",
  "explain_report",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  generate_campaign: "Generate campaign",
  subject_ideas: "Subject line ideas",
  improve_text: "Improve text",
  segment: "Segment from a description",
  automation: "Automation from a description",
  explain_report: "Explain my results",
};

/** A label for any stored feature name (older or unknown ones are shown as they are). */
export function aiFeatureLabel(feature: string): string {
  return (AI_FEATURE_LABELS as Record<string, string>)[feature] ?? feature;
}

/** Most AI requests one person may make per minute (a burst guard, kept in memory). */
export const AI_BURST_PER_MINUTE = 6;
