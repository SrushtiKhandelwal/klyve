"use client";

import { useState, useTransition } from "react";
import { ImageIcon, InfoIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { saveBrandKit } from "@/app/actions/brand";
import { MediaPicker } from "@/components/media/media-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BrandKitFieldErrors } from "@/lib/brand-kit";
import { DEFAULT_THEME, FONT_STACKS, SOCIAL_NETWORKS } from "@/lib/templates/document";
import { BrandPreview } from "./brand-preview";
import { SOCIAL_NETWORK_LABELS, SOCIAL_PLACEHOLDERS, type BrandFormValues } from "./brand-values";
import { ColorField } from "./color-field";

type Limits = { companyName: number; address: number; url: number };

const COLOR_FIELDS = [
  { key: "primaryColor", label: "Primary", hint: "Buttons and links." },
  { key: "secondaryColor", label: "Secondary", hint: "Headings." },
  { key: "backgroundColor", label: "Background", hint: "Around the email." },
  { key: "textColor", label: "Text", hint: "Body text." },
] as const;

/** Settings → Brand: edit the brand kit with a live preview beside it. */
export function BrandKitForm({
  initial,
  canManage,
  limits,
}: {
  initial: BrandFormValues;
  canManage: boolean;
  limits: Limits;
}) {
  const [values, setValues] = useState<BrandFormValues>(initial);
  const [errors, setErrors] = useState<BrandKitFieldErrors>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const disabled = !canManage || saving;

  const set = <K extends keyof BrandFormValues>(key: K, value: BrandFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const fieldError = (key: string) => errors[key]?.[0];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveBrandKit(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success("Brand kit saved. New templates will use it.");
    });
  }

  const fontItems = FONT_STACKS.map((f) => ({ value: f.value, label: f.label }));

  return (
    <>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          {!canManage && (
            <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <InfoIcon className="mt-0.5 size-4 shrink-0" />
              Only workspace owners and admins can change the brand kit.
            </p>
          )}

          {/* ── Logo & name ─────────────────────────────────────────── */}
          <Card title="Logo and name">
            <div className="grid gap-2">
              <Label>Logo</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg border bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:16px_16px] sm:w-40">
                  {values.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={values.logoUrl} alt="Your logo" className="max-h-16 max-w-[90%] object-contain" />
                  ) : (
                    <ImageIcon className="size-6 text-zinc-300" aria-label="No logo yet" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} disabled={disabled}>
                    <ImageIcon />
                    {values.logoUrl ? "Change logo" : "Upload or choose logo"}
                  </Button>
                  {values.logoUrl && (
                    <Button type="button" variant="ghost" onClick={() => set("logoUrl", "")} disabled={disabled}>
                      <XIcon />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                A PNG with a transparent background works best, around 300 px wide.
              </p>
              {fieldError("logoUrl") && <p className="text-xs text-red-600">{fieldError("logoUrl")}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="brand-company">Company name</Label>
              <Input
                id="brand-company"
                value={values.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="Acme Inc."
                maxLength={limits.companyName}
                disabled={disabled}
                aria-invalid={fieldError("companyName") ? true : undefined}
              />
              {fieldError("companyName") && <p className="text-xs text-red-600">{fieldError("companyName")}</p>}
            </div>
          </Card>

          {/* ── Colours & font ──────────────────────────────────────── */}
          <Card title="Colours and font">
            <div className="grid gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => (
                <ColorField
                  key={field.key}
                  id={`brand-${field.key}`}
                  label={field.label}
                  hint={field.hint}
                  value={values[field.key]}
                  onChange={(v) => set(field.key, v)}
                  error={fieldError(field.key)}
                  disabled={disabled}
                />
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  setValues((v) => ({
                    ...v,
                    primaryColor: DEFAULT_THEME.primaryColor,
                    secondaryColor: DEFAULT_THEME.secondaryColor,
                    backgroundColor: DEFAULT_THEME.backgroundColor,
                    textColor: DEFAULT_THEME.textColor,
                  }))
                }
              >
                <RotateCcwIcon />
                Reset colours
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="brand-font">Font</Label>
              <Select
                items={fontItems}
                value={values.fontFamily}
                onValueChange={(v) => v && set("fontFamily", String(v))}
                disabled={disabled}
              >
                <SelectTrigger id="brand-font" className="w-full sm:w-64" style={{ fontFamily: values.fontFamily }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fontItems.map((f) => (
                    <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                Only fonts that every email app has. Custom web fonts don&apos;t show up in many inboxes.
              </p>
            </div>
          </Card>

          {/* ── Footer details ──────────────────────────────────────── */}
          <Card title="Footer details">
            <div className="grid gap-1.5">
              <Label htmlFor="brand-address">Postal address</Label>
              <Textarea
                id="brand-address"
                value={values.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder={"Acme Inc.\n123 Main Street\nSpringfield, 12345, USA"}
                rows={3}
                maxLength={limits.address}
                disabled={disabled}
                aria-describedby="brand-address-hint"
                aria-invalid={fieldError("address") ? true : undefined}
              />
              <p id="brand-address-hint" className="text-xs text-zinc-500">
                Required by anti-spam laws in many countries; shown in your email footers.{" "}
                <span className="text-zinc-400">
                  {values.address.length}/{limits.address}
                </span>
              </p>
              {fieldError("address") && <p className="text-xs text-red-600">{fieldError("address")}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="brand-website">Website</Label>
              <Input
                id="brand-website"
                type="url"
                inputMode="url"
                value={values.websiteUrl}
                onChange={(e) => set("websiteUrl", e.target.value)}
                placeholder="https://yourcompany.com"
                maxLength={limits.url}
                disabled={disabled}
                aria-invalid={fieldError("websiteUrl") ? true : undefined}
              />
              {fieldError("websiteUrl") && <p className="text-xs text-red-600">{fieldError("websiteUrl")}</p>}
            </div>
          </Card>

          {/* ── Social links ────────────────────────────────────────── */}
          <Card title="Social links" description="Used by the Social block. Leave empty the ones you don't use.">
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_NETWORKS.map((network) => {
                const error = fieldError(`socialLinks.${network}`);
                return (
                  <div key={network} className="grid gap-1.5">
                    <Label htmlFor={`brand-social-${network}`}>{SOCIAL_NETWORK_LABELS[network]}</Label>
                    <Input
                      id={`brand-social-${network}`}
                      type="url"
                      inputMode="url"
                      value={values.socialLinks[network]}
                      onChange={(e) => set("socialLinks", { ...values.socialLinks, [network]: e.target.value })}
                      placeholder={SOCIAL_PLACEHOLDERS[network]}
                      maxLength={limits.url}
                      disabled={disabled}
                      aria-invalid={error ? true : undefined}
                    />
                    {error && <p className="text-xs text-red-600">{error}</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ── Preview + save (sticks beside the form on big screens) ── */}
        <aside className="grid gap-4 lg:sticky lg:top-6">
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
            <BrandPreview values={values} />
          </div>
          <p className="flex gap-2 rounded-lg border bg-white p-3 text-xs text-zinc-600">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            New templates and starter templates use these settings. Templates you already made don&apos;t change.
          </p>
          {canManage && (
            <Button type="submit" size="lg" disabled={saving} className="w-full">
              {saving && <Loader2Icon className="animate-spin" />}
              Save brand kit
            </Button>
          )}
        </aside>
      </form>

      {/* Outside the <form> so nothing in the dialog can submit it by accident. */}
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Choose your logo"
        onSelect={(asset) => set("logoUrl", asset.url)}
      />
    </>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-white p-5">
      <div className="grid gap-0.5">
        <h2 className="font-semibold text-zinc-900">{title}</h2>
        {description && <p className="text-sm text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}
