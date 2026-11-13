import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, CheckCircle2Icon, CircleAlertIcon, InfoIcon } from "lucide-react";
import type { DeliverabilityData } from "@/app/(dashboard)/settings/deliverability/data";
import { cn } from "@/lib/utils";

// "Is everything set up for good delivery?" A short checklist where every
// item links to the page where it's fixed.

type ItemState = "done" | "todo" | "info";

type Item = { state: ItemState; title: string; body: ReactNode; href: string; cta: string };

const ICON: Record<ItemState, { icon: typeof CheckCircle2Icon; className: string; label: string }> = {
  done: { icon: CheckCircle2Icon, className: "text-emerald-600", label: "Done" },
  todo: { icon: CircleAlertIcon, className: "text-amber-600", label: "To do" },
  info: { icon: InfoIcon, className: "text-zinc-400", label: "Good to know" },
};

export function DeliverabilityChecklist({ data }: { data: DeliverabilityData }) {
  const { health } = data;
  const { domains } = health;
  const apiProviders = health.providers.filter((p) => p.id && p.type && p.type !== "SMTP");
  const missingWebhooks = apiProviders.filter((p) => !p.webhookEnabled);
  const hasSmtp = health.providers.some((p) => p.type === "SMTP");

  const items: Item[] = [
    {
      state: domains.authenticated > 0 ? "done" : "todo",
      title: "Authenticate your sending domain",
      body:
        domains.total === 0
          ? "Add the domain you send from and set up SPF, DKIM and DMARC. Without them, Gmail and Yahoo may reject your email."
          : domains.authenticated > 0
            ? `${domains.authenticated} of ${domains.total} domain${domains.total === 1 ? "" : "s"} passed DKIM and DMARC at the last check.`
            : domains.checked === 0
              ? "Run a DNS check on your domain to confirm SPF, DKIM and DMARC are set up."
              : "Your domain's last check didn't pass DKIM and DMARC. Follow the steps on the Domains page.",
      href: "/settings/domains",
      cta: "Domains",
    },
    apiProviders.length === 0
      ? {
          state: "info",
          title: "Bounce and spam reports",
          body: hasSmtp
            ? "SMTP servers can't tell us about bounces or spam complaints, so they don't appear in these numbers. Check your mailbox for bounce messages, or use an API provider (Amazon SES, Resend, SendGrid, Mailgun, Postmark) to track them automatically."
            : "Connect a provider to start sending.",
          href: "/settings/providers",
          cta: "Providers",
        }
      : {
          state: missingWebhooks.length === 0 ? "done" : "todo",
          title: "Turn on bounce and spam reports (webhooks)",
          body:
            missingWebhooks.length === 0
              ? "Your providers report bounces and complaints to Klyve, so bad addresses are blocked automatically."
              : `Not set up for ${missingWebhooks.map((p) => p.name).join(", ")}. Without it, bounced addresses keep being emailed and the rates on this page stay at zero.`,
          href: missingWebhooks.length === 1 ? `/settings/providers/${missingWebhooks[0].id}` : "/settings/providers",
          cta: "Providers",
        },
    {
      state: data.postalAddressSet ? "done" : "todo",
      title: "Add your postal address",
      body: data.postalAddressSet
        ? "It's shown in the footer of your emails, as anti-spam laws (CAN-SPAM, GDPR) require."
        : "Anti-spam laws require a postal address in every marketing email. Add it to your brand settings.",
      href: "/settings/brand",
      cta: "Brand",
    },
    {
      state: data.doubleOptIn ? "done" : "info",
      title: "Double opt-in",
      body: data.doubleOptIn
        ? "New subscribers confirm their address first, so typos and fake sign-ups never reach your list."
        : "Optional but recommended: new subscribers confirm their address by email, which keeps bounces and spam complaints low.",
      href: "/settings/compliance",
      cta: "Compliance",
    },
    {
      state: "info",
      title: "Suppression list",
      body: `${health.suppressedCount.toLocaleString("en-US")} address${health.suppressedCount === 1 ? " is" : "es are"} blocked from all campaigns (bounced, complained or added by you). Importing your old tool's unsubscribe list here keeps you from emailing those people again.`,
      href: "/contacts/suppression",
      cta: "Suppression list",
    },
  ];

  return (
    <section className="rounded-xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-zinc-900">Checklist</h2>
        <p className="text-sm text-zinc-500">The settings that matter most for reaching the inbox.</p>
      </div>
      <ul className="divide-y">
        {items.map((item) => {
          const meta = ICON[item.state];
          const Icon = meta.icon;
          return (
            <li key={item.title} className="flex gap-3 px-5 py-4">
              <Icon className={cn("mt-0.5 size-5 shrink-0", meta.className)} aria-label={meta.label} />
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">{item.title}</p>
                  <p className="text-sm break-words text-zinc-500">{item.body}</p>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-700 hover:underline"
                >
                  {item.cta}
                  <ArrowRightIcon className="size-3.5" aria-hidden />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
