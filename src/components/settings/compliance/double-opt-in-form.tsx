"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Switch } from "@base-ui/react/switch";
import { InfoIcon, Loader2Icon, MailCheckIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { saveOptInSettings, sendOptInTest } from "@/app/actions/optin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defaultOptInMessage, renderOptInEmail, type OptInEmailBrand } from "@/lib/optin/email";
import { cn } from "@/lib/utils";

type Values = { enabled: boolean; senderId: string; subject: string; message: string };

/**
 * Settings → Compliance: the double opt-in switch and the confirmation
 * email (sender, subject, message), with a live preview and a test send.
 */
export function DoubleOptInForm({
  initial,
  senders,
  brand,
  previewLinkUrl,
  canManage,
  userEmail,
  limits,
}: {
  initial: Values;
  senders: { id: string; label: string }[];
  brand: OptInEmailBrand;
  /** Where the preview's button points (a demo page that changes nothing). */
  previewLinkUrl: string;
  canManage: boolean;
  userEmail: string;
  limits: { subject: number; message: number };
}) {
  const [values, setValues] = useState<Values>(initial);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();
  const disabled = !canManage || saving;
  const ids = { subject: useId(), message: useId(), sender: useId(), toggle: useId() };

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  // The same function the server uses to build the real email, so the
  // preview is exactly what people will get (with a sample link).
  const preview = useMemo(
    () =>
      renderOptInEmail({
        subject: values.subject,
        // An empty message is saved as "use our wording", so preview that.
        message: values.message.trim() || defaultOptInMessage(brand.companyName),
        confirmUrl: previewLinkUrl,
        brand,
      }),
    [values.subject, values.message, previewLinkUrl, brand],
  );

  function save(event: React.FormEvent) {
    event.preventDefault();
    startSaving(async () => {
      try {
        const result = await saveOptInSettings({ ...values, senderId: values.senderId || null });
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  function sendTest() {
    if (!values.senderId) {
      toast.error("Choose a sender first.");
      return;
    }
    startTesting(async () => {
      try {
        const result = await sendOptInTest({ senderId: values.senderId, subject: values.subject, message: values.message });
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  const senderItems = senders.map((s) => ({ value: s.id, label: s.label }));

  return (
    <form onSubmit={save} className="grid gap-6">
      {!canManage && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Only workspace owners and admins can change these settings.
        </p>
      )}

      {/* ── The switch ─────────────────────────────────────────── */}
      <section className="grid gap-4 rounded-xl border bg-white p-5">
        <label className={cn("flex items-start gap-3", canManage && "cursor-pointer")}>
          <MailCheckIcon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <span className="block min-w-0 flex-1">
            <span id={`${ids.toggle}-title`} className="block font-semibold text-zinc-900">
              Double opt-in
            </span>
            <span id={`${ids.toggle}-text`} className="mt-0.5 block text-sm text-zinc-500">
              New subscribers get an email asking them to confirm. They only receive your campaigns after they click
              &ldquo;Yes, subscribe me&rdquo;.
            </span>
          </span>
          {/* Base UI's Switch: a real role="switch" control (Space toggles it). */}
          <Switch.Root
            checked={values.enabled}
            onCheckedChange={(checked) => set("enabled", checked)}
            disabled={disabled}
            aria-labelledby={`${ids.toggle}-title`}
            aria-describedby={`${ids.toggle}-text`}
            className={cn(
              "relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
              "bg-zinc-300 focus-visible:ring-3 focus-visible:ring-emerald-500/40 data-checked:bg-emerald-600 data-disabled:cursor-not-allowed data-disabled:opacity-60",
            )}
          >
            <Switch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-4" />
          </Switch.Root>
        </label>

        <ul className="grid gap-2 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
          <li>
            <strong className="font-medium text-zinc-900">Applies to</strong> people who sign up themselves through
            your sign-up forms or the API.
          </li>
          <li>
            <strong className="font-medium text-zinc-900">Doesn&apos;t apply to</strong> contacts you add or import
            yourself: when importing, you confirm you already have their consent.
          </li>
          <li>
            <strong className="font-medium text-zinc-900">Why turn it on?</strong> It stops fake or mistyped
            addresses, keeps your bounce rate low and gives the strongest proof of consent (required in practice in
            Germany and recommended under GDPR).
          </li>
        </ul>

        {values.enabled && !values.senderId && (
          <p className="flex gap-2 text-sm text-amber-800">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            Choose a sender below, or nobody will be able to confirm.
          </p>
        )}
      </section>

      {/* ── The confirmation email ─────────────────────────────── */}
      <section className="grid gap-5 rounded-xl border bg-white p-5">
        <div className="grid gap-0.5">
          <h2 className="font-semibold text-zinc-900">Confirmation email</h2>
          <p className="text-sm text-zinc-500">
            The button, a backup link and an &ldquo;ignore this email if you didn&apos;t sign up&rdquo; line are always
            added for you.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="grid min-w-0 content-start gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.sender}>From</Label>
              {senders.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-zinc-600">
                  You don&apos;t have a verified sender yet.{" "}
                  <Link href="/settings/senders" className="font-medium text-emerald-700 hover:underline">
                    Add and verify one in Settings → Senders
                  </Link>
                  .
                </p>
              ) : (
                <Select
                  items={senderItems}
                  value={values.senderId || null}
                  onValueChange={(v) => set("senderId", v ? String(v) : "")}
                  disabled={disabled}
                >
                  <SelectTrigger id={ids.sender} className="w-full">
                    <SelectValue placeholder="Choose a verified sender" />
                  </SelectTrigger>
                  <SelectContent>
                    {senderItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={ids.subject}>Subject</Label>
              <Input
                id={ids.subject}
                value={values.subject}
                onChange={(e) => set("subject", e.target.value)}
                maxLength={limits.subject}
                disabled={disabled}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={ids.message}>Message</Label>
              <Textarea
                id={ids.message}
                value={values.message}
                onChange={(e) => set("message", e.target.value)}
                rows={6}
                maxLength={limits.message}
                disabled={disabled}
                aria-describedby={`${ids.message}-hint`}
              />
              <p id={`${ids.message}-hint`} className="text-xs text-zinc-500">
                Plain text. Leave a blank line to start a new paragraph. Clear a field to go back to our wording.{" "}
                <span className="text-zinc-400">
                  {values.message.length}/{limits.message}
                </span>
              </p>
            </div>

            {canManage && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2Icon className="animate-spin" aria-hidden />}
                  Save settings
                </Button>
                <Button type="button" variant="outline" disabled={testing || senders.length === 0} onClick={sendTest}>
                  {testing ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
                  Send me a test
                </Button>
              </div>
            )}
            {canManage && (
              <p className="text-xs text-zinc-500">
                The test goes to {userEmail}. Its link only opens a demo page; nobody is subscribed.
              </p>
            )}
          </div>

          {/* ── Preview ── */}
          <div className="grid min-w-0 content-start gap-2">
            <h3 className="text-sm font-semibold text-zinc-900">Preview</h3>
            <div className="overflow-hidden rounded-lg border bg-zinc-50">
              <p className="truncate border-b bg-white px-3 py-2 text-xs text-zinc-600">
                <span className="text-zinc-400">Subject: </span>
                {preview.subject}
              </p>
              {/* sandbox="" = no scripts, no forms, links can't navigate this page. */}
              <iframe
                title="Confirmation email preview"
                srcDoc={preview.html}
                sandbox=""
                className="block h-[26rem] w-full bg-white"
              />
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}
