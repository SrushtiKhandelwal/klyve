import "server-only";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import { cleanParagraph } from "@/lib/ai/safety";

// "Explain my results" on a sent campaign's report: a short summary in plain
// English plus 3 concrete suggestions.
//
// PRIVACY: the AI only gets TOTALS (how many were sent, opened, clicked…),
// when it was sent, and the web addresses of the most-clicked links (without
// their ?query part, which can hold personal data). Never a contact's email,
// name or anything else about a person.

export type ReportFacts = {
  status: string;
  sent: number;
  delivered: number;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: string;
  clickRate: string;
  clickToOpenRate: string;
  hardBounces: number;
  softBounces: number;
  bounceRate: string;
  complaints: number;
  complaintRate: string;
  unsubscribes: number;
  unsubscribeRate: string;
  opensTracked: boolean;
  clicksTracked: boolean;
  automatedOpensExcluded: number;
  /** e.g. "Tuesday 10:00 (Asia/Kolkata)", or null if unknown. */
  sentAt: string | null;
  topLinks: { url: string; clicks: number; uniqueClicks: number }[];
};

/** "https://shop.example/sale?e={{ contact.EMAIL }}" → "https://shop.example/sale". */
export function linkForAi(url: string): string | null {
  const withoutTags = url.replace(/\{\{[\s\S]*?\}\}/g, "");
  try {
    const u = new URL(withoutTags.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 200);
  } catch {
    return null;
  }
}

export function explainPrompt(facts: ReportFacts) {
  const system = [
    "You are an email marketing coach explaining a campaign's results to a small business owner who is new to email marketing.",
    "You answer with ONE JSON object and nothing else.",
    'JSON shape: {"summary": string, "suggestions": [3 strings]}',
    "Rules:",
    "- summary: 2 to 4 short sentences in plain, friendly English. Say what went well and what didn't, compared with typical small-business emails (open rate around 20-30%, click rate around 2-3%, bounce rate under 2%, spam complaints under 0.1%).",
    "- suggestions: exactly 3 concrete, practical next steps based on these numbers (for example the subject line, send time, list cleaning, the call to action).",
    "- Use ONLY the numbers given. Don't invent numbers. If opens or clicks weren't tracked, say so instead of judging them.",
    "- Opens are an estimate (some apps load images automatically, some block them); clicks are more reliable.",
    "- No Markdown, no links, no HTML.",
  ].join("\n");
  return { system, user: `Campaign results (totals only):\n${JSON.stringify(facts, null, 2)}` };
}

export const explainAnswerSchema = z.object({
  summary: z.string().max(5000),
  suggestions: z.array(z.string().max(2000)).min(1).max(10),
});

export type Explanation = { summary: string; suggestions: string[] };

/** Plain text only (shown as text, never as HTML). */
export function acceptExplanation(answer: z.output<typeof explainAnswerSchema>): Explanation {
  const clean = (s: string, max: number) => cleanParagraph(s.replace(/[*_#`]+/g, ""), max).replace(/\s*\n\s*/g, " ");
  const summary = clean(answer.summary, 900);
  const suggestions = answer.suggestions.map((s) => clean(s, 400)).filter(Boolean).slice(0, 3);
  if (!summary || suggestions.length === 0) throw new AiError("bad_output");
  return { summary, suggestions };
}
