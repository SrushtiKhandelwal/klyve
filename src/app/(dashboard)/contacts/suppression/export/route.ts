import { exportSuppressionsCsv } from "@/lib/suppression";
import { getCurrentUser } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

// GET /contacts/suppression/export: downloads the workspace's whole
// suppression list as a CSV file (email, reason, note, added_at).
//
// Checks: logged in → has an active workspace → is OWNER/ADMIN. The list is
// always the ACTIVE workspace's, worked out from the session (the URL takes
// no workspace id, so another workspace's list can't be asked for).
//
// No CSRF check is needed: it's a GET that changes nothing, and another site
// can't read the response (the browser blocks it), only trigger a download.

// Never cached by the browser or a proxy: the file holds email addresses.
const PRIVATE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: PRIVATE });
}

export async function GET() {
  // The helpers that return null (not the ones that redirect): a download answers with an error instead.
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in.");
  const ws = await getActiveWorkspace();
  if (!ws) return fail(404, "No workspace.");
  if (ws.role !== "OWNER" && ws.role !== "ADMIN") {
    return fail(403, "Only owners and admins can export the suppression list.");
  }

  const csv = await exportSuppressionsCsv(ws.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csv, {
    // The BOM (﻿) makes Excel open accented addresses correctly.
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="suppression-list-${day}.csv"`,
    },
  });
}
