import { requireActiveWorkspace } from "@/lib/workspace";

/**
 * Safety net for the whole (dashboard) route group. Renders nothing; it only
 * redirects: not logged in → /login, no workspace yet → /onboarding.
 *
 * The layout renders it inside <Suspense> so the static shell (sidebar, page
 * skeletons) still appears instantly while this check runs.
 *
 * This is NOT a replacement for checks next to your data. Layouts don't
 * re-run when you click between pages, so any page or Server Action that
 * reads or changes data must call requireActiveWorkspace() / requireUser()
 * itself. See the comment in src/app/(dashboard)/layout.tsx.
 */
export async function AuthGuard() {
  await requireActiveWorkspace();
  return null;
}
