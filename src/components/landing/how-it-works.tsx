import { PlugIcon, SendIcon, UploadIcon } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const STEPS = [
  {
    icon: PlugIcon,
    title: "Connect your provider",
    text: "Add your Amazon SES, Resend, SendGrid, Mailgun, Postmark or SMTP details. We test the connection and store the keys encrypted.",
  },
  {
    icon: UploadIcon,
    title: "Import your contacts",
    text: "Upload a CSV, map the columns to fields, and organise people into lists and segments.",
  },
  {
    icon: SendIcon,
    title: "Send or automate",
    text: "Design an email, send a campaign now or later, or set up an automation that runs on its own.",
  },
];

// Three numbered steps from sign-up to first email.
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-y border-zinc-200 bg-zinc-50/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading id="how-title" eyebrow="How it works" title="Up and running in three steps" />

        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="relative rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium text-zinc-500">Step {i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
