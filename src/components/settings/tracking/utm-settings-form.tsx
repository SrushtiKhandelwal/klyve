"use client";

import { useId, useState, useTransition } from "react";
import { Switch } from "@base-ui/react/switch";
import { InfoIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { saveUtmSettings } from "@/app/actions/tracking-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addUtmToUrl, UTM_VALUE_MAX, utmCampaignSlug, utmValueProblem, type UtmSettings } from "@/lib/tracking/utm";
import { cn } from "@/lib/utils";

const EXAMPLE_LINK = "https://www.example.com/sale";

/**
 * Settings → Link tracking: the "Add UTM tags to links" switch, the
 * utm_source / utm_medium boxes and a live example of a finished link.
 */
export function UtmSettingsForm({ initial, canManage }: { initial: UtmSettings; canManage: boolean }) {
  const [values, setValues] = useState<UtmSettings>(initial);
  const [exampleName, setExampleName] = useState("Diwali Offer 2026");
  const [saving, startSaving] = useTransition();
  const disabled = !canManage || saving;
  const ids = { toggle: useId(), source: useId(), medium: useId(), example: useId() };

  const sourceProblem = utmValueProblem("source", values.source.trim());
  const mediumProblem = utmValueProblem("medium", values.medium.trim());
  const slug = utmCampaignSlug(exampleName);
  // The same function the server uses, so the example is exactly what emails get.
  const exampleUrl = addUtmToUrl(EXAMPLE_LINK, {
    source: sourceProblem ? "(source)" : values.source.trim(),
    medium: mediumProblem ? "(medium)" : values.medium.trim(),
    campaign: slug,
  });

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (sourceProblem || mediumProblem) {
      toast.error(sourceProblem ?? mediumProblem);
      return;
    }
    startSaving(async () => {
      try {
        const result = await saveUtmSettings({ enabled: values.enabled, source: values.source.trim(), medium: values.medium.trim() });
        if (result.ok) toast.success(result.message);
        else toast.error(result.error);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={save} className="grid gap-6">
      {!canManage && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Only workspace owners and admins can change these settings.
        </p>
      )}

      <section className="grid gap-4 rounded-xl border bg-white p-5">
        <label className={cn("flex items-start gap-3", canManage && "cursor-pointer")}>
          <span className="block min-w-0 flex-1">
            <span id={`${ids.toggle}-title`} className="block font-semibold text-zinc-900">
              Add UTM tags to links
            </span>
            <span id={`${ids.toggle}-text`} className="mt-0.5 block text-sm text-zinc-500">
              Adds utm_source, utm_medium and utm_campaign to the web links in your campaigns and automation emails,
              so tools like Google Analytics show which email brought each visitor.
            </span>
          </span>
          {/* Base UI's Switch: a real role="switch" control (Space toggles it). */}
          <Switch.Root
            checked={values.enabled}
            onCheckedChange={(checked) => setValues((v) => ({ ...v, enabled: checked }))}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={ids.source}>Source (utm_source)</Label>
            <Input
              id={ids.source}
              value={values.source}
              onChange={(e) => setValues((v) => ({ ...v, source: e.target.value }))}
              disabled={disabled}
              maxLength={UTM_VALUE_MAX}
              aria-invalid={!!sourceProblem}
              aria-describedby={`${ids.source}-hint`}
              autoComplete="off"
              spellCheck={false}
            />
            <p id={`${ids.source}-hint`} className={cn("text-xs", sourceProblem ? "text-red-600" : "text-zinc-500")}>
              {sourceProblem ?? "Where the visitor came from, e.g. klyve or newsletter."}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.medium}>Medium (utm_medium)</Label>
            <Input
              id={ids.medium}
              value={values.medium}
              onChange={(e) => setValues((v) => ({ ...v, medium: e.target.value }))}
              disabled={disabled}
              maxLength={UTM_VALUE_MAX}
              aria-invalid={!!mediumProblem}
              aria-describedby={`${ids.medium}-hint`}
              autoComplete="off"
              spellCheck={false}
            />
            <p id={`${ids.medium}-hint`} className={cn("text-xs", mediumProblem ? "text-red-600" : "text-zinc-500")}>
              {mediumProblem ?? "The kind of channel. Almost always email."}
            </p>
          </div>
        </div>

        <div className="grid gap-1 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
          <p>
            <strong className="font-medium text-zinc-900">Campaign (utm_campaign)</strong> is filled in for you: it is
            the campaign&apos;s name made URL-friendly, so &ldquo;Diwali Offer 2026&rdquo; becomes{" "}
            <code className="rounded bg-white px-1 font-mono text-xs text-zinc-800">diwali-offer-2026</code>. For
            automation emails it is the automation&apos;s name and the email&apos;s name.
          </p>
          <p className="mt-1">
            Letters, numbers, dashes, underscores and dots only (up to {UTM_VALUE_MAX} characters). Links that already
            have their own utm_ values keep them. Links to unsubscribe and &ldquo;view online&rdquo; pages, email and
            phone links, and links marked as not tracked are left alone.
          </p>
        </div>
      </section>

      <section aria-labelledby={`${ids.example}-title`} className="grid gap-3 rounded-xl border bg-white p-5">
        <div className="grid gap-0.5">
          <h2 id={`${ids.example}-title`} className="font-semibold text-zinc-900">
            Example
          </h2>
          <p className="text-sm text-zinc-500">Type a campaign name to see what a link in that email would become.</p>
        </div>
        <div className="grid gap-1.5 sm:max-w-sm">
          <Label htmlFor={ids.example}>Campaign name</Label>
          <Input id={ids.example} value={exampleName} onChange={(e) => setExampleName(e.target.value)} maxLength={100} />
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="grid gap-0.5">
            <dt className="text-xs font-medium text-zinc-500">Link in your email</dt>
            <dd className="font-mono text-xs break-all text-zinc-700">{EXAMPLE_LINK}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs font-medium text-zinc-500">
              {values.enabled ? "What people get" : "What people would get (UTM tags are off)"}
            </dt>
            <dd className={cn("font-mono text-xs break-all", values.enabled ? "text-emerald-800" : "text-zinc-500")} aria-live="polite">
              {exampleUrl}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-zinc-500">
          Changes apply to campaigns launched (and automations turned on) after you save. Emails already sent keep
          their links.
        </p>
      </section>

      {canManage && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2Icon className="animate-spin" aria-hidden />}
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
