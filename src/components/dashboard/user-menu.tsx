import { requireUser } from "@/lib/session";
import { UserMenuDropdown } from "./user-menu-dropdown";

/**
 * Server half of the user menu: looks up who is logged in and passes only the
 * fields the browser needs. Reads the session, so render it inside <Suspense>.
 */
export async function UserMenu() {
  const user = await requireUser();
  return <UserMenuDropdown name={user.name} email={user.email} />;
}
