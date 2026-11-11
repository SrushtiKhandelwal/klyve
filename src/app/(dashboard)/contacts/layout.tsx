import { Suspense, type ReactNode } from "react";
import { ContactsTabs, ContactsTabsFallback } from "@/components/contacts/contacts-tabs";

// Shared frame for the whole Contacts section: a row of tabs on top, the
// current tab's page below. Static, so it renders instantly.
export default function ContactsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="border-b bg-white px-4 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-5xl">
          {/* usePathname needs this boundary on pages with dynamic URLs. */}
          <Suspense fallback={<ContactsTabsFallback />}>
            <ContactsTabs />
          </Suspense>
        </div>
      </div>
      {children}
    </div>
  );
}
