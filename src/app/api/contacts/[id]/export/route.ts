import { canManagePrivacy } from "@/lib/gdpr/access";
import { buildContactExport, exportFileName } from "@/lib/gdpr/export";
import { getCurrentUser } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

// GET /api/contacts/<id>/export: downloads everything we store about one
// contact as a JSON file (GDPR "right of access").
//
// Checks, in order: logged in → has an active workspace → is OWNER/ADMIN →
// the contact belongs to THAT workspace. A contact of another workspace gets
// the same 404 as one that doesn't exist, so ids can't be probed.
//
// No CSRF check is needed: it's a GET that changes nothing, and another site
// can't read the response (the browser blocks it), only trigger a download.

// Never cached by the browser or a proxy: the file holds personal data.
const PRIVATE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: PRIVATE });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The helpers that return null (not the ones that redirect): an API answers with JSON errors.
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please log in.");
  const ws = await getActiveWorkspace();
  if (!ws) return fail(404, "Contact not found.");
  if (!canManagePrivacy(ws.role)) return fail(403, "Only owners and admins can download a contact's data.");

  const { id } = await params;
  const data = await buildContactExport(ws.id, id);
  if (!data) return fail(404, "Contact not found.");

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(data.profile.email)}"`,
    },
  });
}
