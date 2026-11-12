"use client";

import { useState, useTransition } from "react";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Copy,
  Info,
  Loader2,
  Power,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { disableWebhookAction, enableWebhookAction, regenerateWebhookAction } from "@/app/actions/webhooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WebhookSettings } from "@/lib/webhooks/admin";
import { WEBHOOK_GUIDES, type WebhookProviderType } from "@/lib/webhooks/setup-guide";
import { RelativeTime } from "./provider-bits";
import { WebhookSecretForm } from "./webhook-secret-form";

/**
 * "Bounce & complaint tracking" on a provider's edit page. Shows the
 * webhook URL to paste into the provider, step-by-step setup, the optional
 * signing secret and whether events are arriving. Owners/admins only (the
 * URL contains a secret token); the server checks the role again.
 */
export function WebhookCard({ providerId, settings }: { providerId: string; settings: WebhookSettings }) {
  if (settings.type === "SMTP") return <SmtpNote />;
  return <ApiWebhookCard providerId={providerId} type={settings.type} settings={settings} />;
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border bg-white" aria-labelledby="webhook-card-title">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="webhook-card-title" className="font-semibold text-zinc-900">
            Bounce & complaint tracking
          </h2>
          <p className="text-sm text-zinc-500">
            Your provider tells Klyve when an email bounces or is marked as spam, and Klyve stops emailing that
            address. This protects your sender reputation.
          </p>
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-6 px-5 py-5">{children}</div>
    </section>
  );
}

function SmtpNote() {
  return (
    <Shell>
      <div className="flex gap-3 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-700">
        <Info className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="flex flex-col gap-2">
          <p>
            Gmail and other SMTP servers can&apos;t report bounces to Klyve automatically. Bounce messages
            (“Delivery Status Notification”, “Undeliverable”) arrive in your own inbox instead. A suppression list
            coming soon will let you add those addresses so Klyve skips them.
          </p>
          <p>
            For automatic bounce and spam-complaint handling, send through an API provider such as Amazon SES,
            Resend, SendGrid, Mailgun or Postmark.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function ApiWebhookCard({
  providerId,
  type,
  settings,
}: {
  providerId: string;
  type: WebhookProviderType;
  settings: WebhookSettings;
}) {
  const guide = WEBHOOK_GUIDES[type];
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<null | "regenerate" | "off">(null);

  function turnOn() {
    startTransition(async () => {
      const result = await enableWebhookAction(providerId);
      if (result.ok) toast.success("Webhook URL created. Now add it in your provider's dashboard.");
      else toast.error(result.error);
    });
  }

  if (!settings.enabled || !settings.url) {
    return (
      <Shell>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-600">
            Turn this on to get a private webhook URL for this provider. Setup takes about two minutes.
          </p>
          <Button
            type="button"
            onClick={turnOn}
            disabled={pending}
            className="self-start bg-emerald-600 text-white hover:bg-emerald-700 sm:self-auto"
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Power aria-hidden />}
            {pending ? "Turning on…" : "Turn on"}
          </Button>
        </div>
      </Shell>
    );
  }

  const needsSecretWarning = guide.supportsSignature && type !== "AMAZON_SES" && !settings.secretSet;

  return (
    <Shell action={<WebhookStatus lastWebhookAt={settings.lastWebhookAt} />}>
      {settings.secretUnreadable && (
        <p role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            We couldn&apos;t read the saved signing secret (the encryption key may have changed), so incoming events
            are being refused. Please enter it again below.
          </span>
        </p>
      )}
      {needsSecretWarning && !settings.secretUnreadable && (
        <p role="status" className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Add your signing secret for full protection.</strong> Until then, Klyve accepts events that use
            this secret URL without checking the provider&apos;s signature.
          </span>
        </p>
      )}

      <WebhookUrl url={settings.url} />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-zinc-900">Set it up</h3>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-zinc-700 marker:text-zinc-400">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Events to tick:</span>
          {guide.events.map((event) => (
            <span key={event} className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700">
              {event}
            </span>
          ))}
        </div>
        <a
          href={guide.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-emerald-700 hover:underline"
        >
          {guide.docsLabel}
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>

      <WebhookSecretForm providerId={providerId} type={type} settings={settings} />

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("regenerate")} disabled={pending}>
          <RefreshCw aria-hidden />
          Regenerate URL
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm("off")} disabled={pending}>
          <Power aria-hidden />
          Turn off
        </Button>
      </div>

      <ConfirmDialog providerId={providerId} kind={confirm} onClose={() => setConfirm(null)} isSes={type === "AMAZON_SES"} />
    </Shell>
  );
}

function WebhookStatus({ lastWebhookAt }: { lastWebhookAt: string | null }) {
  if (!lastWebhookAt) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-zinc-500">
        <CircleDashed className="size-4" aria-hidden />
        Waiting for the first event
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-emerald-700">
      <CircleCheck className="size-4" aria-hidden />
      <span>
        Last event received <RelativeTime iso={lastWebhookAt} />
      </span>
    </span>
  );
}

function WebhookUrl({ url }: { url: string }) {
  function copy() {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Webhook URL copied."),
      () => toast.error("Couldn't copy. Select the text and copy it instead."),
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="webhook-url" className="text-sm font-medium text-zinc-900">
        Webhook URL
      </label>
      <div className="flex gap-2">
        <Input
          id="webhook-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-xs"
          aria-describedby="webhook-url-help"
        />
        <Button type="button" variant="outline" onClick={copy}>
          <Copy aria-hidden />
          Copy
        </Button>
      </div>
      <p id="webhook-url-help" className="text-xs text-zinc-500">
        Keep it private: it works like a password for this provider&apos;s events.
      </p>
    </div>
  );
}

function ConfirmDialog({
  providerId,
  kind,
  onClose,
  isSes,
}: {
  providerId: string;
  kind: null | "regenerate" | "off";
  onClose: () => void;
  isSes: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run() {
    if (!kind) return;
    startTransition(async () => {
      const result =
        kind === "regenerate" ? await regenerateWebhookAction(providerId) : await disableWebhookAction(providerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        kind === "regenerate" ? "New URL created. Update it in your provider's dashboard." : "Bounce tracking turned off.",
      );
      onClose();
    });
  }

  return (
    <AlertDialog open={kind !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{kind === "off" ? "Turn off bounce tracking?" : "Regenerate the webhook URL?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "off"
              ? "The webhook URL stops working and the saved signing secret is deleted. Bounces and complaints will no longer update your contacts."
              : `The current URL stops working immediately. Paste the new one into your provider's dashboard${
                  isSes ? " (create a new SNS subscription)" : ""
                }, or events will be lost.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={run}
            disabled={pending}
            className={kind === "off" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {kind === "off" ? "Turn off" : "Regenerate URL"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
