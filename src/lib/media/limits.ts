// Upload limits and messages. Safe to import in the browser (no Node code), so
// the media picker can warn BEFORE uploading. The server checks again anyway.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const MAX_DIMENSION = 6000; // pixels, per side

/** Per-workspace quotas. */
export const MAX_ASSETS_PER_WORKSPACE = 500;
export const MAX_BYTES_PER_WORKSPACE = 500 * 1024 * 1024; // 500 MB

/** Per-user upload rate limit. */
export const UPLOAD_RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 } as const;

/** What the file picker's `accept` attribute offers (the server still checks the bytes). */
export const ACCEPT_ATTRIBUTE = "image/png,image/jpeg,image/gif,image/webp";
export const ALLOWED_MIME_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export const UPLOAD_ERRORS = {
  tooBig: "Too big (max 5 MB).",
  badType: "Only PNG, JPG, GIF or WebP.",
  empty: "That file is empty.",
  broken: "That image looks damaged. Try saving it again.",
  tooLarge: `Image is too large (max ${MAX_DIMENSION} × ${MAX_DIMENSION} pixels).`,
  noFile: "Choose an image to upload.",
  quotaCount: `Your library is full (max ${MAX_ASSETS_PER_WORKSPACE} images). Delete some first.`,
  quotaBytes: "Your library is full (max 500 MB). Delete some images first.",
  rateLimited: "Too many uploads. Please wait a few minutes and try again.",
} as const;
