import "server-only";
import { randomBytes } from "node:crypto";
import { getAppUrl } from "@/lib/app-url";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { sendSystemEmail } from "@/lib/email/system-mailer";
import { teamInviteEmail } from "@/lib/email/system-templates";
import { createRateLimiter } from "@/lib/media/rate-limit";
import { ROLE_LABELS, type Role } from "@/lib/team/roles";

// Team invites: "join my workspace" links sent by email.
//
// SECURITY:
// - The link holds a long random token (32 random bytes). The database only
//   stores its sha256 hash, so a leaked database backup can't be used to
//   join anyone's workspace.
// - Accepting needs a logged-in user whose email matches the invite.
// - Links expire after 7 days, and can be revoked or replaced (resend).

export const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Most people (members + open invites) one workspace can have. */
export const MAX_TEAM_SIZE = 50;

/**
 * At most 20 invite emails (new or resent) per workspace per hour, so a
 * hijacked admin account can't use us to spam people. Kept in memory; see
 * the limits explained in src/lib/media/rate-limit.ts.
 */
export const INVITES_PER_HOUR = 20;
const inviteLimiter = createRateLimiter({ max: INVITES_PER_HOUR, windowMs: 60 * 60 * 1000 });

/** Records one invite email for the workspace; false when over the hourly limit. */
export function allowInviteEmail(workspaceId: string): { ok: true } | { ok: false; retryAfterMinutes: number } {
  const result = inviteLimiter.hit(`invite:${workspaceId}`);
  if (result.ok) return { ok: true };
  return { ok: false, retryAfterMinutes: Math.max(1, Math.ceil(result.retryAfterSeconds / 60)) };
}

/** A fresh secret for an invite link, plus the hash we store. */
export function createInviteToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
}

export function hashInviteToken(token: string): string {
  return sha256(`klyve-invite:${token}`);
}

/** Quick shape check before touching the database (a real token is 43 characters). */
export function looksLikeInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(value);
}

/** The link in the email, always on the app's public address (never the request's Host header). */
export function inviteUrl(token: string): string {
  if (process.env.NODE_ENV === "production" && !process.env.APP_URL && !process.env.BETTER_AUTH_URL) {
    throw new Error("APP_URL / BETTER_AUTH_URL is not set, so invite links can't be built safely.");
  }
  return `${getAppUrl()}/invite/${token}`;
}

/** Sends the invite email. Throws if the mail server fails (the caller decides what to tell the user). */
export async function sendInviteEmail(opts: {
  to: string;
  token: string;
  role: Role;
  inviterName: string | null;
  workspaceName: string;
}): Promise<void> {
  await sendSystemEmail({
    to: opts.to,
    ...teamInviteEmail({
      inviterName: opts.inviterName,
      workspaceName: opts.workspaceName,
      roleLabel: ROLE_LABELS[opts.role],
      url: inviteUrl(opts.token),
      expiresInDays: INVITE_TTL_DAYS,
    }),
  });
}

/** An invite is "open" while nobody accepted or revoked it (it may still be expired). */
export const OPEN_INVITE = { acceptedAt: null, revokedAt: null } as const;

/** People in the workspace plus open invites that haven't expired: counts against MAX_TEAM_SIZE. */
export async function countTeamSeats(workspaceId: string): Promise<number> {
  const [members, invites] = await Promise.all([
    db.workspaceMember.count({ where: { workspaceId } }),
    db.workspaceInvite.count({ where: { workspaceId, ...OPEN_INVITE, expiresAt: { gt: new Date() } } }),
  ]);
  return members + invites;
}

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: Date;
};

export type TeamInvite = {
  id: string;
  email: string;
  role: Role;
  invitedByName: string | null;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
};

/** Everyone in the workspace (owner first) and its open invites (newest first). */
export async function getTeam(workspaceId: string): Promise<{ members: TeamMember[]; invites: TeamInvite[] }> {
  const [memberRows, inviteRows] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    db.workspaceInvite.findMany({
      where: { workspaceId, ...OPEN_INVITE },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, email: true, role: true, invitedById: true, createdAt: true, expiresAt: true },
    }),
  ]);

  // invitedById has no database relation, so look the names up in one go.
  const inviterIds = [...new Set(inviteRows.map((i) => i.invitedById).filter((id): id is string => Boolean(id)))];
  const inviters = inviterIds.length
    ? await db.user.findMany({ where: { id: { in: inviterIds } }, select: { id: true, name: true } })
    : [];
  const inviterName = new Map(inviters.map((u) => [u.id, u.name]));

  const rank: Record<Role, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
  const members = memberRows
    .map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    }))
    // Owner first, then admins, then members; each group oldest first.
    .sort((a, b) => rank[a.role] - rank[b.role]);

  const now = Date.now();
  const invites = inviteRows.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    invitedByName: i.invitedById ? (inviterName.get(i.invitedById) ?? null) : null,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    expired: i.expiresAt.getTime() <= now,
  }));

  return { members, invites };
}

export type InviteLookup =
  | { status: "not_found" }
  | {
      status: "valid" | "expired" | "revoked" | "accepted";
      id: string;
      email: string;
      role: Role;
      workspaceId: string;
      workspaceName: string;
      inviterName: string | null;
    };

/** Finds the invite behind a link token and says whether it can still be used. */
export async function findInviteByToken(token: string): Promise<InviteLookup> {
  if (!looksLikeInviteToken(token)) return { status: "not_found" };

  const invite = await db.workspaceInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      invitedById: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  if (!invite) return { status: "not_found" };

  const inviter = invite.invitedById
    ? await db.user.findUnique({ where: { id: invite.invitedById }, select: { name: true } })
    : null;

  const status = invite.acceptedAt
    ? "accepted"
    : invite.revokedAt
      ? "revoked"
      : invite.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "valid";

  return {
    status,
    id: invite.id,
    email: invite.email,
    role: invite.role,
    workspaceId: invite.workspace.id,
    workspaceName: invite.workspace.name,
    inviterName: inviter?.name ?? null,
  };
}
