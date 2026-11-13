"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { friendlyAuthError } from "@/components/auth/auth-errors";
import { safeNextPath, withNext } from "@/components/auth/safe-next";

// The second login step for accounts with two-step login turned on.
// The password was already checked on /login; Better Auth remembers that in a
// short-lived (10 minute) cookie, and this form sends the 6-digit code from
// the authenticator app, or one of the backup codes, to finish logging in.

type Mode = "app" | "backup";

// These errors mean the 10-minute login step is over: start again at /login.
const START_AGAIN_CODES = new Set(["INVALID_TWO_FACTOR_COOKIE", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"]);

export function TwoFactorForm({ next }: { next: string | null }) {
  const [mode, setMode] = useState<Mode>("app");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startAgain, setStartAgain] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setCode("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleaned = mode === "app" ? code.replace(/\s/g, "") : code.trim();
    if (mode === "app" && !/^\d{6}$/.test(cleaned)) {
      setError("Please enter the 6-digit code from your authenticator app.");
      return;
    }
    if (mode === "backup" && cleaned.length < 6) {
      setError("Please enter one of your backup codes, e.g. AbCd1-23EfG.");
      return;
    }

    setLoading(true);
    const { error: authError } =
      mode === "app"
        ? await authClient.twoFactor.verifyTotp({ code: cleaned, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code: cleaned, trustDevice });

    if (authError) {
      setError(friendlyAuthError(authError));
      setStartAgain(START_AGAIN_CODES.has(authError.code ?? ""));
      setLoading(false);
      return;
    }

    // Logged in. Full page load so nothing cached from before login is reused.
    window.location.assign(safeNextPath(next) ?? "/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}{" "}
          {startAgain && (
            <Link href={withNext("/login", next)} className="font-medium underline">
              Log in again
            </Link>
          )}
        </div>
      )}

      {mode === "app" ? (
        <FormField
          key="app"
          id="code"
          label="6-digit code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={7}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={loading}
          className="h-10 font-mono tracking-[0.3em]"
        />
      ) : (
        <FormField
          key="backup"
          id="backupCode"
          label="Backup code"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="AbCd1-23EfG"
          maxLength={40}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={loading}
          className="h-10 font-mono"
        />
      )}

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="trust-device"
          checked={trustDevice}
          onCheckedChange={(checked) => setTrustDevice(checked === true)}
          disabled={loading}
          className="mt-0.5"
        />
        <div className="grid gap-0.5">
          <Label htmlFor="trust-device" className="font-normal">
            Trust this device for 30 days
          </Label>
          <p className="text-xs text-muted-foreground">Only tick this on your own computer or phone.</p>
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {loading && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        {loading ? "Checking..." : "Verify and log in"}
      </Button>

      <div className="grid gap-2 text-center text-sm text-muted-foreground">
        {mode === "app" ? (
          <p>
            Lost your phone?{" "}
            <button
              type="button"
              onClick={() => switchMode("backup")}
              className="font-medium text-emerald-700 hover:underline"
            >
              Use a backup code
            </button>
          </p>
        ) : (
          <p>
            <button
              type="button"
              onClick={() => switchMode("app")}
              className="font-medium text-emerald-700 hover:underline"
            >
              Use your authenticator app instead
            </button>
          </p>
        )}
        <p>
          <Link href={withNext("/login", next)} className="hover:text-zinc-900 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </form>
  );
}
