import "server-only";
import { AiError } from "@/lib/ai/errors";
import { getAiConfig } from "@/lib/ai/config";

// A tiny client for Groq's chat API (it speaks the same language as OpenAI's:
// POST {base}/chat/completions). We use plain fetch, so there's no extra
// package to install or keep up to date.
//
// SAFETY:
//  - The API key is read here, on the server, and only sent to Groq.
//  - We never log the prompt or the answer (they may contain the user's
//    content). Errors are turned into AiError with a friendly message.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type GroqRequest = {
  messages: ChatMessage[];
  /** Upper limit for the answer's length (in tokens, about ¾ of a word each). */
  maxTokens: number;
  /** 0 = always the same answer, 1 = more creative. */
  temperature: number;
  /** Ask for a JSON object (the prompt must also mention JSON). Default true. */
  json?: boolean;
  /** Give up after this long. Default 30 seconds. */
  timeoutMs?: number;
};

export type GroqUsage = { promptTokens: number; completionTokens: number };

export type GroqResult = { content: string; usage: GroqUsage; model: string };

/**
 * A failed call. `sent` says whether the request reached Groq (it then counts
 * towards the limits); `usage` is filled when Groq told us the token counts.
 */
export class GroqCallError extends AiError {
  readonly sent: boolean;
  readonly status: number | null;
  readonly usage: GroqUsage | null;

  constructor(code: AiError["code"], opts: { sent: boolean; status?: number | null; usage?: GroqUsage; message?: string }) {
    super(code, opts.message);
    this.sent = opts.sent;
    this.status = opts.status ?? null;
    this.usage = opts.usage ?? null;
  }
}

export const DEFAULT_TIMEOUT_MS = 30_000;

const toInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

/** Sends one chat request to Groq and returns the text of the answer. Throws GroqCallError. */
export async function callGroq(request: GroqRequest): Promise<GroqResult> {
  const config = getAiConfig();
  if (!config.apiKey) throw new GroqCallError("not_configured", { sent: false });

  const body = {
    model: config.model,
    messages: request.messages,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    ...(request.json === false ? {} : { response_format: { type: "json_object" } }),
  };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      // Stop waiting after the timeout: a stuck request shouldn't hang the page.
      signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new GroqCallError("timeout", { sent: true });
    }
    // DNS failure, connection refused…: the request never reached Groq.
    throw new GroqCallError("network", { sent: false });
  }

  if (!response.ok) {
    // Read (and drop) the body so the connection can be reused. Groq's error
    // text may echo the request, so we never log or show it.
    const errorText = await response.text().catch(() => "");
    const status = response.status;
    if (status === 401 || status === 403) throw new GroqCallError("bad_key", { sent: true, status });
    if (status === 429) throw new GroqCallError("provider_rate_limit", { sent: true, status });
    if (status === 408 || status === 504) throw new GroqCallError("timeout", { sent: true, status });
    // 400 "json_validate_failed": the model didn't manage to write valid JSON.
    if (status === 400 && errorText.includes("json_validate_failed")) throw new GroqCallError("bad_output", { sent: true, status });
    throw new GroqCallError("provider_error", { sent: true, status });
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new GroqCallError("timeout", { sent: true });
    }
    throw new GroqCallError("provider_error", { sent: true, status: response.status });
  }

  const reply = data as {
    model?: unknown;
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const content = reply?.choices?.[0]?.message?.content;
  const usage: GroqUsage = {
    promptTokens: toInt(reply?.usage?.prompt_tokens),
    completionTokens: toInt(reply?.usage?.completion_tokens),
  };
  if (typeof content !== "string" || content.trim() === "") {
    throw new GroqCallError("bad_output", { sent: true, status: response.status, usage });
  }
  return { content, usage, model: typeof reply.model === "string" ? reply.model.slice(0, 100) : config.model };
}
