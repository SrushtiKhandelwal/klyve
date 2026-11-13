import { z } from "zod";
import { apiRoute, otherMethods } from "@/lib/api/handler";
import { cursorParam, limitParam } from "@/lib/api/params";
import { apiError, apiJson, readJsonBody, readQuery, validationError } from "@/lib/api/respond";
import { listTransactionalEmails } from "@/lib/transactional/queries";
import { TRANSACTIONAL_LIMITS, TRANSACTIONAL_STATUSES, sendEmailInputSchema } from "@/lib/transactional/schema";
import { enqueueTransactional } from "@/lib/transactional/send";

// POST /api/v1/emails   send one email (receipt, password reset, ...)
// GET  /api/v1/emails   list sent emails, newest first

/** Optional "Idempotency-Key" header: 1–100 printable ASCII characters. */
const IDEMPOTENCY_KEY = new RegExp(`^[\\x20-\\x7E]{1,${TRANSACTIONAL_LIMITS.idempotencyKeyMax}}$`);

export const POST = apiRoute(async (request, ctx) => {
  const rawKey = request.headers.get("idempotency-key");
  if (rawKey !== null && !IDEMPOTENCY_KEY.test(rawKey)) {
    return apiError(
      "invalid_request",
      `The Idempotency-Key header must be 1–${TRANSACTIONAL_LIMITS.idempotencyKeyMax} printable characters (letters, digits, - _ : and so on).`,
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = sendEmailInputSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await enqueueTransactional(ctx.workspace, parsed.data, {
    apiKeyId: ctx.apiKey.id,
    idempotencyKey: rawKey,
    source: "api",
  });
  if (!result.ok) return apiError(result.code, result.message, result.details);
  // 202 Accepted: queued, sent in the background. A repeat of an earlier
  // request (same Idempotency-Key) returns that same email with 200.
  return apiJson(result.email, result.duplicate ? 200 : 202, { Location: `/api/v1/emails/${result.email.id}` });
});

const listQuery = z
  .object({
    limit: limitParam,
    cursor: cursorParam,
    status: z
      .string()
      .trim()
      .toUpperCase()
      .pipe(z.enum(TRANSACTIONAL_STATUSES, { error: `status must be one of: ${TRANSACTIONAL_STATUSES.join(", ").toLowerCase()}.` }))
      .optional(),
    to: z.string().trim().toLowerCase().min(1).max(254).optional(),
    tag: z.string().trim().min(1).max(TRANSACTIONAL_LIMITS.tagMax).optional(),
  })
  .strict();

export const GET = apiRoute(async (request, ctx) => {
  const query = readQuery(request, listQuery);
  if (!query.ok) return query.response;
  const { limit, cursor, status, to, tag } = query.data;
  const page = await listTransactionalEmails(ctx.workspace.id, { limit, cursor: cursor ?? null, status, to, tag });
  return apiJson({ object: "list", data: page.data, nextCursor: page.nextCursor });
});

export const { PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET", "POST"]);
