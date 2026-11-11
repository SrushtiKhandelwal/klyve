import Link from "next/link";
import { InfinityIcon, MailIcon, PlugIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

// The three selling points shown under the hero section.
const FEATURES = [
  {
    icon: PlugIcon,
    title: "Bring your own provider",
    text: "Connect Amazon SES, SendGrid, Mailgun or any SMTP server you already use.",
  },
  {
    icon: InfinityIcon,
    title: "No daily sending limit",
    text: "Send as much as your provider allows. We never cap you or charge per email.",
  },
  {
    icon: UsersIcon,
    title: "Contacts and campaigns",
    text: "Manage your audience, design campaigns and automate follow-ups in one place.",
  },
];

// Public landing page. It is fully static (no login check), so Next.js can
// prerender it and serve it instantly.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <MailIcon className="size-4" aria-hidden="true" />
          </span>
          {BRAND.name}
        </Link>
        <nav className="flex items-center gap-2">
          {/* Base UI buttons use the `render` prop (not `asChild`) to render
              as a link. nativeButton={false} because a link isn't a <button>. */}
          <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
            Log in
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/signup" />}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Sign up free
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-20 pb-16 text-center sm:pt-28">
          <span className="mb-6 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            100% free email marketing
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Email marketing without the limits
          </h1>
          <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
            {BRAND.tagline}
          </p>
          <div className="mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/signup" />}
              className="h-11 px-6 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Create a free account
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/login" />}
              className="h-11 px-6"
            >
              Log in
            </Button>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border bg-white p-6">
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        &copy; {BRAND.name}
      </footer>
    </div>
  );
}
