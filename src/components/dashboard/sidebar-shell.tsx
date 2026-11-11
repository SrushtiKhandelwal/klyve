"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The page frame: sidebar on the left, content on the right.
//
// Screen sizes:
// - phone (< md):   sidebar is hidden; a top bar has a menu button that slides
//                   the full sidebar in as a drawer.
// - tablet (md-lg): sidebar is a narrow strip of icons only.
// - desktop (lg+):  full-width sidebar with labels.
//
// This is a Client Component only because the phone drawer needs open/close
// state. The sidebar *contents* are passed in from the (server) layout, so
// they still render on the server.

type SidebarContextValue = { closeMobile: () => void };

const SidebarContext = createContext<SidebarContextValue>({
  closeMobile: () => {},
});

/** Lets things inside the sidebar (like nav links) close the phone drawer. */
export function useSidebar() {
  return use(SidebarContext);
}

export function SidebarShell({
  brand,
  sidebar,
  children,
}: {
  brand: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <SidebarContext value={{ closeMobile }}>
      <div className="flex min-h-svh w-full bg-zinc-50">
        {/* Phone-only top bar */}
        <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b bg-white px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          {brand}
        </header>

        {/* Dark overlay behind the open drawer; tapping it closes the drawer */}
        {mobileOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={closeMobile}
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-[translate,visibility] duration-200",
            // Tablet: icons only. Desktop: full width.
            "md:visible md:w-16 md:translate-x-0 lg:w-64",
            // Phone: slide in/out. `invisible` also removes the hidden
            // drawer's links from keyboard Tab order.
            mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full"
          )}
        >
          {/* Close button, only shown inside the phone drawer */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            className="absolute top-3 right-3 md:hidden"
            onClick={closeMobile}
          >
            <X className="size-5" />
          </Button>
          {sidebar}
        </aside>

        {/* `min-w-0` stops wide content from causing horizontal scroll. */}
        <main className="min-w-0 flex-1 pt-14 md:pt-0 md:pl-16 lg:pl-64">
          {children}
        </main>
      </div>
    </SidebarContext>
  );
}
