"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { generateCampaignAction } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AI_INPUT_LIMITS, AI_LANGUAGES, AI_TONES, type AiLanguage, type AiTone } from "@/lib/ai/inputs";
import { isHttpUrl } from "@/lib/ai/safety";
import { AiErrorText, AiNotSetUp, ChoiceGroup, OFFLINE_MESSAGE } from "./ai-bits";
import { useAiConfigured } from "./use-ai-status";

// "Generate campaign with AI" on the Campaigns page, next to "Create campaign".
//
// The user says what the email is about (plus tone, language and an optional
// button); the AI writes the words, we build the design in the workspace's
// brand and save it as a DRAFT. Then the editor opens so they can check and
// change everything before sending. Nothing is ever sent from here.

export function GenerateCampaignButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState("");
  const [tone, setTone] = useState<AiTone>("friendly");
  const [language, setLanguage] = useState<AiLanguage>("en");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const configured = useAiConfigured(open);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (about.trim().length < AI_INPUT_LIMITS.aboutMin) {
      setError("Tell the AI what the email is about (a few words at least).");
      return;
    }
    if (buttonUrl.trim() && !isHttpUrl(buttonUrl)) {
      setUrlError("Use a full web address starting with https://");
      return;
    }
    startTransition(async () => {
      try {
        const result = await generateCampaignAction({ about, tone, language, buttonText, buttonUrl: buttonUrl.trim() });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/campaigns/${result.id}/design`);
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't close halfway through: the campaign is being created.
        if (pending) return;
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Sparkles className="text-emerald-600" aria-hidden />
        Generate with AI
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-600" aria-hidden />
            Generate a campaign with AI
          </DialogTitle>
          <DialogDescription>
            AI writes a first draft in your brand&apos;s colours. You can change everything before it&apos;s sent.
          </DialogDescription>
        </DialogHeader>

        {configured === false ? (
          <AiNotSetUp />
        ) : (
          <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-about">What is this email about?</Label>
              <Textarea
                id="ai-about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={AI_INPUT_LIMITS.aboutMax}
                rows={3}
                placeholder="e.g. Diwali offer, 20% off masala chai this week"
                disabled={pending}
                autoFocus
                required
              />
              <p className="text-xs text-zinc-500">Mention the offer, dates or codes you want in it: AI won&apos;t make them up.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Tone</span>
              <ChoiceGroup label="Tone" value={tone} options={AI_TONES} onChange={setTone} disabled={pending} />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Language</span>
              <ChoiceGroup label="Language" value={language} options={AI_LANGUAGES} onChange={setLanguage} disabled={pending} />
            </div>

            <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium text-zinc-900">Button (optional)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-button-text" className="text-xs text-zinc-600">
                    Button text
                  </Label>
                  <Input
                    id="ai-button-text"
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    maxLength={AI_INPUT_LIMITS.buttonTextMax}
                    placeholder="Shop now"
                    disabled={pending}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-button-url" className="text-xs text-zinc-600">
                    Button link
                  </Label>
                  <Input
                    id="ai-button-url"
                    type="url"
                    inputMode="url"
                    value={buttonUrl}
                    onChange={(e) => {
                      setButtonUrl(e.target.value);
                      setUrlError(null);
                    }}
                    maxLength={AI_INPUT_LIMITS.urlMax}
                    placeholder="https://yourshop.com/offer"
                    disabled={pending}
                    aria-invalid={urlError ? true : undefined}
                    aria-describedby="ai-button-hint"
                  />
                </div>
              </div>
              <p id="ai-button-hint" className={urlError ? "text-xs text-red-600" : "text-xs text-zinc-500"}>
                {urlError ?? "A button is only added when you give a link. AI never adds links of its own."}
              </p>
            </fieldset>

            <AiErrorText message={error} />

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || configured === null}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {pending ? "Writing your email…" : "Generate draft"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
