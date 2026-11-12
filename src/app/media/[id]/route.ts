import type { NextRequest } from "next/server";
import { findPublicAsset } from "@/lib/media/assets";
import { parseStorageKey } from "@/lib/media/storage";
import { contentDisposition } from "@/lib/media/validate";

// GET /media/<id>: the PUBLIC address of an uploaded image.
//
// No login on purpose: images inside emails are fetched by the reader's email
// app (or e.g. Gmail's image proxy), which has no Klyve session. The id is
// 128 random bits, so nobody can guess other images' addresses.
//
// Safety headers make sure a browser only ever treats the file as an image:
// - Content-Type comes from OUR byte check at upload time, never the uploader,
// - nosniff stops the browser from guessing a different type,
// - a CSP of "default-src 'none'" means even if it were opened as a page,
//   nothing in it (scripts, styles, frames…) could run or load.
//
// An image never changes after upload (a new upload gets a new id), so it can
// be cached "forever" and the id itself works as the ETag.

const NOT_FOUND_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'",
  // Short cache so a 404 isn't remembered for long.
  "Cache-Control": "public, max-age=60",
};

function notFound() {
  return new Response("Not found", { status: 404, headers: NOT_FOUND_HEADERS });
}

async function serve(request: NextRequest, ctx: RouteContext<"/media/[id]">, includeBody: boolean) {
  const { id } = await ctx.params;
  const asset = await findPublicAsset(id);
  if (!asset) return notFound();

  const etag = `"${asset.id}"`;
  const headers: Record<string, string> = {
    "Content-Type": asset.mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": contentDisposition(asset.fileName),
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin", // other sites (webmail) may show it
    ETag: etag,
  };

  // The browser already has this exact image: answer "not modified".
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim().replace(/^W\//, "") === etag || t.trim() === "*")) {
    return new Response(null, { status: 304, headers });
  }

  let storage, key;
  try {
    ({ storage, key } = parseStorageKey(asset.storageKey));
  } catch {
    return notFound();
  }

  if (!includeBody) {
    // HEAD: same headers, no bytes. The size comes from the database.
    return new Response(null, { status: 200, headers: { ...headers, "Content-Length": String(asset.sizeBytes) } });
  }

  const object = await storage.get(key);
  // Row exists but the file is gone (e.g. half-finished delete): treat as missing.
  if (!object) return notFound();

  return new Response(object.body, {
    status: 200,
    headers: { ...headers, "Content-Length": String(object.size) },
  });
}

export function GET(request: NextRequest, ctx: RouteContext<"/media/[id]">) {
  return serve(request, ctx, true);
}

export function HEAD(request: NextRequest, ctx: RouteContext<"/media/[id]">) {
  return serve(request, ctx, false);
}
