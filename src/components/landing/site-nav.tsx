"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { NavigationMenu } from "@base-ui/react/navigation-menu";
import {
  BarChart3Icon,
  BookOpenIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  MenuIcon,
  MegaphoneIcon,
  SparklesIcon,
  UsersIcon,
  WorkflowIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { cn } from "@/lib/utils";

// The public site's main navigation: a "Product" menu that opens a panel of
// everything Klyve does, plus plain links. On phones it becomes a ☰ button
// that opens the same links in a panel below the bar.
//
// Links start with "/" so they also work from /terms and /privacy.

type ProductLink = { href: string; title: string; text: string; icon: LucideIcon };

const PRODUCT: ProductLink[] = [
  { href: "/#features", title: "Campaigns", text: "Design on-brand emails, schedule and send.", icon: MegaphoneIcon },
  { href: "/#automations", title: "Automations", text: "Welcome series, birthdays, win-backs.", icon: WorkflowIcon },
  { href: "/#ai", title: "AI writing", text: "A whole first draft from one sentence.", icon: SparklesIcon },
  { href: "/#analytics", title: "Analytics", text: "Opens, clicks and what to try next.", icon: BarChart3Icon },
  { href: "/#features", title: "Contacts & forms", text: "Lists, segments and signup forms.", icon: UsersIcon },
  { href: "/#developers", title: "Transactional API", text: "Receipts and alerts from your app.", icon: CodeXmlIcon },
];

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#developers", label: "Developers" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

// Plain text links; they darken on hover (and while the Product menu is open).
const linkClass =
  "relative inline-flex h-9 items-center rounded-lg px-3 text-[14.5px] font-medium text-[#4A4335] outline-none transition-colors hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-emerald-600/50 data-[popup-open]:text-zinc-950 motion-reduce:transition-none";

/**
 * The sticky top bar: a white card floating just below the top edge. Once the
 * page is scrolled it tightens (less space above, a firmer shadow), so it
 * reads as "stuck" over the content.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="sticky top-0 z-40 border-b border-[#EAE3D4] bg-[#FBF8F2] transition-[background-color,box-shadow] duration-200 data-[scrolled]:bg-white data-[scrolled]:shadow-[0_8px_24px_-18px_rgb(42_32_16/0.35)] motion-reduce:transition-none"
    >
      <div className="mx-auto grid h-[4.25rem] w-full max-w-[84rem] grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr] lg:px-10">
        {children}
      </div>
    </header>
  );
}

/** Desktop navigation (md and up). */
export function DesktopNav() {
  return (
    <NavigationMenu.Root className="hidden md:block">
      <NavigationMenu.List className="flex items-center gap-1">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className={cn(linkClass, "group inline-flex items-center gap-1")}>
            Product
            <NavigationMenu.Icon className="text-zinc-400 transition-transform duration-200 group-data-[popup-open]:rotate-180 motion-reduce:transition-none">
              <ChevronDownIcon className="size-3.5" aria-hidden="true" />
            </NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="w-[min(46rem,calc(100vw-2rem))] p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_14rem] gap-2">
              <ul className="grid grid-cols-2 gap-1 p-1">
                {PRODUCT.map((item) => (
                  <li key={item.title}>
                    <NavigationMenu.Link
                      render={<Link href={item.href} />}
                      className="group/item flex gap-3 rounded-xl p-3 outline-none transition-colors hover:bg-[#F6F3EC] focus-visible:bg-[#F6F3EC] focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                    >
                      <Glyph icon={item.icon} size="md" className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-zinc-950">{item.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-zinc-500">{item.text}</span>
                      </span>
                    </NavigationMenu.Link>
                  </li>
                ))}
              </ul>
              <NavigationMenu.Link
                render={<Link href="/#how-it-works" />}
                className="flex flex-col justify-between rounded-xl bg-[#FCEBC7] p-4 outline-none transition-colors hover:bg-[#FAE2AE] focus-visible:ring-2 focus-visible:ring-emerald-600/40"
              >
                <span>
                  <Glyph icon={BookOpenIcon} size="md" tone="current" className="text-[#9A5B12]" />
                  <span className="mt-3 block text-sm font-semibold text-[#3B2507]">New to Klyve?</span>
                  <span className="mt-1 block text-[13px] leading-5 text-[#6B4A1E]">
                    Connect your provider, import contacts and send your first campaign in three steps.
                  </span>
                </span>
                <span className="mt-4 text-[13px] font-semibold text-[#3B2507]">See how it works →</span>
              </NavigationMenu.Link>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>

        {LINKS.map((link) => (
          <NavigationMenu.Item key={link.href}>
            <NavigationMenu.Link render={<Link href={link.href} />} className={linkClass}>
              {link.label}
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        ))}
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner sideOffset={10} collisionPadding={16} className="z-50">
          <NavigationMenu.Popup className="origin-(--transform-origin) rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_48px_-24px_rgb(16_32_27/0.25),0_2px_6px_rgb(16_32_27/0.05)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

/** Phone navigation: a ☰ button that opens a panel under the bar. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Escape closes the panel; the page doesn't scroll behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="-mr-1.5 inline-flex size-10 items-center justify-center rounded-lg text-zinc-800 outline-none hover:bg-zinc-900/5 focus-visible:ring-3 focus-visible:ring-emerald-600/40"
      >
        {open ? <XIcon className="size-5" aria-hidden="true" /> : <MenuIcon className="size-5" aria-hidden="true" />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      {open && (
        <div
          id={panelId}
          className="fixed inset-x-0 top-[4.25rem] bottom-0 z-40 overflow-y-auto border-t border-[#EAE3D4] bg-white px-4 pt-4 pb-8"
        >
          <p className="px-1 text-xs font-semibold tracking-[0.12em] text-zinc-400 uppercase">Product</p>
          <ul className="mt-2 grid gap-1">
            {PRODUCT.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="flex gap-3 rounded-xl px-2 py-3 outline-none hover:bg-[#F6F3EC] focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                >
                  <Glyph icon={item.icon} size="md" className="mt-0.5" />
                  <span>
                    <span className="block text-[15px] font-semibold text-zinc-950">{item.title}</span>
                    <span className="block text-sm text-zinc-500">{item.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <ul className="mt-4 grid gap-1 border-t border-zinc-200 pt-4">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
                  className="block rounded-lg px-2 py-3 text-[15px] font-medium text-zinc-800 outline-none hover:bg-[#F6F3EC] focus-visible:ring-2 focus-visible:ring-emerald-600/40"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-3">
            <Link
              href="/signup"
              onClick={close}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[#10201B] text-[15px] font-semibold text-white"
            >
              Get started
            </Link>
            <Link
              href="/login"
              onClick={close}
              className="inline-flex h-12 items-center justify-center rounded-xl text-[15px] font-semibold text-zinc-900 ring-1 ring-zinc-300 ring-inset"
            >
              Log in
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
