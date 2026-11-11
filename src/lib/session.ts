import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Data Access Layer for "who is logged in?".
// Every Server Component, Server Action and Route Handler that needs the
// current user should go through these helpers. Never trust the browser.
//
// IMPORTANT (Next.js 16 Cache Components): these read request headers, so any
// component that calls them must be rendered inside a <Suspense> boundary.

export type CurrentUser = { id: string; name: string; email: string };

/** Returns the logged-in user, or null if nobody is logged in. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

/** Returns the logged-in user, or sends the visitor to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
