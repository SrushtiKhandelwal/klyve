import { upsertApiContact, upsertContactSchema } from "@/lib/api/contacts";
import { apiRoute, otherMethods } from "@/lib/api/handler";
import { apiError, apiJson, readJsonBody, validationError } from "@/lib/api/respond";

// POST /api/v1/contacts   create a contact, or update it if the email exists
//
// {
//   "email": "anita@example.com",
//   "firstName": "Anita", "lastName": "Rao",
//   "attributes": { "CITY": "Pune", "AGE": 31 },
//   "listIds": ["cm..."],
//   "status": "subscribed" | "unsubscribed",
//   "updateExisting": true
// }
// → 201 (created) or 200 (updated) with the contact, plus a "note" when we
//   kept something as it was (e.g. someone who unsubscribed stays unsubscribed).

export const POST = apiRoute(async (request, ctx) => {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = upsertContactSchema.safeParse(body.data);
  if (!parsed.success) return validationError(parsed.error);

  const result = await upsertApiContact(ctx.workspace, parsed.data, ctx.apiKey.id);
  if (!result.ok) return apiError("invalid_request", result.message, result.details);
  return apiJson({ ...result.contact, ...(result.note ? { note: result.note } : {}) }, result.created ? 201 : 200);
});

export const { GET, PUT, PATCH, DELETE, OPTIONS } = otherMethods(["POST"], {
  GET: "To read a contact, use GET /api/v1/contacts/{id or email}.",
});
