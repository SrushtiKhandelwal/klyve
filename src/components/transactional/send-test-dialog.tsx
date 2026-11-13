"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, Loader2, SendIcon, TriangleAlertIcon } from "lucide-react";
import { sendTestEmailAction, type TestSendResult } from "@/app/actions/transactional";
import { TRANSACTIONAL_STATUS_META } from "@/components/transactional/status";
import { TransactionalStatusBadge } from "@/components/transactional/status-badge";
import type { TestSendOptions } from "@/components/transactional/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// "Send a test email": sends one transactional email from the dashboard,
// exactly as the API would (same checks, same logs), so people can see the
// whole flow work before writing any code.

type Mode = "html" | "text" | "template";

const MODES: { id: Mode; label: string }[] = [
  { id: "html", label: "HTML" },
  { id: "text", label: "Plain text" },
  { id: "template", label: "Template" },
];

const SAMPLE_HTML = '<h1>It works!</h1>\n<p>Hi {{ contact.EMAIL }}, this test was sent with Klyve.</p>';

export function SendTestDialog({ options, variant = "default" }: { options: TestSendOptions; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [senderId, setSenderId] = useState(options.senders[0]?.id ?? "");
  const [to, setTo] = useState(options.defaultTo);
  const [subject, setSubject] = useState("Test email from Klyve");
  const [mode, setMode] = useState<Mode>("html");
  const [body, setBody] = useState(SAMPLE_HTML);
  const [templateId, setTemplateId] = useState(options.templates[0]?.id ?? "");
  const [params, setParams] = useState('{\n  "name": "Anita"\n}');

  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [result, setResult] = useState<Extract<TestSendResult, { ok: true }> | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendTestEmailAction({ senderId, to, subject, mode, body, templateId, params });
        if (res.ok) setResult(res);
        else setError({ message: res.error, field: res.field });
      } catch {
        setError({ message: "Couldn't reach the server. Please try again." });
      }
    });
  }

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      // Show the new email in the list (and the stats) once the dialog is gone.
      if (result) router.refresh();
      setResult(null);
      setError(null);
    }
  }

  const senderItems = options.senders.map((s) => ({ value: s.id, label: s.label }));
  const templateItems = options.templates.map((t) => ({ value: t.id, label: t.name }));
  const invalid = (field: string) => (error?.field === field ? true : undefined);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant={variant} />}>
        <SendIcon aria-hidden />
        Send a test email
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            It goes through the same steps as an API call and shows up in your logs, so you can see the whole flow work.
          </DialogDescription>
        </DialogHeader>

        {options.senders.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You need a verified sender first: the address your emails come from.{" "}
            <Link href="/settings/senders" className="font-medium underline underline-offset-2">
              Add a sender
            </Link>
          </div>
        ) : result ? (
          <TestResult result={result} onAgain={() => setResult(null)} />
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="test-sender">From</Label>
              <Select items={senderItems} value={senderId} onValueChange={(v) => setSenderId(String(v ?? ""))}>
                <SelectTrigger id="test-sender" className="w-full" aria-invalid={invalid("senderId")}>
                  <SelectValue placeholder="Choose a sender" />
                </SelectTrigger>
                <SelectContent>
                  {senderItems.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="test-to">To</Label>
              <Input
                id="test-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                maxLength={254}
                autoComplete="email"
                aria-invalid={invalid("to")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900" id="test-mode-label">
                Content
              </span>
              <div role="radiogroup" aria-labelledby="test-mode-label" className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() => {
                      // Swap the sample so it matches the format.
                      if (m.id === "text" && body === SAMPLE_HTML) setBody("It works! This test was sent with Klyve.");
                      if (m.id === "html" && !body.trim()) setBody(SAMPLE_HTML);
                      setMode(m.id);
                      setError(null);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none",
                      mode === m.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="test-subject">
                Subject {mode === "template" && <span className="font-normal text-zinc-400">(optional: the template&apos;s subject is used)</span>}
              </Label>
              <Input
                id="test-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                aria-invalid={invalid("subject")}
              />
            </div>

            {mode === "template" ? (
              options.templates.length === 0 ? (
                <p className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">
                  You don&apos;t have any templates yet.{" "}
                  <Link href="/templates" className="font-medium text-emerald-700 underline underline-offset-2">
                    Create one
                  </Link>{" "}
                  or write the email as HTML.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="test-template">Template</Label>
                    <Select items={templateItems} value={templateId} onValueChange={(v) => setTemplateId(String(v ?? ""))}>
                      <SelectTrigger id="test-template" className="w-full" aria-invalid={invalid("templateId")}>
                        <SelectValue placeholder="Choose a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templateItems.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="test-params">
                      Params <span className="font-normal text-zinc-400">(JSON, optional)</span>
                    </Label>
                    <Textarea
                      id="test-params"
                      value={params}
                      onChange={(e) => setParams(e.target.value)}
                      rows={4}
                      spellCheck={false}
                      className="font-mono text-xs"
                      aria-invalid={invalid("params")}
                      aria-describedby="test-params-help"
                    />
                    <p id="test-params-help" className="text-xs text-zinc-500">
                      Fills <code className="font-mono">{"{{ params.name }}"}</code>-style tags in the template.
                    </p>
                  </div>
                </>
              )
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="test-body">{mode === "html" ? "HTML" : "Message"}</Label>
                <Textarea
                  id="test-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  spellCheck={mode === "text"}
                  className={mode === "html" ? "font-mono text-xs" : undefined}
                  aria-invalid={invalid("body")}
                />
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error.message}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={pending || !to.trim() || !senderId || (mode === "template" && (!templateId || options.templates.length === 0))}
              >
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
                Send test
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TestResult({ result, onAgain }: { result: Extract<TestSendResult, { ok: true }>; onAgain: () => void }) {
  const suppressed = result.status === "SUPPRESSED";
  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex gap-3 rounded-xl border p-4 text-sm",
          suppressed ? "border-violet-200 bg-violet-50/70 text-violet-950" : "border-emerald-200 bg-emerald-50/70 text-emerald-950",
        )}
      >
        {suppressed ? (
          <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-violet-600" aria-hidden />
        ) : (
          <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        )}
        <div className="grid gap-1.5">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {suppressed ? "Accepted, but not sent" : "Test email accepted"}
            <TransactionalStatusBadge status={result.status} />
          </p>
          <p>{result.error ?? TRANSACTIONAL_STATUS_META[result.status].meaning}</p>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onAgain}>
          Send another
        </Button>
        <Link href={`/transactional/${result.id}`} className={buttonVariants()}>
          View email
          <ArrowRightIcon aria-hidden />
        </Link>
      </DialogFooter>
    </div>
  );
}
