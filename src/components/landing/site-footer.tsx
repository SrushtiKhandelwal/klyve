import Link from "next/link";
import { cacheLife } from "next/cache";
import { BrandMark } from "@/components/landing/brand-mark";
import { FooterContact } from "@/components/landing/contact-email";
import { BRAND } from "@/lib/brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
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

// The bottom of every public page (landing, terms, privacy). It ends with
// the name set huge and very faint, cropped by the bottom edge of the page.
export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-zinc-200 bg-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-4 pt-16 pb-12 sm:px-6 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <BrandMark />
          <p className="mt-4 text-sm leading-6 text-zinc-600">
            Email marketing, automation and transactional email, delivered through your own provider.
          </p>
          {/* Only shown when CONTACT_EMAIL is set. */}
          <FooterContact />
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-medium text-zinc-950">{col.title}</h2>
            <ul className="mt-4 grid gap-2.5">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded-sm text-sm text-zinc-600 transition-colors outline-none hover:text-zinc-950 focus-visible:ring-3 focus-visible:ring-emerald-600/40"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-zinc-200 px-4 py-6 text-sm text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
        <p>
          &copy; <CurrentYear /> {BRAND.name}
        </p>
        <p>klyveapp.tech</p>
      </div>

      {/* The huge, faint wordmark. Decorative only. Its size follows the
          screen width (clamp + vw), so it never causes sideways scrolling,
          and the negative bottom margin lets the page edge crop it. */}
      <div aria-hidden="true" className="mx-auto w-full max-w-6xl border-t border-zinc-200 px-4 pt-8 sm:px-6">
        <p className="-mb-[0.16em] text-center text-[clamp(6rem,24vw,19rem)] leading-none font-semibold tracking-[-0.06em] text-zinc-200/80 select-none [mask-image:linear-gradient(to_bottom,#000_35%,transparent)]">
          {BRAND.name}
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
