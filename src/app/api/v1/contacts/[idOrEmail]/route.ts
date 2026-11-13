import { getApiContact } from "@/lib/api/contacts";
import { apiRoute, otherMethods } from "@/lib/api/handler";
import { apiError, apiJson } from "@/lib/api/respond";

// GET /api/v1/contacts/{id or email}   one contact
//   e.g. /api/v1/contacts/cm9x...  or  /api/v1/contacts/anita%40example.com
//
// There is deliberately no DELETE: deleting contacts (and their history) is
// too destructive to allow with an API key, which could leak. It's done in
// the dashboard (Contacts), where it also offers a GDPR erasure.

export const GET = apiRoute<{ idOrEmail: string }>(async (_request, ctx, { idOrEmail }) => {
  let value: string;
  try {
    value = decodeURIComponent(idOrEmail);
  } catch {
    value = "";
  }
  const contact = await getApiContact(ctx.workspace.id, value);
  if (!contact) return apiError("not_found", "No contact with this id or email in your workspace.");
  return apiJson(contact);
});

export const { POST, PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET"], {
  POST: "To create or update a contact, use POST /api/v1/contacts.",
  PUT: "To create or update a contact, use POST /api/v1/contacts.",
  PATCH: "To create or update a contact, use POST /api/v1/contacts.",
  DELETE: "Contacts can't be deleted with an API key. Delete them in the dashboard (Contacts), or unsubscribe them with POST /api/v1/contacts and \"status\": \"unsubscribed\".",
});
