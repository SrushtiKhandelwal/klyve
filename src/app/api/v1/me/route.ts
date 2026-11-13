import { apiRoute, otherMethods } from "@/lib/api/handler";
import { apiJson } from "@/lib/api/respond";

// GET /api/v1/me   "is my key right?": the workspace and key you're using

export const GET = apiRoute(async (_request, ctx) =>
  apiJson({
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
    apiKey: { id: ctx.apiKey.id, name: ctx.apiKey.name, prefix: ctx.apiKey.prefix },
  }),
);

export const { POST, PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET"]);
