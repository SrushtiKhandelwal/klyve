import type { ReactNode } from "react";
import Link from "next/link";
import { InfinityIcon, PlugIcon, WorkflowIcon } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";

// Three short reminders of what Klyve is, shown beside the form on wide screens.
const POINTS = [
  {
    icon: PlugIcon,
    title: "Bring your own provider",
    text: "Amazon SES, Resend, SendGrid, Mailgun, Postmark or SMTP.",
  },
  {
    icon: InfinityIcon,
    title: "No daily sending cap",
    text: "Send as much as your provider allows. We don't charge per email.",
  },
  {
    icon: WorkflowIcon,
    title: "Automation included",
    text: "Welcome series, birthdays and follow-ups, free.",
  },
];

// Shared frame for /login, /signup, /forgot-password, /reset-password and
// /verify-email: the page's card centred, with a slim product panel on the
// left on wide screens. The "(auth)" folder name is a route group: it groups
// these pages under one layout without adding "/auth" to the URL.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 bg-zinc-50">
      <aside
        aria-label="About Klyve"
        className="hidden w-[400px] shrink-0 flex-col justify-between border-r border-emerald-900/10 bg-emerald-50/70 px-10 py-10 lg:flex xl:w-[440px]"
      >
        <BrandMark />

        <div>
          <p className="text-2xl font-semibold tracking-tight text-balance text-zinc-900">
            Free email marketing, sent through your own provider.
          </p>
          <ul className="mt-8 grid gap-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-600/15">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">{title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-zinc-600">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Legal" className="flex gap-4 text-sm text-zinc-500">
          <Link href="/terms" className="hover:text-zinc-900 hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-zinc-900 hover:underline">
            Privacy
          </Link>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        {/* On phones and tablets the side panel is hidden, so show the logo here. */}
        <BrandMark className="mb-8 text-xl lg:hidden" />
        <main id="main" className="w-full max-w-sm">
          {children}
        </main>
      </div>
    </div>
  );
}
