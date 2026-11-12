import "server-only";
import type { AttributeTypeValue, AttributeValue } from "@/lib/contacts/common";
import { buildMergeData, type MergeContact, type MergeData } from "@/lib/templates/personalize";

// Made-up details used to preview an email before it goes to real people.

/** The pretend contact every preview is addressed to. */
export const SAMPLE_CONTACT: MergeContact = {
  email: "priya@example.com",
  firstName: "Priya",
  lastName: "Sharma",
  attributes: { CITY: "Pune" },
};

/** Friendlier examples for custom text fields with common names. */
const TEXT_EXAMPLES: Record<string, string> = {
  CITY: "Pune",
  TOWN: "Pune",
  STATE: "Maharashtra",
  COUNTRY: "India",
  COMPANY: "Acme Ltd",
  COMPANY_NAME: "Acme Ltd",
  JOB_TITLE: "Marketing Manager",
  TITLE: "Ms",
  PHONE: "+91 98765 43210",
  MOBILE: "+91 98765 43210",
  SMS: "+91 98765 43210",
  WEBSITE: "https://example.com",
  PLAN: "Pro",
  GENDER: "Female",
  LANGUAGE: "English",
};

/** An example value for a custom field, based on its type (and name). */
export function sampleAttributeValue(key: string, type: AttributeTypeValue): AttributeValue {
  switch (type) {
    case "NUMBER":
      return 42;
    case "DATE":
      return "1994-05-12";
    case "BOOLEAN":
      return true;
    case "TEXT":
      // "FAVOURITE_COLOUR" → "Sample favourite colour"
      return TEXT_EXAMPLES[key] ?? `Sample ${key.toLowerCase().replace(/_/g, " ")}`;
  }
}

/**
 * Merge data for previews: the sample contact, with an example value for
 * every custom field the workspace has.
 */
export function previewMergeData(
  workspaceAttributes: { key: string; type: AttributeTypeValue }[],
  extras: { workspaceName?: string } = {},
): MergeData {
  const base = SAMPLE_CONTACT.attributes as Record<string, AttributeValue>;
  const attributes: Record<string, AttributeValue> = { ...base };
  for (const a of workspaceAttributes) {
    if (!(a.key in base)) attributes[a.key] = sampleAttributeValue(a.key, a.type);
  }
  return buildMergeData(
    { ...SAMPLE_CONTACT, attributes },
    // Previews never unsubscribe anyone: the link goes nowhere.
    { unsubscribeUrl: "#", workspaceName: extras.workspaceName ?? "Your company" },
  );
}
