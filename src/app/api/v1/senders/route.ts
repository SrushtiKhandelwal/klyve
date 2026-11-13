import { apiRoute, otherMethods } from "@/lib/api/handler";
import { apiJson } from "@/lib/api/respond";
import { getVerifiedSenders } from "@/lib/email/senders";

// GET /api/v1/senders   the verified "from" addresses you can send with

export const GET = apiRoute(async (_request, ctx) => {
  const senders = await getVerifiedSenders(ctx.workspace.id);
  return apiJson({
    object: "list",
    data: senders.map((s) => ({ object: "sender", id: s.id, email: s.email, name: s.name })),
  });
});

export const { POST, PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET"]);
