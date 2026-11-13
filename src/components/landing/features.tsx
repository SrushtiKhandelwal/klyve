import {
  ChartColumnIcon,
  CodeXmlIcon,
  FileInputIcon,
  LayoutTemplateIcon,
  SendIcon,
  ShieldCheckIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

// Everything listed here is built and working. Keep it that way: only add
// a feature once it ships.
const GROUPS = [
  {
    icon: UsersIcon,
    title: "Contacts & lists",
    items: ["CSV import with column mapping", "Custom fields", "Lists and segments"],
  },
  {
    icon: SendIcon,
    title: "Sending",
    items: ["Your own provider, no daily cap", "Verified senders", "SPF, DKIM and DMARC checks"],
  },
  {
    icon: LayoutTemplateIcon,
    title: "Email editor",
    items: ["Drag-and-drop editor", "22 starter templates", "Brand kit and merge tags"],
  },
  {
    icon: ChartColumnIcon,
    title: "Campaigns",
    items: ["Send now or schedule", "Open and click tracking", "Campaign reports"],
  },
  {
    icon: WorkflowIcon,
    title: "Automation, free",
    items: ["Visual builder with if/else and waits", "Birthday and date triggers", "8 ready-made recipes"],
  },
  {
    icon: FileInputIcon,
    title: "Sign-up forms",
    items: ["Hosted page or embed code", "QR code to share", "Built-in spam protection"],
  },
  {
    icon: ShieldCheckIcon,
    title: "Compliance",
    items: ["Suppression list and double opt-in", "Preference centre", "GDPR export and erase, bounce auto-pause"],
  },
  {
    icon: CodeXmlIcon,
    title: "Transactional API",
    items: ["API keys and idempotency", "Delivery logs", "Public docs"],
  },
];

// The feature grid, grouped by area of the product.
export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading id="features-title" eyebrow="Features" title="Everything you need, nothing held back">
          The tools you&apos;d expect from a paid email platform, on a free account.
        </SectionHeading>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map(({ icon: Icon, title, items }) => (
            <li
              key={title}
              className="rounded-2xl border border-zinc-200 bg-white p-6 transition-colors hover:border-emerald-600/30"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold text-zinc-900">{title}</h3>
              <ul className="mt-3 grid gap-2">
                {items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-5 text-zinc-600">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
