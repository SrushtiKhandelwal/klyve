import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Data Access Layer for "which workspace (tenant) is the user working in?".
//
// SECURITY RULES (multi-tenant isolation):
// - Every function here works out the user from the session itself. Callers
//   can never ask "give me the workspaces of user X".
// - The `active_workspace` cookie is only a *preference*. We always re-check in
//   the database that the logged-in user is still a member before using it.
//
// IMPORTANT (Next.js 16 Cache Components): these read cookies/headers, so any
// component that calls them must be rendered inside a <Suspense> boundary.

export type ActiveWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

/** Name of the cookie that remembers the selected workspace. */
export const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

// `cache` (from React) remembers the result for the rest of ONE request, so a
// layout and a page can both ask "who is logged in?" and the session is only
// looked up once. It is never shared between requests or users.
const getUser = cache(getCurrentUser);

/** All workspaces the logged-in user belongs to, oldest membership first. */
export const getUserWorkspaces = cache(
  async (): Promise<ActiveWorkspace[]> => {
    const user = await getUser();
    if (!user) return [];

    const memberships = await db.workspaceMember.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        role: true,
        workspace: { select: { id: true, name: true, slug: true } },
      },
    });

    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  },
);

/**
 * The workspace the user is currently working in, or null if they have none.
 * Uses the cookie if it points at a workspace the user is STILL a member of,
 * otherwise falls back to their oldest membership.
 */
export const getActiveWorkspace = cache(
  async (): Promise<ActiveWorkspace | null> => {
    // This list comes fresh from the database for the logged-in user, so
    // picking from it is what enforces membership. A cookie holding someone
    // else's workspace id simply won't be found in it.
    const workspaces = await getUserWorkspaces();
    if (workspaces.length === 0) return null;

    const cookieStore = await cookies();
    const preferredId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

    return workspaces.find((w) => w.id === preferredId) ?? workspaces[0];
  },
);

/**
 * Use at the top of every page/layout that shows workspace data.
 * Not logged in → /login. No workspace yet → /onboarding.
 */
export async function requireActiveWorkspace(): Promise<ActiveWorkspace> {
  const user = await getUser();
  if (!user) redirect("/login");

  const workspace = await getActiveWorkspace();
  if (!workspace) redirect("/onboarding");

  return workspace;
}

// ---------------------------------------------------------------------------
// Helpers for the workspace Server Actions (src/app/actions/workspace.ts).
// They take a `userId`, so ONLY pass the id returned by `requireUser()` —
// never an id that came from the browser.
// ---------------------------------------------------------------------------

/** Returns the workspace if `userId` is a member of it, otherwise null. */
export async function findMembership(
  userId: string,
  workspaceId: string,
): Promise<ActiveWorkspace | null> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!membership) return null;
  return { ...membership.workspace, role: membership.role };
}

/** Creates a workspace with `userId` as its OWNER. */
export async function createWorkspaceForUser(
  userId: string,
  name: string,
): Promise<ActiveWorkspace> {
  const base = slugify(name);

  // Try the clean slug first ("acme-marketing"). If someone already has it,
  // add a short random ending ("acme-marketing-k3x9qa"). The database's unique
  // rule on `slug` is the real referee: if two people grab the same slug at
  // the same moment, one insert fails with P2002 and we simply try again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;

    const taken = await db.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (taken) continue;

    try {
      // A "nested create" runs as ONE database transaction: either both the
      // workspace and the OWNER membership are saved, or neither is.
      const workspace = await db.workspace.create({
        data: {
          name,
          slug,
          members: { create: { userId, role: "OWNER" } },
        },
        select: { id: true, name: true, slug: true },
      });
      return { ...workspace, role: "OWNER" };
    } catch (error) {
      const isUniqueClash =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!isUniqueClash) throw error;
      // Someone took this slug a split second ago: loop and try another.
    }
  }

  throw new Error("Could not find a free workspace URL. Please try again.");
}

/**
 * Remembers the selected workspace in a cookie.
 * Only works inside Server Actions or Route Handlers (where cookies can be set).
 */
export async function setActiveWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true, // JavaScript in the browser can't read or change it
    sameSite: "lax", // not sent on cross-site form posts
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // remember for a year
  });
}

/** "Acme Marketing!" → "acme-marketing" (safe to use in a URL). */
function slugify(name: string): string {
  const slug = name
    .normalize("NFKD") // split letters from accents: "é" → "e" + accent
    .replace(/[̀-ͯ]/g, "") // drop the accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // anything else becomes a dash
    .replace(/^-+|-+$/g, "") // no dashes at the start or end
    .slice(0, 40)
    .replace(/-+$/g, ""); // slicing may leave a trailing dash

  // Names like "!!!" or "日本" have no URL-safe letters left.
  return slug || "workspace";
}

/** 6 random lowercase letters/digits, e.g. "k3x9qa". */
function randomSuffix(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join(
    "",
  );
}
