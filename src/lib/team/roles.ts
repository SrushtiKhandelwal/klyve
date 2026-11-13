// Who may do what on Settings → Team. Pure functions (no database), so the
// page (to show or hide buttons) and the Server Actions (the real check) use
// exactly the same rules, and they're easy to test.
//
// The rules, in short:
// - Every workspace has exactly ONE owner. Ownership is never handed out by
//   invite or by "change role", and the owner can't be removed or leave.
// - The owner can invite admins and members, change anyone else's role, and
//   remove anyone else.
// - Admins can invite members, and remove members (not other admins).
// - Members can only leave.

export type Role = "OWNER" | "ADMIN" | "MEMBER";
/** The roles an invite (or "change role") can give. */
export type AssignableRole = "ADMIN" | "MEMBER";

export const ROLE_LABELS: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full access, including team and workspace settings.",
  ADMIN: "Full access. Can invite and remove members.",
  MEMBER: "Can work on contacts, campaigns and templates.",
};

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === "ADMIN" || value === "MEMBER";
}

/** Owners and admins manage the team (invites, removing members). */
export function canManageTeam(actor: Role): boolean {
  return actor === "OWNER" || actor === "ADMIN";
}

/** The roles `actor` may hand out in an invite (empty = can't invite). */
export function invitableRoles(actor: Role): AssignableRole[] {
  if (actor === "OWNER") return ["ADMIN", "MEMBER"];
  if (actor === "ADMIN") return ["MEMBER"];
  return [];
}

/** May `actor` invite someone as `role`? (Also used for resend/revoke of such an invite.) */
export function canInviteAs(actor: Role, role: Role): boolean {
  return (invitableRoles(actor) as Role[]).includes(role);
}

/** May `actor` change `target`'s role? Only the owner, and never their own (or another owner's). */
export function canChangeRole(actor: Role, target: Role, isSelf: boolean): boolean {
  return actor === "OWNER" && !isSelf && target !== "OWNER";
}

/** May `actor` remove `target` from the workspace? (Leaving yourself is separate.) */
export function canRemoveMember(actor: Role, target: Role, isSelf: boolean): boolean {
  if (isSelf || target === "OWNER") return false;
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return target === "MEMBER";
  return false;
}

/** Anyone except the owner may leave (the workspace always needs its owner). */
export function canLeave(actor: Role): boolean {
  return actor !== "OWNER";
}
