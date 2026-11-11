"use client";

// Small display pieces shared by the providers list and forms.
import { useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, CircleDashed, Cloud, Mail, Send, Server, Zap, type LucideIcon } from "lucide-react";
import type { ProviderTypeValue } from "@/lib/email/provider-configs";
import { cn } from "@/lib/utils";

export type ProviderStatusValue = "UNTESTED" | "CONNECTED" | "FAILED";

const STATUS: Record<ProviderStatusValue, { label: string; icon: LucideIcon; className: string }> = {
  UNTESTED: { label: "Untested", icon: CircleDashed, className: "bg-zinc-100 text-zinc-600" },
  CONNECTED: { label: "Connected", icon: CircleCheck, className: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", icon: CircleAlert, className: "bg-red-50 text-red-700" },
};

export function ProviderStatusBadge({ status, className }: { status: ProviderStatusValue; className?: string }) {
  const { label, icon: Icon, className: tone } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

const TYPE_ICONS: Record<ProviderTypeValue, LucideIcon> = {
  SMTP: Server,
  AMAZON_SES: Cloud,
  RESEND: Send,
  SENDGRID: Mail,
  MAILGUN: Zap,
  POSTMARK: Mail,
};

export function ProviderTypeIcon({ type, className }: { type: ProviderTypeValue; className?: string }) {
  const Icon = TYPE_ICONS[type] ?? Server;
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

const subscribe = () => () => {};

/**
 * "5 minutes ago". The server doesn't know the viewer's clock or time zone,
 * so it first renders a fixed UTC date; in the browser it switches to the
 * relative text (useSyncExternalStore avoids a hydration mismatch).
 */
export function RelativeTime({ iso }: { iso: string }) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(iso);
  const absolute = date.toLocaleString(inBrowser ? undefined : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(inBrowser ? {} : { timeZone: "UTC" }),
  });
  return (
    <time dateTime={iso} title={absolute}>
      {inBrowser ? relative(date) : `${absolute} UTC`}
    </time>
  );
}

function relative(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return format.format(Math.round(seconds / 86400), "day");
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}
