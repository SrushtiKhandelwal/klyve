"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, DownloadIcon, Loader2, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/auth/form-field";
import { friendlyAuthError } from "@/components/auth/auth-errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";

// Two-step login (2FA) with an authenticator app.
//
// Turning it on, step by step:
//   1. "password": confirm your password (so someone at your unlocked computer can't do this).
//   2. "scan":     scan the QR code (or type the secret) in your authenticator app,
//                  then type the 6-digit code it shows. Only now is 2FA really on.
//   3. "codes":    save your backup codes. They're shown ONCE.
// Turning it off, and making new backup codes, also ask for the password.

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-1">
        <p className="font-medium text-zinc-900">
          Two-step login is{" "}
          <span className={enabled ? "text-emerald-700" : "text-zinc-500"}>{enabled ? "on" : "off"}</span>
        </p>
        <p className="max-w-xl text-sm text-zinc-500">
          {enabled
            ? "When you log in, we ask for a 6-digit code from your authenticator app after your password."
            : "Add a second step to logging in: a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Even someone who knows your password can't get in without it."}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {enabled ? (
          <>
            <NewBackupCodesDialog />
            <TurnOffDialog />
          </>
        ) : (
          <TurnOnDialog />
        )}
      </div>
    </div>
  );
}

// ─── Turn on ────────────────────────────────────────────────────────────────

type Setup = { totpURI: string; secret: string; backupCodes: string[] };

function TurnOnDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"password" | "scan" | "codes">("password");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep("password");
    setSetup(null);
    setError(null);
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (!password) return setError("Please enter your password.");
    startTransition(async () => {
      const { data, error: authError } = await authClient.twoFactor.enable({ password });
      if (authError || !data || !("totpURI" in data) || !data.totpURI) {
        return setError(authError ? friendlyAuthError(authError) : "Something went wrong. Please try again.");
      }
      const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
      setSetup({ totpURI: data.totpURI, secret, backupCodes: data.backupCodes ?? [] });
      setStep("scan");
    });
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return setError("Please enter the 6-digit code from your app.");
    startTransition(async () => {
      const { error: authError } = await authClient.twoFactor.verifyTotp({ code });
      if (authError) return setError(friendlyAuthError(authError));
      // 2FA is on now. Last step: the backup codes.
      setStep("codes");
    });
  }

  function finish() {
    setOpen(false);
    reset();
    toast.success("Two-step login is on.");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        // Closing on the last step still counts as done.
        if (!next && step === "codes") return finish();
        setOpen(next);
        if (next) reset();
      }}
      // Don't lose the QR code or the backup codes to a stray click outside.
      disablePointerDismissal={step !== "password"}
    >
      <DialogTrigger render={<Button />}>Turn on two-step login</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {step === "password" && (
          <>
            <DialogHeader>
              <DialogTitle>Turn on two-step login</DialogTitle>
              <DialogDescription>First, confirm it&apos;s you. You&apos;ll need your phone for the next step.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitPassword} noValidate className="grid gap-4">
              <FormField id="enable-2fa-password" name="password" label="Your password" type="password" autoComplete="current-password" autoFocus disabled={pending} />
              <ErrorBox error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  Continue
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "scan" && setup && (
          <>
            <DialogHeader>
              <DialogTitle>Scan this QR code</DialogTitle>
              <DialogDescription>
                Open your authenticator app, add an account, and scan the code. Then type the 6-digit code the app shows.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <QrCode value={setup.totpURI} />
              <div className="grid gap-1 text-center">
                <p className="text-xs text-zinc-500">Can&apos;t scan it? Type this key in the app instead:</p>
                <div className="flex items-center justify-center gap-1">
                  <code className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-sm break-all text-zinc-800">
                    {groupInFours(setup.secret)}
                  </code>
                  <CopyButton text={setup.secret} what="Key" />
                </div>
              </div>
            </div>
            <form onSubmit={submitCode} noValidate className="grid gap-4">
              <FormField
                id="enable-2fa-code"
                name="code"
                label="6-digit code from the app"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={7}
                autoFocus
                disabled={pending}
                className="h-10 font-mono tracking-[0.3em]"
              />
              <ErrorBox error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  Turn on
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "codes" && setup && (
          <>
            <DialogHeader>
              <DialogTitle>Save your backup codes</DialogTitle>
              <DialogDescription>
                Two-step login is on. If you lose your phone, each of these codes lets you log in once instead of the
                6-digit code.
              </DialogDescription>
            </DialogHeader>
            <BackupCodes codes={setup.backupCodes} />
            <DialogFooter>
              <Button type="button" onClick={finish}>
                I&apos;ve saved my codes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Turn off ───────────────────────────────────────────────────────────────

function TurnOffDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (!password) return setError("Please enter your password.");
    startTransition(async () => {
      const { error: authError } = await authClient.twoFactor.disable({ password });
      if (authError) return setError(friendlyAuthError(authError));
      setOpen(false);
      toast.success("Two-step login is off.");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="text-red-600 hover:text-red-700" />}>Turn off</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn off two-step login?</DialogTitle>
          <DialogDescription>
            Your password alone will be enough to log in again. Your backup codes and any trusted devices stop working.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <FormField id="disable-2fa-password" name="password" label="Your password" type="password" autoComplete="current-password" autoFocus disabled={pending} />
          <ErrorBox error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── New backup codes ───────────────────────────────────────────────────────

function NewBackupCodesDialog() {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (!password) return setError("Please enter your password.");
    startTransition(async () => {
      const { data, error: authError } = await authClient.twoFactor.generateBackupCodes({ password });
      if (authError || !data) return setError(authError ? friendlyAuthError(authError) : "Something went wrong. Please try again.");
      setCodes(data.backupCodes);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        // Closing forgets the codes for good.
        setCodes(null);
        setError(null);
      }}
      disablePointerDismissal={codes !== null}
    >
      <DialogTrigger render={<Button variant="outline" />}>New backup codes</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {codes === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Make new backup codes</DialogTitle>
              <DialogDescription>
                You get 10 new codes, and your old ones stop working. Do this if you&apos;ve used up your codes or lost them.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} noValidate className="grid gap-4">
              <FormField id="backup-2fa-password" name="password" label="Your password" type="password" autoComplete="current-password" autoFocus disabled={pending} />
              <ErrorBox error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />}
                  Make new codes
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Your new backup codes</DialogTitle>
              <DialogDescription>Your old codes no longer work. Each of these works once.</DialogDescription>
            </DialogHeader>
            <BackupCodes codes={codes} />
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                I&apos;ve saved my codes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

/** The backup codes, with "Copy" and "Download", and a loud "only shown once" warning. */
function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");

  function download() {
    const body = [
      "Klyve backup codes for two-step login",
      "Each code works once. Keep them somewhere safe.",
      "",
      ...codes,
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "klyve-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-zinc-50 p-3 font-mono text-sm text-zinc-800" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code} className="text-center">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <CopyButton text={text} what="Backup codes" withLabel />
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <DownloadIcon aria-hidden />
          Download
        </Button>
      </div>
      <div role="alert" className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <p>
          <strong className="font-semibold">Save them now. We can&apos;t show them again.</strong> Keep them somewhere
          safe, like a password manager.
        </p>
      </div>
    </div>
  );
}

/** The QR code for the authenticator app, drawn in the browser (the secret never goes to another service). */
function QrCode({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Loaded only when needed, so the library isn't in every page's download.
    import("qrcode")
      .then((QR) => QR.toDataURL(value, { margin: 1, width: 192, errorCorrectionLevel: "M" }))
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="mx-auto flex size-48 items-center justify-center rounded-lg border bg-white">
      {dataUrl ? (
        // A data: URL made right here, so next/image adds nothing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="QR code for your authenticator app" width={192} height={192} className="size-48" />
      ) : dataUrl === "" ? (
        <p className="px-4 text-center text-xs text-zinc-500">Couldn&apos;t draw the QR code. Type the key below instead.</p>
      ) : (
        <Loader2 className="size-5 animate-spin text-zinc-400" aria-label="Loading QR code" />
      )}
    </div>
  );
}

function CopyButton({ text, what, withLabel }: { text: string; what: string; withLabel?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${what} copied.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Please select the text and copy it yourself.");
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;
  return withLabel ? (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      <Icon aria-hidden />
      {copied ? "Copied" : "Copy"}
    </Button>
  ) : (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${what.toLowerCase()}`} title="Copy">
      <Icon />
    </Button>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );
}

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" (easier to type). */
function groupInFours(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
