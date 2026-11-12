import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { checkQuota, createMediaAsset, uploadRateLimiter } from "@/lib/media/assets";
import { MAX_UPLOAD_BYTES, UPLOAD_ERRORS } from "@/lib/media/limits";
import { validateImageBytes } from "@/lib/media/validate";
import { getActiveWorkspace } from "@/lib/workspace";

// POST /api/media: upload one image to the active workspace's library.
// Send it as multipart/form-data with the image in the field "file".
//
// Every check happens here on the server, in this order:
//  1. the request comes from our own site (not a form on another website),
//  2. logged in, and a member of a workspace,
//  3. not uploading too fast (30 per 10 minutes per user),
//  4. not too big (checked from the header AND while reading the body),
//  5. really a PNG/JPEG/GIF/WebP (by its bytes) and not over 6000×6000,
//  6. the workspace still has room (500 images / 500 MB).
//
// Note: we don't use requireActiveWorkspace() here, because it redirects to
// /login. An upload request wants a JSON error instead, so we use the helpers
// that return null.

// Room for the multipart wrapping (boundaries, part headers) around the file.
const MULTIPART_OVERHEAD = 64 * 1024;
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD;

function fail(status: number, error: string, headers?: HeadersInit) {
  return Response.json({ error }, { status, headers });
}

/**
 * Blocks cross-site requests (CSRF). Server Actions get this check from
 * Next.js automatically; Route Handlers don't, so we do it ourselves.
 * Browsers always send Origin / Sec-Fetch-Site on uploads. Tools like curl
 * send neither, but they also don't carry a victim's cookies, so that's fine.
 */
function isSameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([request.nextUrl.origin]);
  if (process.env.BETTER_AUTH_URL) {
    try {
      allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
    } catch {
      // A malformed setting just means we only trust the request's own origin.
    }
  }
  return allowed.has(origin);
}

/**
 * Reads the request body but stops as soon as it goes over `limit` bytes, so
 * a huge upload can't fill the server's memory. Returns null if too big.
 */
async function readBodyWithLimit(request: NextRequest, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Uploads must come from this site.");

  // 2. Who is this, and which workspace are they in?
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return fail(401, "Please log in again.");
  const workspace = await getActiveWorkspace(); // re-checks membership in the database
  if (!workspace) return fail(403, "You need a workspace before uploading images.");

  // 3. Rate limit: counts every attempt, including rejected files.
  const rate = uploadRateLimiter.hit(session.user.id);
  if (!rate.ok) {
    return fail(429, UPLOAD_ERRORS.rateLimited, { "Retry-After": String(rate.retryAfterSeconds) });
  }

  // 4a. Early size check from the header (cheap, before reading anything).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, UPLOAD_ERRORS.tooBig);

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return fail(415, "Send the image as multipart/form-data in the field “file”.");
  }

  // 4b. The header can lie (or be missing), so count bytes while reading too.
  const body = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (!body) return fail(413, UPLOAD_ERRORS.tooBig);

  let file: File;
  try {
    // Parse the bytes we already read (and limited) as a form.
    const form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
    const value = form.get("file");
    if (!(value instanceof File)) return fail(400, UPLOAD_ERRORS.noFile);
    file = value;
  } catch {
    return fail(400, "That upload couldn't be read. Please try again.");
  }

  if (file.size > MAX_UPLOAD_BYTES) return fail(413, UPLOAD_ERRORS.tooBig);

  // 5. Is it really an allowed image? (By its bytes, not its name or claimed type.)
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateImageBytes(bytes);
  if (!check.ok) {
    const status = check.error === UPLOAD_ERRORS.tooBig ? 413 : check.error === UPLOAD_ERRORS.badType ? 415 : 422;
    return fail(status, check.error);
  }

  // 6. Room left in the workspace's library?
  const quotaError = await checkQuota(workspace.id, bytes.byteLength);
  if (quotaError) return fail(403, quotaError);

  try {
    const asset = await createMediaAsset({
      workspaceId: workspace.id,
      userId: session.user.id,
      originalName: file.name,
      bytes,
      image: check.image,
    });
    return Response.json(
      {
        id: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
        sizeBytes: asset.sizeBytes,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Media upload failed:", error);
    return fail(500, "Something went wrong saving the image. Please try again.");
  }
}
