// Who may use the GDPR tools (download a contact's data, erase a contact).
// No server code here, so pages, actions and client components can share it.

export type WorkspaceRoleValue = "OWNER" | "ADMIN" | "MEMBER";

/**
 * Only owners and admins: an export hands over everything we know about a
 * person, and an erasure can't be undone, so regular members can't do either.
 */
export function canManagePrivacy(role: WorkspaceRoleValue): boolean {
  return role === "OWNER" || role === "ADMIN";
}
