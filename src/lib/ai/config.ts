import "server-only";

// AI settings, read from the server's environment (.env).
//
//   GROQ_API_KEY                    the secret key from console.groq.com (empty = AI is off)
//   GROQ_MODEL                      which model to use (default below)
//   GROQ_BASE_URL                   the API address (only change it for testing)
//   AI_MONTHLY_LIMIT_PER_WORKSPACE  AI requests a workspace may make per calendar month
//   AI_DAILY_LIMIT_PER_USER         AI requests one person may make per day
//
// SECURITY: the key only ever lives on the server. Nothing in this file is
// sent to the browser; pages only learn "is AI set up?" and the model name.
//
// Read on every call (not once at start-up), so tests can switch settings.

export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_MONTHLY_LIMIT = 100;
export const DEFAULT_DAILY_LIMIT = 30;

export type AiConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  monthlyLimit: number;
  dailyLimit: number;
};

/** A whole number from the environment, or the fallback when it's missing or silly. */
function readLimit(value: string | undefined, fallback: number): number {
  const n = Number(value?.trim());
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : fallback;
}

export function getAiConfig(): AiConfig {
  const baseUrl = (process.env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL).replace(/\/+$/, "");
  return {
    apiKey: process.env.GROQ_API_KEY?.trim() ?? "",
    model: process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    baseUrl,
    monthlyLimit: readLimit(process.env.AI_MONTHLY_LIMIT_PER_WORKSPACE, DEFAULT_MONTHLY_LIMIT),
    dailyLimit: readLimit(process.env.AI_DAILY_LIMIT_PER_USER, DEFAULT_DAILY_LIMIT),
  };
}

/** True when a Groq key is set, so the AI buttons can work. */
export function isAiConfigured(): boolean {
  return getAiConfig().apiKey !== "";
}
