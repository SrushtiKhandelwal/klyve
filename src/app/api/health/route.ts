import { connection } from "next/server";
import { db } from "@/lib/db";

// GET /api/health: "is the app up, and can it reach the database?"
// Used by Docker's HEALTHCHECK and by uptime monitors (see docs/DEPLOY.md).
// 200 {"status":"ok"} or 503 {"status":"error"}. It reveals nothing else.
export async function GET() {
  // Always answer at request time (never a copy made during the build).
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health] database check failed:", err instanceof Error ? err.message : err);
    return Response.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
