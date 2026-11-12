import "server-only";
import { imageSize } from "image-size";
import { MAX_DIMENSION, MAX_UPLOAD_BYTES, UPLOAD_ERRORS } from "./limits";

// Checks an uploaded file is REALLY an image we allow, by looking at its bytes.
// We never trust the file name ("cat.png") or the type the browser claims
// ("image/png"): both are typed by whoever uploads the file.
//
// No SVG: SVG is XML that can contain <script>, and email apps don't show it
// reliably anyway. No other formats either: these four work in email.
//
// Pure functions (no database, no Next.js) so they are easy to test.

export const ALLOWED_TYPES = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  gif: { mime: "image/gif", ext: "gif" },
  webp: { mime: "image/webp", ext: "webp" },
} as const;
export type ImageKind = keyof typeof ALLOWED_TYPES;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** Looks at the first bytes ("magic numbers") to tell what the file really is. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  return null;
}

// Extra safety net against "polyglot" files: a real image header followed by
// HTML. Our serving headers (exact Content-Type + nosniff + CSP) already stop
// browsers from running such a file, but there's no reason to store it.
// We only look at the first 1 KB (where old browsers sniffed for HTML), plus
// the whole file for "<script", which is long enough to never appear by chance.
const HTML_MARKERS = ["<html", "<script", "<!doctype", "<body", "<head", "<iframe", "<svg", "<object", "<embed"];

function looksLikeHtml(bytes: Uint8Array): boolean {
  // latin1 maps every byte to one character, so this never fails on binary data.
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1").toLowerCase();
  const head = text.slice(0, 1024);
  return HTML_MARKERS.some((m) => head.includes(m)) || text.includes("<script");
}

export type ValidImage = {
  kind: ImageKind;
  mime: string;
  ext: string;
  width: number;
  height: number;
};

export type ValidationResult = { ok: true; image: ValidImage } | { ok: false; error: string };

/** Full check of an uploaded file's bytes. */
export function validateImageBytes(bytes: Uint8Array): ValidationResult {
  if (bytes.length === 0) return { ok: false, error: UPLOAD_ERRORS.empty };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: UPLOAD_ERRORS.tooBig };

  const kind = detectImageKind(bytes);
  if (!kind) return { ok: false, error: UPLOAD_ERRORS.badType };
  if (looksLikeHtml(bytes)) return { ok: false, error: UPLOAD_ERRORS.badType };

  // image-size reads the width/height from the header. It also tells us what
  // it thinks the format is; that must agree with our own check.
  let width: number;
  let height: number;
  try {
    const size = imageSize(bytes);
    if (size.type !== kind) return { ok: false, error: UPLOAD_ERRORS.broken };
    width = size.width;
    height = size.height;
    // Phone photos are often stored sideways with an "orientation" flag
    // (5–8 = rotated 90°). Report the size as people will SEE it.
    if (size.orientation && size.orientation >= 5) [width, height] = [height, width];
  } catch {
    return { ok: false, error: UPLOAD_ERRORS.broken };
  }

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { ok: false, error: UPLOAD_ERRORS.broken };
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return { ok: false, error: UPLOAD_ERRORS.tooLarge };

  const { mime, ext } = ALLOWED_TYPES[kind];
  return { ok: true, image: { kind, mime, ext, width, height } };
}

/**
 * Cleans the original file name for DISPLAY only (we never use it on disk).
 * Drops folders, control characters and odd symbols, caps the length and
 * swaps the extension for the real one: "../../evil.php.png" → "evil.php.png"
 * is fine to show, and "photo.gif" that is really a PNG becomes "photo.png".
 */
export function sanitizeFileName(original: string, ext: string): string {
  const lastPart = original.split(/[\\/]/).pop() ?? "";
  let base = lastPart
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "") // control characters
    .replace(/[<>:"|?*`\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "") // risky symbols + bidi tricks
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, "") // the claimed extension
    .replace(/^\.+/, "") // no hidden-file names
    .trim()
    .slice(0, 100)
    .trim();
  if (!base) base = "image";
  return `${base}.${ext}`;
}

/**
 * Content-Disposition value that is safe for any file name: a plain-ASCII
 * fallback in quotes plus the exact name, percent-encoded (RFC 6266 / 5987).
 */
export function contentDisposition(fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}
