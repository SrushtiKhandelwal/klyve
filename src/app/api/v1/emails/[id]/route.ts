import { apiRoute, otherMethods } from "@/lib/api/handler";
import { ID_PATTERN } from "@/lib/api/params";
import { apiError, apiJson } from "@/lib/api/respond";
import { getTransactionalEmail } from "@/lib/transactional/queries";

// GET /api/v1/emails/{id}   one email and its current status

export const GET = apiRoute<{ id: string }>(async (_request, ctx, { id }) => {
  // Always looked up inside the caller's workspace: another workspace's
  // email id gives the same 404 as an id that never existed.
  const email = ID_PATTERN.test(id) ? await getTransactionalEmail(ctx.workspace.id, id) : null;
  if (!email) return apiError("not_found", "No email with this id in your workspace.");
  return apiJson(email);
});

export const { POST, PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET"]);
