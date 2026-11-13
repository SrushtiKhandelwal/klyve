import type { ReactNode } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

// Shared frame for /terms and /privacy: the public header and footer around
// a readable column of text. We don't have the Tailwind typography plugin,
// so the [&_h2]: style rules below give headings, lists and links their look.
export function LegalPage({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-white text-zinc-900">
      <SiteHeader />
      <main id="main" className="flex-1">
        <article className="mx-auto w-full max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20 sm:pb-24">
          <header className="border-b border-zinc-200 pb-8">
            <p className="text-sm font-semibold text-emerald-700">Legal</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">{title}</h1>
            <p className="mt-3 text-sm text-zinc-500">Last updated: {lastUpdated}</p>
            <div className="mt-6 text-lg leading-8 text-pretty text-zinc-600">{intro}</div>
          </header>

          <div
            className={[
              "mt-10 text-base leading-7 text-zinc-700",
              "[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-zinc-900 [&>h2:first-child]:mt-0",
              "[&_h3]:mt-8 [&_h3]:font-semibold [&_h3]:text-zinc-900",
              "[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:grid [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:pl-1 [&_li]:marker:text-emerald-600",
              "[&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-emerald-800",
              "[&_strong]:font-semibold [&_strong]:text-zinc-900",
            ].join(" ")}
          >
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
