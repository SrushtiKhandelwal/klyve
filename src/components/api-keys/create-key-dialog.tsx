"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { KeyRoundIcon, Loader2, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { createApiKeyAction } from "@/app/actions/api-keys";
import { CodeBlock, CopyIconButton } from "@/components/transactional/code";
import { sendEmailSnippet } from "@/components/transactional/snippets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// "Create API key": ask for a name, then show the new key ONCE.
//
// The full key only ever lives in this component's state. Closing the dialog
// forgets it, and the server only stored a hash, so there's no way to show it
// again: that's why the warning is loud and the copy button is right there.

const NAME_MAX = 60;

export function CreateKeyDialog({
  disabled,
  exampleFrom,
  exampleTo,
}: {
  /** e.g. the key limit is reached. */
  disabled?: boolean;
  /** A verified sender ("Shop <hello@shop.com>"), so the curl example is ready to run. */
  exampleFrom: string | null;
  /** The logged-in user's own address. */
  exampleTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setError(null);
    setCreated(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await createApiKeyAction(name);
        if (result.ok) setCreated({ key: result.key, name: name.trim() });
        else setError(result.error);
      } catch {
        setError("Couldn't reach the server. Please try again.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        // Opening starts fresh; closing forgets the key for good.
        reset();
      }}
      // While the key is on screen, a stray click outside shouldn't lose it.
      disablePointerDismissal={created !== null}
    >
      <DialogTrigger render={<Button disabled={disabled} />}>
        <PlusIcon aria-hidden />
        Create API key
      </DialogTrigger>

      {/* grid-cols-1 (= minmax(0, 1fr)) stops wide content, like the long curl
          line below, from stretching the dialog: it scrolls inside its own box. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-xl">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
              <DialogDescription>
                Name it after where you&apos;ll use it, like &quot;Shop backend&quot;, so you know which key to revoke if
                you ever need to.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="api-key-name">Key name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={NAME_MAX}
                  placeholder="Production server"
                  autoComplete="off"
                  autoFocus
                  disabled={pending}
                  aria-invalid={error ? true : undefined}
                />
              </div>
              {error && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !name.trim()}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRoundIcon aria-hidden />}
                  Create key
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Your new API key</DialogTitle>
              <DialogDescription>
                &quot;{created.name}&quot; is ready. Save it in your app&apos;s environment, e.g. as{" "}
                <code className="font-mono text-zinc-700">KLYVE_API_KEY</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-zinc-950 py-2 pr-2 pl-4">
                <code className="min-w-0 flex-1 font-mono text-sm break-all text-emerald-300" aria-label="Your API key">
                  {created.key}
                </code>
                <CopyIconButton text={created.key} what="API key" />
              </div>
              <div role="alert" className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <p>
                  <strong className="font-semibold">Copy it now. For your safety we can&apos;t show it again.</strong> If you
                  lose it, create a new key and revoke this one.
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-medium text-zinc-900">Try it: send yourself an email</p>
              <CodeBlock
                title="Terminal"
                what="Command"
                code={sendEmailSnippet("curl", { apiKey: created.key, from: exampleFrom ?? undefined, to: exampleTo })}
              />
              <p className="text-xs text-zinc-500">
                {exampleFrom
                  ? "It sends from your first verified sender to your own address. "
                  : "Change \"from\" to one of your verified senders first. "}
                More languages in the{" "}
                <Link href="/docs/api#quick-start" target="_blank" className="font-medium text-emerald-700 underline underline-offset-2">
                  API docs
                </Link>
                .
              </p>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                I&apos;ve saved my key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
