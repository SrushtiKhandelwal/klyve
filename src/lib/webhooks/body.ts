import "server-only";

// Reads a request/response body, but stops at `maxBytes`. Webhook URLs are
// public, so someone could POST a huge body to use up memory; `.text()`
// would read all of it before we could say no.

/** The body as bytes, or null if it's bigger than `maxBytes`. */
export async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  declaredLength?: string | null,
): Promise<Buffer | null> {
  // Cheap early "no" when the sender already told us the size.
  if (declaredLength && Number(declaredLength) > maxBytes) {
    await body?.cancel().catch(() => {});
    return null;
  }
  if (!body) return Buffer.alloc(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** JSON.parse that returns undefined instead of throwing on bad input. */
export function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
