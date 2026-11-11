// Turns Better Auth's error codes into friendly sentences for the user.
// Better Auth returns errors like { code: "INVALID_EMAIL_OR_PASSWORD", message: "..." }.
const FRIENDLY_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Please try again.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Try logging in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "An account with this email already exists. Try logging in instead.",
  INVALID_EMAIL: "Please enter a valid email address.",
  PASSWORD_TOO_SHORT: "Your password must be at least 8 characters.",
  PASSWORD_TOO_LONG: "Your password is too long.",
  // Password reset and email verification links:
  INVALID_TOKEN: "This link is invalid or has already been used. Please request a new one.",
  TOKEN_EXPIRED: "This link has expired. Please request a new one.",
  EMAIL_ALREADY_VERIFIED: "Your email address is already verified.",
};

type AuthError = { code?: string; message?: string; status?: number };

export function friendlyAuthError(error: AuthError): string {
  if (error.code && FRIENDLY_MESSAGES[error.code]) {
    return FRIENDLY_MESSAGES[error.code];
  }
  // 429 = too many attempts in a short time (Better Auth rate limiting).
  if (error.status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  return error.message || "Something went wrong. Please try again.";
}

// Very small email check: "something@something.something".
// The server does the real validation; this just catches obvious typos early.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const MIN_PASSWORD_LENGTH = 8;
