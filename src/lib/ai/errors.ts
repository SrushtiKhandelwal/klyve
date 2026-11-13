// Every way an AI request can go wrong, each with a message that is safe and
// friendly to show to the user as it is (no keys, no prompts, no stack traces).
//
// Safe to import from server AND client (no secrets here).

export type AiErrorCode =
  | "not_configured" // no GROQ_API_KEY on this server
  | "invalid_input" // the user's request didn't pass our checks
  | "burst" // too many requests in the last minute (this person)
  | "daily_limit" // this person used all their requests for today
  | "monthly_limit" // the workspace used all its requests for this month
  | "bad_key" // Groq said 401/403: the key is wrong or revoked
  | "provider_rate_limit" // Groq said 429: too many requests to Groq right now
  | "timeout" // Groq took too long to answer
  | "provider_error" // Groq is down, or answered something unexpected
  | "network" // we couldn't reach Groq at all
  | "bad_output"; // Groq answered, but the answer wasn't usable

export const NOT_CONFIGURED_MESSAGE =
  "AI isn't set up on this server yet. Ask the person who runs Klyve to add a Groq API key (GROQ_API_KEY).";

const DEFAULT_MESSAGES: Record<AiErrorCode, string> = {
  not_configured: NOT_CONFIGURED_MESSAGE,
  invalid_input: "Please check what you typed and try again.",
  burst: "You're going a bit fast. Please wait a minute and try again.",
  daily_limit: "You've used all your AI requests for today. They reset tomorrow.",
  monthly_limit: "Your workspace has used all its AI requests for this month.",
  bad_key: "The AI key on this server isn't working. Ask the person who runs Klyve to check GROQ_API_KEY.",
  provider_rate_limit: "The AI service is busy right now. Please try again in a minute.",
  timeout: "The AI took too long to answer. Please try again.",
  provider_error: "The AI service had a problem. Please try again in a moment.",
  network: "We couldn't reach the AI service. Please try again in a moment.",
  bad_output: "The AI's answer didn't make sense, so we didn't use it. Please try again.",
};

/** A problem with an AI request. `message` is meant for the user. */
export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AiError";
    this.code = code;
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}
