"use client";

import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, UPLOAD_ERRORS } from "@/lib/media/limits";

// Sends one image to POST /api/media from the browser.
// We use XMLHttpRequest instead of fetch() because only XHR reports upload
// progress, which we show as a progress bar.

export type UploadedMedia = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  fileName: string;
  sizeBytes: number;
};

export type UploadResult = { ok: true; asset: UploadedMedia } | { ok: false; error: string };

/**
 * Quick check in the browser so people get instant feedback. It's only a
 * convenience: the server checks the real bytes again and has the final say.
 */
export function precheckFile(file: File): string | null {
  if (file.size === 0) return UPLOAD_ERRORS.empty;
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_ERRORS.tooBig;
  // Some systems leave the type empty; let the server decide for those.
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) return UPLOAD_ERRORS.badType;
  return null;
}

export function uploadMedia(file: File, onProgress?: (percent: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as (UploadedMedia & { error?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.id) {
        resolve({ ok: true, asset: body });
      } else {
        resolve({ ok: false, error: body?.error ?? `Upload failed (error ${xhr.status}). Please try again.` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network problem. Check your connection and try again." });
    xhr.onabort = () => resolve({ ok: false, error: "Upload cancelled." });

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** 1536 → "1.5 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
