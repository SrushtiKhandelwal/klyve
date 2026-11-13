import "server-only";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import { FIRST_NAME_PLACEHOLDER } from "@/lib/ai/features/campaign";
import { cleanLine, removeMergeTags } from "@/lib/ai/safety";
import { emailDocumentSchema } from "@/lib/templates/document";
import { documentToPlainText, htmlToPlainText } from "@/lib/templates/plain-text";
import { TEMPLATE_LIMITS } from "@/lib/templates/queries";
import { FIRST_NAME } from "@/lib/templates/starters/helpers";

// "Suggest with AI" for the subject line: 5 subject lines and one preview
// text, based on what the email says right now.

/** How much of the email we show the AI (enough to get the gist, cheap to send). */
export const SUBJECT_CONTEXT_MAX = 3000;

/** The email's words as plain text: from the design, else the saved HTML, else just its name. */
export function campaignContentForAi(campaign: { name: string; document: unknown; html: string }): string {
  let content = "";
  const doc = emailDocumentSchema.safeParse(campaign.document);
  if (doc.success) content = documentToPlainText(doc.data);
  else if (campaign.html) content = htmlToPlainText(campaign.html);
  // Merge tags and links are noise for the AI ("{{ unsubscribe_url }}"…).
  content = content
    .replace(/\{\{[\s\S]*?\}\}/g, "…")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return content.slice(0, SUBJECT_CONTEXT_MAX);
}

export const subjectsAnswerSchema = z.object({
  subjects: z.array(z.string().max(1000)).min(1).max(10),
  preheader: z.string().max(2000).optional().default(""),
});

/** A subject line for the AI: the first-name tag becomes [FIRSTNAME], other tags "…". */
export function subjectForAi(subject: string): string {
  return subject.replace(/\{\{[\s\S]*?\}\}/g, (tag) => (/contact\.FIRSTNAME/i.test(tag) ? FIRST_NAME_PLACEHOLDER : "…")).slice(0, 300);
}

export function subjectsPrompt(input: { name: string; content: string; currentSubject: string }) {
  const system = [
    "You write email subject lines that people want to open. You answer with ONE JSON object and nothing else.",
    'JSON shape: {"subjects": [5 strings], "preheader": string}',
    "Rules:",
    "- 5 different subject lines, each under 60 characters, in the same language as the email.",
    "- Mix styles: a clear benefit, a question, curiosity, a personal one, and a short punchy one.",
    "- No ALL CAPS, no spammy words like FREE!!!, at most one emoji per line, no quotes around them.",
    `- You may write ${FIRST_NAME_PLACEHOLDER} where the reader's first name should go. No other placeholders or curly braces.`,
    "- Never invent facts (prices, dates, codes) that are not in the email.",
    "- preheader: one sentence under 100 characters that adds to the subject (shown after it in the inbox).",
  ].join("\n");

  const user = [
    `Campaign name: ${input.name}`,
    input.currentSubject ? `Current subject line: ${subjectForAi(input.currentSubject)}` : "",
    input.content ? `The email says:\n"""\n${input.content}\n"""` : "The email has no text yet: use the campaign name.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

function toSubjectLine(value: string, max: number): string {
  const line = cleanLine(removeMergeTags(value), max).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  const withTag = line.split(FIRST_NAME_PLACEHOLDER).join(FIRST_NAME);
  return withTag.length <= max ? withTag : line.split(FIRST_NAME_PLACEHOLDER).join("").trim();
}

/** Cleans the AI's ideas: one line each, no repeats, at most 5. */
export function acceptSubjects(answer: z.output<typeof subjectsAnswerSchema>): { subjects: string[]; preheader: string } {
  const seen = new Set<string>();
  const subjects: string[] = [];
  for (const s of answer.subjects) {
    const line = toSubjectLine(s, Math.min(TEMPLATE_LIMITS.subjectMax, 150));
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    subjects.push(line);
    if (subjects.length === 5) break;
  }
  if (subjects.length === 0) throw new AiError("bad_output");
  return { subjects, preheader: toSubjectLine(answer.preheader, Math.min(TEMPLATE_LIMITS.preheaderMax, 200)) };
}
