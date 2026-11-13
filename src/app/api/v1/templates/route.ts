import { z } from "zod";
import { db } from "@/lib/db";
import { apiRoute, otherMethods } from "@/lib/api/handler";
import { ID_PATTERN, cursorParam, limitParam } from "@/lib/api/params";
import { apiError, apiJson, readQuery } from "@/lib/api/respond";

// GET /api/v1/templates?limit=20&cursor=…
// The workspace's email templates (most recently edited first), so you can
// pick a templateId for POST /api/v1/emails. Pass the answer's `nextCursor`
// as ?cursor= to get the next page (null = no more pages).

const query = z.object({ limit: limitParam, cursor: cursorParam }).strict();

export const GET = apiRoute(async (request, ctx) => {
  const q = readQuery(request, query);
  if (!q.ok) return q.response;
  const { limit, cursor } = q.data;
  const workspaceId = ctx.workspace.id;

  // The cursor is a template id. It must be one of THIS workspace's templates;
  // otherwise it's refused (rather than paging relative to someone else's).
  if (cursor) {
    const known = ID_PATTERN.test(cursor) && (await db.emailTemplate.count({ where: { id: cursor, workspaceId } })) > 0;
    if (!known) {
      return apiError("invalid_request", "Some query parameters are invalid. See details.", [
        { path: "cursor", message: "Unknown cursor. Use the nextCursor value from the previous page." },
      ]);
    }
  }

  const rows = await db.emailTemplate.findMany({
    where: { workspaceId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1, // one extra tells us whether there's another page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, name: true, subject: true, updatedAt: true },
  });
  const page = rows.slice(0, limit);
  return apiJson({
    object: "list",
    data: page.map((t) => ({
      object: "template",
      id: t.id,
      name: t.name,
      subject: t.subject || null,
      updatedAt: t.updatedAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  });
});

export const { POST, PUT, PATCH, DELETE, OPTIONS } = otherMethods(["GET"]);
