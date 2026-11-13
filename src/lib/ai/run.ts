import "server-only";
import type { z } from "zod";
import { getAiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import type { AiFeature } from "@/lib/ai/feature-names";
import { GroqCallError, callGroq, type GroqUsage } from "@/lib/ai/groq";
import { cancelAiRequest, checkBurst, finishAiRequest, reserveAiRequest } from "@/lib/ai/usage";

// runAiFeature: the ONE way every AI feature talks to the AI, so they all
// follow the same rules:
//
//   1. AI must be set up (GROQ_API_KEY), else a friendly "not set up" error.
//   2. Limits are checked first: burst (per minute), daily (per person),
//      monthly (per workspace). See usage.ts.
//   3. One AiUsage row is written per request that reaches the AI.
//   4. The answer must be JSON matching the feature's zod schema, and then
//      pass the feature's own checks (`accept`). Anything else is refused.
//   5. Nothing is logged except the feature name and an error code: prompts
//      and answers can contain the user's content, so they never hit the logs.
//
// The caller (a Server Action) works out the workspace and the user from the
// session (see action.ts) and passes them in as `actor`.

export type AiActor = { workspaceId: string; userId: string };

export type AiFeatureRequest<S extends z.ZodType, R> = {
  /** Instructions for the AI: what it is, what to write, the exact JSON shape. */
  system: string;
  /** The user's request and any context (as text). */
  user: string;
  /** Upper limit for the answer's length, in tokens. */
  maxTokens: number;
  temperature: number;
  /** The JSON shape we accept. Anything else is refused. */
  schema: S;
  /**
   * The feature's own checks and clean-up on the parsed answer. Throw
   * AiError("bad_output", "…") to refuse it with a specific message.
   */
  accept: (data: z.output<S>) => R | Promise<R>;
  /** For tests. Default 30 seconds. */
  timeoutMs?: number;
};

/** Pulls the JSON object out of an answer (some models wrap it in ```json fences). */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const text = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(text);
  } catch {
    // Last try: the first {…} block in the text.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AiError("bad_output");
  }
}

export async function runAiFeature<S extends z.ZodType, R>(
  actor: AiActor,
  feature: AiFeature,
  request: AiFeatureRequest<S, R>,
): Promise<R> {
  const config = getAiConfig();
  if (!config.apiKey) throw new AiError("not_configured");

  checkBurst(actor.userId);
  const usageId = await reserveAiRequest({
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    feature,
    model: config.model,
  });

  let usage: GroqUsage = { promptTokens: 0, completionTokens: 0 };
  let model = config.model;
  try {
    const answer = await callGroq({
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      json: true,
      timeoutMs: request.timeoutMs,
    });
    usage = answer.usage;
    model = answer.model;

    const parsed = request.schema.safeParse(extractJson(answer.content));
    if (!parsed.success) throw new AiError("bad_output");
    const result = await request.accept(parsed.data);

    await finishAiRequest(usageId, { ok: true, ...usage, model });
    return result;
  } catch (error) {
    if (error instanceof GroqCallError && !error.sent) {
      // It never reached the AI, so it doesn't count.
      await cancelAiRequest(usageId).catch(() => {});
    } else {
      const tokens = error instanceof GroqCallError && error.usage ? error.usage : usage;
      await finishAiRequest(usageId, { ok: false, ...tokens, model }).catch(() => {});
    }
    const code = error instanceof AiError ? error.code : "unexpected";
    const status = error instanceof GroqCallError && error.status ? ` (HTTP ${error.status})` : "";
    // Only the feature and the error code: never the prompt or the answer.
    console.warn(`AI request failed: feature=${feature} code=${code}${status}`);
    if (error instanceof AiError) throw error;
    throw new AiError("provider_error");
  }
}
