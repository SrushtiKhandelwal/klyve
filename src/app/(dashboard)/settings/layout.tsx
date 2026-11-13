import { Suspense, type ReactNode } from "react";
import { SectionTabs, SectionTabsFallback, type SectionTab } from "@/components/dashboard/section-tabs";

const SETTINGS_TABS: SectionTab[] = [
  { href: "/settings", label: "General" },
  { href: "/settings/providers", label: "Sending providers" },
  { href: "/settings/senders", label: "Senders" },
  { href: "/settings/domains", label: "Domains" },
  { href: "/settings/brand", label: "Brand" },
  { href: "/settings/compliance", label: "Compliance" },
  { href: "/settings/deliverability", label: "Deliverability" },
];

// Shared frame for Settings: tabs on top, the current tab's page below.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="border-b bg-white px-4 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <Suspense fallback={<SectionTabsFallback tabs={SETTINGS_TABS} label="Settings sections" />}>
            <SectionTabs tabs={SETTINGS_TABS} label="Settings sections" />
          </Suspense>
        </div>
      </div>
      {children}
    </div>
  );
}
