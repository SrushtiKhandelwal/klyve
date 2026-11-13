import { Suspense, type ReactNode } from "react";
import { SettingsNav, SettingsNavFallback } from "@/components/dashboard/settings-nav";

// Shared frame for Settings: the settings menu on the left (a compact
// drop-down box on top for phones and tablets), the current page beside it.
// The menu stays in view while the page scrolls on desktop. Every settings
// page keeps its own URL (/settings, /settings/profile, …).
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:mx-auto lg:flex lg:max-w-7xl lg:items-start">
      <div className="px-4 pt-6 sm:px-6 md:pt-8 lg:sticky lg:top-0 lg:max-h-svh lg:w-56 lg:shrink-0 lg:overflow-y-auto lg:py-10 lg:pr-0 lg:pl-8">
        {/* usePathname needs this boundary on pages with dynamic URLs. */}
        <Suspense fallback={<SettingsNavFallback />}>
          <SettingsNav />
        </Suspense>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
