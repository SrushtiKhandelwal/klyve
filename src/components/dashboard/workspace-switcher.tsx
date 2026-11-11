import { getUserWorkspaces, requireActiveWorkspace } from "@/lib/workspace";
import { WorkspaceSwitcherMenu } from "./workspace-switcher-menu";

/**
 * Server half of the workspace switcher: loads the data, then hands it to the
 * interactive dropdown. Reads the session, so render it inside <Suspense>.
 */
export async function WorkspaceSwitcher() {
  // requireActiveWorkspace also redirects to /login or /onboarding if needed.
  const [active, workspaces] = await Promise.all([
    requireActiveWorkspace(),
    getUserWorkspaces(),
  ]);

  return <WorkspaceSwitcherMenu active={active} workspaces={workspaces} />;
}
