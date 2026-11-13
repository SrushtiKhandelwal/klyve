import Link from "next/link";
import { cacheLife } from "next/cache";
import { BrandMark } from "@/components/landing/brand-mark";
import { BRAND } from "@/lib/brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs/api", label: "API docs" },
      { href: "/#developers", label: "Transactional email" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

// The bottom of every public page (landing, terms, privacy).
export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <BrandMark />
          <p className="mt-3 text-sm leading-6 text-zinc-600">{BRAND.tagline}</p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-zinc-900">{col.title}</h2>
            <ul className="mt-3 grid gap-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-sm text-sm text-zinc-600 outline-none hover:text-zinc-900 hover:underline focus-visible:ring-3 focus-visible:ring-emerald-600/40"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-zinc-200">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-zinc-500 sm:px-6">
          &copy; <CurrentYear /> {BRAND.name}. Free email marketing, sent through your own provider.
        </p>
      </div>
    </footer>
  );
}

// The year for the © line. Reading the clock isn't allowed in a static page
// unless the result is cached, so we cache it for a day ("use cache").
async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}
