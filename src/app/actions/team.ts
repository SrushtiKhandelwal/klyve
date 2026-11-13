"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/session";
import {
  MAX_TEAM_SIZE,
  OPEN_INVITE,
  allowInviteEmail,
  countTeamSeats,
  createInviteToken,
  findInviteByToken,
  sendInviteEmail,
} from "@/lib/team/invites";
import {
  canChangeRole,
  canInviteAs,
  canLeave,
  canManageTeam,
  canRemoveMember,
  isAssignableRole,
} from "@/lib/team/roles";
import { clearActiveWorkspaceCookie, requireActiveWorkspace, setActiveWorkspaceCookie } from "@/lib/workspace";

// Settings → Team: invites, roles, removing people, leaving, and accepting an
// invite from the /invite/<token> page.
//
// Server Actions are public endpoints: anyone can call them with any input.
// So every action re-checks who is logged in, which workspace they're in and
// what their role allows (the rules live in src/lib/team/roles.ts), and only
// ever touches rows of THAT workspace.

export type TeamActionResult = { ok: true } | { ok: false; error: string };

const NOT_ALLOWED = "You don't have permission to do that.";
const SERVER_ERROR = "Something went wrong. Please try again.";

const InviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "That email address is too long.")
    .pipe(z.email("Please enter a valid email address.")),
  role: z.enum(["ADMIN", "MEMBER"], "Please choose a role."),
});

/** Invite someone by email. Owners can invite admins or members; admins only members. */
export async function inviteMemberAction(input: { email: string; role: string }): Promise<TeamActionResult> {
  const user = await requireUser();
  const ws = await requireActiveWorkspace();
  if (!canManageTeam(ws.role)) return { ok: false, error: NOT_ALLOWED };

  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { email, role } = parsed.data;
  if (!canInviteAs(ws.role, role)) return { ok: false, error: "Only the workspace owner can invite admins." };

  try {
    // Already in the team?
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: ws.id, user: { email: { equals: email, mode: "insensitive" } } },
      select: { id: true },
    });
    if (member) return { ok: false, error: `${email} is already in this workspace.` };

    // Already invited? A live invite → offer "Resend". An expired one is replaced below.
    const open = await db.workspaceInvite.findFirst({
      where: { workspaceId: ws.id, email, ...OPEN_INVITE },
      select: { id: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    const openIsLive = open !== null && open.expiresAt.getTime() > Date.now();
    if (openIsLive) {
      return { ok: false, error: `${email} already has an invite waiting. Use "Resend" in the list below to send it again.` };
    }

    if ((await countTeamSeats(ws.id)) >= MAX_TEAM_SIZE) {
      return { ok: false, error: `A workspace can have up to ${MAX_TEAM_SIZE} people, including open invites. Remove someone or revoke an invite first.` };
    }

    const limit = allowInviteEmail(ws.id);
    if (!limit.ok) {
      return { ok: false, error: `You've sent a lot of invites in the last hour. Please try again in ${limit.retryAfterMinutes} min.` };
    }

    const { token, tokenHash, expiresAt } = createInviteToken();
    const invite = await db.$transaction(async (tx) => {
      // Old, expired invites for the same address are replaced by the new one.
      await tx.workspaceInvite.updateMany({
        where: { workspaceId: ws.id, email, ...OPEN_INVITE, expiresAt: { lte: new Date() } },
        data: { revokedAt: new Date() },
      });
      return tx.workspaceInvite.create({
        data: { workspaceId: ws.id, email, role, tokenHash, invitedById: user.id, expiresAt },
        select: { id: true },
      });
    });

    try {
      await sendInviteEmail({ to: email, token, role, inviterName: user.name, workspaceName: ws.name });
    } catch (error) {
      // No email went out, so don't leave a half-made invite behind.
      await db.workspaceInvite.delete({ where: { id: invite.id } }).catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[team] Could not send the invite email: ${message}`);
      return { ok: false, error: "We couldn't send the invite email. Please try again in a moment." };
    }
  } catch (error) {
    console.error("inviteMemberAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  refresh();
  return { ok: true };
}

/** Finds an open invite of the CURRENT workspace that this user may manage. */
async function findManageableInvite(inviteId: unknown) {
  const ws = await requireActiveWorkspace();
  if (!canManageTeam(ws.role) || typeof inviteId !== "string" || !inviteId) return { ws, invite: null };
  const invite = await db.workspaceInvite.findFirst({
    where: { id: inviteId, workspaceId: ws.id, ...OPEN_INVITE },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  // Admins may only resend or revoke member invites.
  if (invite && !canInviteAs(ws.role, invite.role)) return { ws, invite: null };
  return { ws, invite };
}

/** Sends the invite again with a NEW link (the old link stops working) and a fresh 7 days. */
export async function resendInviteAction(inviteId: string): Promise<TeamActionResult> {
  const user = await requireUser();
  const { ws, invite } = await findManageableInvite(inviteId);
  if (!invite) return { ok: false, error: "This invite no longer exists, or you can't change it." };

  try {
    const member = await db.workspaceMember.findFirst({
      where: { workspaceId: ws.id, user: { email: { equals: invite.email, mode: "insensitive" } } },
      select: { id: true },
    });
    if (member) {
      await db.workspaceInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      refresh();
      return { ok: false, error: `${invite.email} has already joined this workspace.` };
    }

    // An expired invite didn't count as a seat; renewing it does.
    const wasExpired = invite.expiresAt.getTime() <= Date.now();
    if (wasExpired && (await countTeamSeats(ws.id)) >= MAX_TEAM_SIZE) {
      return { ok: false, error: `A workspace can have up to ${MAX_TEAM_SIZE} people, including open invites.` };
    }

    const limit = allowInviteEmail(ws.id);
    if (!limit.ok) {
      return { ok: false, error: `You've sent a lot of invites in the last hour. Please try again in ${limit.retryAfterMinutes} min.` };
    }

    const { token, tokenHash, expiresAt } = createInviteToken();
    const updated = await db.workspaceInvite.updateMany({
      where: { id: invite.id, workspaceId: ws.id, ...OPEN_INVITE },
      data: { tokenHash, expiresAt, invitedById: user.id },
    });
    if (updated.count === 0) return { ok: false, error: "This invite no longer exists." };

    try {
      await sendInviteEmail({ to: invite.email, token, role: invite.role, inviterName: user.name, workspaceName: ws.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[team] Could not resend the invite email: ${message}`);
      refresh();
      return { ok: false, error: "We couldn't send the email. Please try again in a moment." };
    }
  } catch (error) {
    console.error("resendInviteAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  refresh();
  return { ok: true };
}

/** Cancels an invite: its link stops working straight away. */
export async function revokeInviteAction(inviteId: string): Promise<TeamActionResult> {
  await requireUser();
  const { ws, invite } = await findManageableInvite(inviteId);
  if (!invite) return { ok: false, error: "This invite no longer exists, or you can't change it." };

  try {
    await db.workspaceInvite.updateMany({
      where: { id: invite.id, workspaceId: ws.id, ...OPEN_INVITE },
      data: { revokedAt: new Date() },
    });
  } catch (error) {
    console.error("revokeInviteAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  refresh();
  return { ok: true };
}

/** Owner only: make someone an admin or a member. The owner role itself never moves. */
export async function changeMemberRoleAction(memberId: string, role: string): Promise<TeamActionResult> {
  const user = await requireUser();
  const ws = await requireActiveWorkspace();
  if (typeof memberId !== "string" || !memberId || !isAssignableRole(role)) return { ok: false, error: "Invalid request." };

  try {
    const target = await db.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ws.id },
      select: { id: true, userId: true, role: true },
    });
    if (!target) return { ok: false, error: "This person is no longer in the workspace." };
    if (!canChangeRole(ws.role, target.role, target.userId === user.id)) return { ok: false, error: NOT_ALLOWED };

    // "role: not OWNER" again in the write itself, so the owner can never be demoted.
    await db.workspaceMember.updateMany({
      where: { id: target.id, workspaceId: ws.id, role: { not: "OWNER" } },
      data: { role },
    });
  } catch (error) {
    console.error("changeMemberRoleAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  refresh();
  return { ok: true };
}

/** Removes someone from the workspace. They lose access straight away (their account stays). */
export async function removeMemberAction(memberId: string): Promise<TeamActionResult> {
  const user = await requireUser();
  const ws = await requireActiveWorkspace();
  if (typeof memberId !== "string" || !memberId) return { ok: false, error: "Invalid request." };

  try {
    const target = await db.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: ws.id },
      select: { id: true, userId: true, role: true },
    });
    if (!target) return { ok: false, error: "This person is no longer in the workspace." };
    if (!canRemoveMember(ws.role, target.role, target.userId === user.id)) {
      return {
        ok: false,
        error: target.role === "ADMIN" ? "Only the workspace owner can remove admins." : NOT_ALLOWED,
      };
    }

    // Delete only if their role is still the one we checked (it may have
    // changed a moment ago). canRemoveMember never allows the owner.
    await db.workspaceMember.deleteMany({
      where: { id: target.id, workspaceId: ws.id, role: target.role },
    });
  } catch (error) {
    console.error("removeMemberAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  refresh();
  return { ok: true };
}

/** Leave the current workspace (anyone but the owner). The page then does a full reload. */
export async function leaveWorkspaceAction(): Promise<TeamActionResult> {
  const user = await requireUser();
  const ws = await requireActiveWorkspace();
  if (!canLeave(ws.role)) {
    return { ok: false, error: "The owner can't leave their own workspace." };
  }

  try {
    await db.workspaceMember.deleteMany({
      where: { workspaceId: ws.id, userId: user.id, role: { not: "OWNER" } },
    });
  } catch (error) {
    console.error("leaveWorkspaceAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  // Forget the left workspace; the next page falls back to their oldest one
  // (or onboarding if this was their only workspace).
  await clearActiveWorkspaceCookie();
  return { ok: true };
}

/**
 * The "Join" button on /invite/<token>. Needs a logged-in user whose email is
 * the invited one. Safe to click twice: joining again changes nothing.
 */
export async function acceptInviteAction(token: string): Promise<TeamActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in first." };
  if (typeof token !== "string") return { ok: false, error: "This invite link isn't valid." };

  const invite = await findInviteByToken(token);
  if (invite.status === "not_found") return { ok: false, error: "This invite link isn't valid." };

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: `This invite is for a different email address. Log in as ${invite.email} to accept it.` };
  }

  try {
    if (invite.status === "accepted") {
      // Clicked twice (or in two tabs): fine if they're in.
      const membership = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        select: { id: true },
      });
      if (!membership) return { ok: false, error: "This invite has already been used." };
    } else if (invite.status === "revoked") {
      return { ok: false, error: "This invite was cancelled. Ask the person who invited you to send a new one." };
    } else if (invite.status === "expired") {
      return { ok: false, error: "This invite has expired. Ask the person who invited you to send a new one." };
    } else {
      const now = new Date();
      const joined = await db.$transaction(async (tx) => {
        // Claim the invite first. If someone revoked it (or it expired) a
        // moment ago, nothing matches and nobody joins.
        const claimed = await tx.workspaceInvite.updateMany({
          where: { id: invite.id, ...OPEN_INVITE, expiresAt: { gt: now } },
          data: { acceptedAt: now },
        });
        if (claimed.count === 0) return false;
        // Already a member (e.g. joined from another invite)? Keep their current role.
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
          create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role === "OWNER" ? "MEMBER" : invite.role },
          update: {},
        });
        return true;
      });
      if (!joined) return { ok: false, error: "This invite is no longer valid. Ask for a new one." };
    }
  } catch (error) {
    console.error("acceptInviteAction failed:", error);
    return { ok: false, error: SERVER_ERROR };
  }

  // Open the workspace they just joined.
  await setActiveWorkspaceCookie(invite.workspaceId);
  return { ok: true };
}
