import "server-only";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import type { AiLanguage, AiTone } from "@/lib/ai/inputs";
import { cleanLine, cleanParagraph, escapeHtml, removeMergeTags } from "@/lib/ai/safety";
import { type Block, type BrandTheme, type EmailDocument, pad } from "@/lib/templates/document";
import { FIRST_NAME, brandFooter, brandHeader, button, emailDoc, heading, section, text } from "@/lib/templates/starters/helpers";
import { TEMPLATE_LIMITS } from "@/lib/templates/queries";

// "Generate campaign with AI": the prompt, the answer's shape, and turning
// the answer into a real email design in the workspace's brand.
//
// The AI only writes WORDS (name, subject, preview text, heading,
// paragraphs, button label). We build the design ourselves from the brand
// kit, escape every word, and the only link (the button) is the one the
// user typed. The AI never chooses a link.

export const LANGUAGE_NAMES: Record<AiLanguage, string> = {
  en: "English",
  hi: "Hindi (in Devanagari script)",
  mr: "Marathi (in Devanagari script)",
};

const TONE_HINTS: Record<AiTone, string> = {
  friendly: "warm, friendly and personal, like a message from a small business owner",
  professional: "clear, polite and professional",
  festive: "joyful and festive, celebrating the occasion",
  urgent: "energetic and urgent (limited time), but never pushy or spammy",
};

/** The placeholder the AI may use for the reader's first name. */
export const FIRST_NAME_PLACEHOLDER = "[FIRSTNAME]";

const LIMITS = {
  name: 100,
  subject: Math.min(TEMPLATE_LIMITS.subjectMax, 150),
  preheader: Math.min(TEMPLATE_LIMITS.preheaderMax, 200),
  heading: 150,
  paragraph: 1200,
  paragraphs: 6,
  buttonText: 40,
};

/** Text from the AI: a string, cut to size (never fails for being a bit long). */
const aiText = z.string().max(5000);

export const campaignAnswerSchema = z.object({
  campaignName: aiText,
  subject: aiText,
  preheader: aiText.optional().default(""),
  heading: aiText,
  paragraphs: z.array(aiText).min(1).max(12),
  buttonText: aiText.nullish(),
});
export type CampaignAnswer = z.output<typeof campaignAnswerSchema>;

export function campaignPrompt(input: { about: string; tone: AiTone; language: AiLanguage; hasButton: boolean; buttonText: string; companyName: string }) {
  const system = [
    "You write marketing emails for small businesses. You answer with ONE JSON object and nothing else.",
    "JSON shape:",
    '{"campaignName": string, "subject": string, "preheader": string, "heading": string, "paragraphs": string[], "buttonText": string}',
    "Rules:",
    "- campaignName: a short internal name for the campaign (max 60 characters), in English.",
    "- subject: an inviting subject line, under 60 characters, no ALL CAPS, at most one emoji.",
    "- preheader: one sentence (max 100 characters) that complements the subject.",
    "- heading: a short headline for the top of the email.",
    "- paragraphs: 2 to 4 short paragraphs of plain text (no HTML, no Markdown, no links, no email addresses).",
    `- You may write ${FIRST_NAME_PLACEHOLDER} where the reader's first name should go (for example "Hi ${FIRST_NAME_PLACEHOLDER},"). Do not use any other placeholders or curly braces.`,
    "- Never invent facts that weren't given: no prices, dates, codes, phone numbers or addresses unless the user wrote them.",
    "- Never include web addresses. A button is added separately.",
    input.hasButton ? "- buttonText: a short call to action for the button (2 to 4 words)." : '- buttonText: use "" (there is no button).',
    `- Tone: ${TONE_HINTS[input.tone]}.`,
    `- Language: write subject, preheader, heading, paragraphs and buttonText in ${LANGUAGE_NAMES[input.language]}.`,
  ].join("\n");

  const user = [
    `Business name: ${input.companyName || "(not given)"}`,
    `What the email is about: ${input.about}`,
    input.hasButton && input.buttonText ? `The button should say something like: ${input.buttonText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

/** AI text → safe HTML text: escaped, with [FIRSTNAME] turned into the real merge tag. */
function toSafeHtml(value: string): string {
  return escapeHtml(value).split(FIRST_NAME_PLACEHOLDER).join(FIRST_NAME);
}

/** AI text → safe plain line (subject, preview text): [FIRSTNAME] becomes the merge tag. */
function toSafeLine(value: string, max: number, hardMax: number): string {
  const line = cleanLine(removeMergeTags(value), max);
  const withTag = line.split(FIRST_NAME_PLACEHOLDER).join(FIRST_NAME);
  // The tag is longer than the placeholder. If that makes the line too long,
  // leave the name out rather than cutting a tag in half.
  return withTag.length <= hardMax ? withTag : cleanLine(line.split(FIRST_NAME_PLACEHOLDER).join(""), max);
}

export type GeneratedCampaign = {
  name: string;
  subject: string;
  preheader: string;
  document: EmailDocument;
};

/**
 * Cleans the AI's answer and builds the email design: brand header, heading,
 * paragraphs, optional button (with the user's own link) and the standard
 * footer with the unsubscribe link.
 */
export function buildGeneratedCampaign(
  answer: CampaignAnswer,
  opts: { theme: BrandTheme; buttonUrl: string; buttonText: string; fallbackName: string },
): GeneratedCampaign {
  const name = cleanLine(removeMergeTags(answer.campaignName).split(FIRST_NAME_PLACEHOLDER).join(""), LIMITS.name) || opts.fallbackName;
  const subject = toSafeLine(answer.subject, LIMITS.subject, TEMPLATE_LIMITS.subjectMax);
  const preheader = toSafeLine(answer.preheader, LIMITS.preheader, TEMPLATE_LIMITS.preheaderMax);
  const headingText = cleanLine(removeMergeTags(answer.heading), LIMITS.heading);
  const paragraphs = answer.paragraphs
    .map((p) => cleanParagraph(removeMergeTags(p), LIMITS.paragraph))
    .filter((p) => p.length > 0)
    .slice(0, LIMITS.paragraphs);

  if (!subject || !headingText || paragraphs.length === 0) throw new AiError("bad_output");

  const bodyHtml = paragraphs
    .map((p) => `<p>${p.split("\n").map(toSafeHtml).join("<br>")}</p>`)
    .join("");

  const blocks: Block[] = [
    heading(toSafeHtml(headingText), { padding: pad(24, 24, 8, 24) }),
    text(bodyHtml, { padding: pad(8, 24, 8, 24) }),
  ];

  // Only add a button when the USER gave a link. Its label: what the user
  // typed, else the AI's suggestion, else a safe default.
  if (opts.buttonUrl) {
    const label =
      cleanLine(opts.buttonText, LIMITS.buttonText) ||
      cleanLine(removeMergeTags(answer.buttonText ?? "").split(FIRST_NAME_PLACEHOLDER).join(""), LIMITS.buttonText) ||
      "Learn more";
    blocks.push(button(label, opts.buttonUrl, opts.theme, { padding: pad(16, 24, 24, 24) }));
  }

  const document = emailDoc(opts.theme, [
    brandHeader(opts.theme),
    section([blocks], { padding: pad(8, 0, 16, 0) }),
    brandFooter(opts.theme),
  ]);

  return { name, subject, preheader, document };
}
