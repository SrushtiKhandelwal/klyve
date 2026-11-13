import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FileSpreadsheetIcon,
  LockKeyholeIcon,
  PlugZapIcon,
  SendIcon,
  UsersIcon,
} from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { MockButton, MockField, MockFrame, MockHeader, StatusDot } from "@/components/landing/mockups/parts";
import { cn } from "@/lib/utils";

// The three small product pictures in "How it works": connecting a provider,
// importing contacts, and reviewing a campaign before it's sent.

const PROVIDERS = ["Amazon SES", "Resend", "SendGrid", "Mailgun", "Postmark", "SMTP or Gmail"];

/** Step 1: choosing a sending provider, with the DNS checks passing. */
export function ProviderMockup({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Connecting Amazon SES as the sending provider. The connection is verified and the SPF, DKIM and DMARC checks pass."
      className={className}
    >
      <MockHeader
        title={
          <>
            <Glyph icon={PlugZapIcon} size="sm" />
            Sending provider
          </>
        }
        aside={<StatusDot pulse>Connected</StatusDot>}
      />
      <div className="p-4">
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {PROVIDERS.map((name, i) => (
            <div
              key={name}
              className={cn(
                "flex items-center gap-2 border-b border-zinc-100 py-2 text-[12px]",
                i === 0 ? "font-medium text-zinc-900" : "text-zinc-500",
              )}
            >
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  i === 0 ? "border-emerald-600" : "border-zinc-300",
                )}
              >
                {i === 0 && <span className="size-2 rounded-full bg-emerald-600" />}
              </span>
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MockField label="Access key">
            <span className="font-mono tracking-wider text-zinc-500">AKIA••••••••••</span>
          </MockField>
          <MockField label="Region">
            <span className="flex-1">eu-west-1</span>
            <ChevronDownIcon className="size-3.5 text-zinc-400" />
          </MockField>
        </div>

        <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-zinc-700">monsooncoffee.in</span>
            <span className="text-zinc-500">DNS records</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {["SPF", "DKIM", "DMARC"].map((record) => (
              <div key={record} className="flex items-center justify-between gap-1 text-[11px]">
                <span className="font-mono text-zinc-600">{record}</span>
                <CheckIcon className="size-3.5 text-emerald-600" strokeWidth={2.5} />
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Glyph icon={LockKeyholeIcon} size="xs" />
          Encrypted before it&apos;s stored. Never shown again.
        </p>
      </div>
    </MockFrame>
  );
}

const COLUMNS = [
  { from: "email", to: "Email" },
  { from: "first_name", to: "First name" },
  { from: "city", to: "City" },
  { from: "birthday", to: "Birthday" },
];

/** Step 2: matching a CSV's columns to Klyve fields. */
export function ImportMockup({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Importing a CSV file of 1,248 contacts: each column is matched to a Klyve field, and everyone is added to the Newsletter list."
      className={className}
    >
      <MockHeader
        title={
          <>
            <Glyph icon={UsersIcon} size="sm" />
            Import contacts
          </>
        }
        aside={<span className="text-[11px] text-zinc-500">Step 2 of 3</span>}
      />
      <div className="p-4">
        <div className="flex items-center gap-2.5 text-[12px]">
          <Glyph icon={FileSpreadsheetIcon} size="md" />
          <div className="min-w-0">
            <div className="truncate font-medium text-zinc-900">customers.csv</div>
            <div className="text-[11px] text-zinc-500">1,248 rows · 4 columns</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 text-[11px] font-medium text-zinc-500">
          <span>Column in your file</span>
          <span />
          <span>Klyve field</span>
        </div>
        <div className="mt-1.5 grid gap-1.5">
          {COLUMNS.map(({ from, to }) => (
            <div key={from} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
              <span className="truncate rounded-md bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] text-zinc-700">
                {from}
              </span>
              <ArrowRightIcon className="size-3.5 text-emerald-600" />
              <span className="flex items-center justify-between rounded-md border border-zinc-200 px-2.5 py-1.5 text-[12px] text-zinc-800">
                {to}
                <ChevronDownIcon className="size-3 text-zinc-400" />
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-100 pt-4">
          <MockField label="Add everyone to" className="w-40">
            <span className="flex-1">Newsletter</span>
            <ChevronDownIcon className="size-3.5 text-zinc-400" />
          </MockField>
          <MockButton>Import 1,248 contacts</MockButton>
        </div>
      </div>
    </MockFrame>
  );
}

const CHECKS = [
  { label: "From", value: "Monsoon Coffee <hello@monsooncoffee.in>" },
  { label: "To", value: "Newsletter · 1,236 contacts" },
  { label: "Subject", value: "Our autumn roast is here" },
  { label: "Tracking", value: "Opens, clicks and UTM tags" },
];

/** Step 3: the final review before a campaign is scheduled. */
export function SendMockup({ className }: { className?: string }) {
  return (
    <MockFrame
      label="Reviewing a campaign before sending: sender, recipients, subject and tracking are all checked, and it is scheduled for Tuesday at 10 AM."
      className={className}
    >
      <MockHeader
        title={
          <>
            <Glyph icon={SendIcon} size="sm" />
            Review and send
          </>
        }
        aside={<StatusDot>All checks passed</StatusDot>}
      />
      <div className="p-4">
        <dl className="grid gap-2.5">
          {CHECKS.map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[1rem_4.5rem_1fr] items-center gap-2 text-[12px]">
              <CheckIcon className="size-3.5 text-emerald-600" strokeWidth={2.5} />
              <dt className="text-zinc-500">{label}</dt>
              <dd className="truncate font-medium text-zinc-900">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 grid grid-cols-2 rounded-lg bg-zinc-100 p-0.5 text-center text-[12px] font-medium">
          <span className="rounded-md py-1.5 text-zinc-500">Send now</span>
          <span className="rounded-md bg-white py-1.5 text-zinc-900 shadow-sm">Schedule</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <MockField label="Date">Tue, 18 Nov</MockField>
          <MockField label="Time">10:00 AM IST</MockField>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
          <span className="text-[11px] text-zinc-500">Sends through Amazon SES</span>
          <MockButton>Schedule campaign</MockButton>
        </div>
      </div>
    </MockFrame>
  );
}
