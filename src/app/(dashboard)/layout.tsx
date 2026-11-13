import { Suspense, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { BrandMark } from "@/components/dashboard/brand-mark";
import { SidebarNav, SidebarNavFallback } from "@/components/dashboard/sidebar-nav";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import {
  UserMenuSkeleton,
  WorkspaceSwitcherSkeleton,
} from "@/components/dashboard/skeletons";
import { UserMenu } from "@/components/dashboard/user-menu";
import { VerifyEmailBanner } from "@/components/dashboard/verify-email-banner";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { DatePrefsProvider } from "@/components/date-prefs-provider";
import type { DatePrefs } from "@/lib/format-date";
import { getActiveWorkspace } from "@/lib/workspace";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";

// The logged-in app shell: sidebar + main content, shared by every page in
// the (dashboard) group (/dashboard, /contacts, /campaigns, ...).
//
// SPEED: this layout never `await`s anything. Everything that depends on WHO
// is logged in (workspace switcher, user menu, auth check) lives in its own
// component inside <Suspense>, so the sidebar and page frame are prerendered
// and show instantly, and only those small bits stream in.
//
// ─── HOW PAGES IN THIS GROUP ARE PROTECTED ──────────────────────────────────
// 1. src/proxy.ts (Engineer B) bounces visitors with no session cookie to
//    /login before anything renders. It's a fast first filter only.
// 2. <AuthGuard /> below calls requireActiveWorkspace() on every full page
//    load, so even a page that forgets to check is still protected:
//    logged out → /login, no workspace → /onboarding.
// 3. RULE FOR NEW PAGES: layouts do NOT re-run when the user clicks between
//    pages, so (2) is only a safety net. Any page that shows real data must
//    load it in an async component inside <Suspense> that calls
//    requireActiveWorkspace() (or requireUser()) itself, and every Server
//    Action must check again too. See settings/page.tsx for an example.
// ────────────────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Started here but NOT awaited (see SPEED above): the date components wait
  // for it themselves, inside the pages' own <Suspense> sections.
  const datePrefs = loadDatePrefs();

  return (
    <DatePrefsProvider prefs={datePrefs}>
      <Suspense fallback={null}>
        <AuthGuard />
      </Suspense>

      <SidebarShell brand={<BrandMark />} sidebar={<SidebarContents />}>
        {/* "Please verify your email" strip; renders nothing once verified. */}
        <Suspense fallback={null}>
          <VerifyEmailBanner />
        </Suspense>
        {children}
      </SidebarShell>
    </DatePrefsProvider>
  );
}

/**
 * The active workspace's date settings (time zone, date and time format),
 * for every date shown on the dashboard. null when there's no workspace (or
 * on a database hiccup): dates then fall back to the viewer's time zone.
 */
async function loadDatePrefs(): Promise<DatePrefs | null> {
  try {
    const workspace = await getActiveWorkspace();
    return workspace ? await getWorkspaceDatePrefs(workspace.id) : null;
  } catch (error) {
    // Let Next.js's own signals (e.g. "this page is dynamic") through.
    unstable_rethrow(error);
    console.error("Could not load the workspace's date settings:", error);
    return null;
  }
}

function SidebarContents() {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center px-5 md:max-lg:justify-center md:max-lg:px-0">
        <BrandMark collapsible />
      </div>

      <div className="px-3 md:max-lg:px-2">
        <Suspense fallback={<WorkspaceSwitcherSkeleton />}>
          <WorkspaceSwitcher />
        </Suspense>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5 md:max-lg:px-2">
        {/* usePathname needs this boundary on pages with dynamic URLs. */}
        <Suspense fallback={<SidebarNavFallback />}>
          <SidebarNav />
        </Suspense>
      </nav>

      <div className="border-t p-3 md:max-lg:px-2">
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu />
        </Suspense>
      </div>
    </>
  );
}
