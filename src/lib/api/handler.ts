import "server-only";
import { connection, type NextRequest } from "next/server";
import { authenticate, type ApiAuth } from "@/lib/api/auth";
import { takeKeyToken } from "@/lib/api/rate-limit";
import { BASE_HEADERS, apiError, methodNotAllowed, newRequestId } from "@/lib/api/respond";

// The wrapper every /api/v1 route goes through, so each one only has to
// write its own logic. In order:
//
//   1. give the request an id (X-Request-Id on the answer, and in our logs),
//   2. authenticate the API key (auth.ts),
//   3. take a token from the key's rate limit bucket (rate-limit.ts),
//   4. run the route,
//   5. catch anything unexpected → a plain 500 (details only in our logs),
//   6. add the request id, no-store and rate limit headers to the answer.
//
// About CORS: we deliberately send NO "Access-Control-Allow-Origin" header.
// API keys are server-side secrets: a key used in a web page is visible to
// every visitor. Without CORS, browsers refuse to let a web page read our
// answers, which nudges developers to call the API from their server.

export type ApiContext = ApiAuth & { requestId: string };

type RouteParams = Record<string, string | string[] | undefined>;
type Handler<P extends RouteParams> = (request: NextRequest, ctx: ApiContext, params: P) => Promise<Response>;

/** Adds headers to a response (they're mutable on responses we created). */
function withHeaders(response: Response, headers: Record<string, string>): Response {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

function internalError(requestId: string, error: unknown): Response {
  console.error(`[api] ${requestId} failed:`, error);
  return apiError(
    "internal_error",
    `Something went wrong on our side. Please try again; if it keeps happening, contact support and mention ${requestId}.`,
  );
}

/** A route that needs an API key. */
export function apiRoute<P extends RouteParams = Record<string, never>>(handler: Handler<P>) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    // API answers are never cached or prerendered: always run per request.
    await connection();
    const requestId = newRequestId();
    const base = { "X-Request-Id": requestId, "Cache-Control": "no-store" };
    try {
      const auth = await authenticate(request);
      if (!auth.ok) return withHeaders(auth.response, base);

      const limit = takeKeyToken(auth.apiKey.id);
      if (!limit.ok) {
        const response = apiError(
          "rate_limited",
          `Too many requests for this API key (max ${limit.headers["RateLimit-Limit"]} at once). Retry in ${limit.retryAfter} s.`,
        );
        return withHeaders(response, { ...base, ...limit.headers });
      }

      const params = await context.params;
      const response = await handler(request, { workspace: auth.workspace, apiKey: auth.apiKey, requestId }, params);
      return withHeaders(response, { ...base, ...limit.headers });
    } catch (error) {
      return withHeaders(internalError(requestId, error), base);
    }
  };
}

/** A route that needs no key (e.g. the JSON 404 for unknown paths). */
export function publicApiRoute(handler: (request: NextRequest) => Promise<Response> | Response) {
  return async (request: NextRequest): Promise<Response> => {
    await connection();
    const requestId = newRequestId();
    const base = { "X-Request-Id": requestId, "Cache-Control": "no-store" };
    try {
      return withHeaders(await handler(request), base);
    } catch (error) {
      return withHeaders(internalError(requestId, error), base);
    }
  };
}

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof ALL_METHODS)[number];

/**
 * JSON 405 handlers for every method a route does NOT support, e.g.
 *   export const { PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET", "POST"]);
 * (Next.js would otherwise answer an empty 405.) `messages` can explain a
 * specific method, like why DELETE isn't offered.
 */
export function otherMethods(allow: Method[], messages: Partial<Record<Method, string>> = {}) {
  const handlers = {} as Record<Method | "OPTIONS", (request: NextRequest) => Promise<Response>>;
  for (const method of ALL_METHODS) {
    handlers[method] = publicApiRoute(() => methodNotAllowed(allow, messages[method]));
  }
  // An explicit OPTIONS: lists only the methods that really work, and has no
  // CORS headers, so browsers refuse cross-site calls (see the note at the top).
  handlers.OPTIONS = publicApiRoute(
    () => new Response(null, { status: 204, headers: { ...BASE_HEADERS, Allow: [...allow, "HEAD", "OPTIONS"].join(", ") } }),
  );
  return handlers;
}
