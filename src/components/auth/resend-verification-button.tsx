"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { friendlyAuthError } from "@/components/auth/auth-errors";

// How long the button stays disabled after sending, so people don't send
// five emails in a row. The server also limits this (3 per minute).
const COOLDOWN_SECONDS = 60;

type Props = {
  /** The logged-in user's own email address. */
  email: string;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg";
  label?: string;
};

export function ResendVerificationButton({
  email,
  className,
  variant = "outline",
  size = "sm",
  label = "Resend email",
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Count the cooldown down once per second.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleClick() {
    setSending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email",
    });
    setSending(false);

    if (error) {
      if (error.code === "EMAIL_ALREADY_VERIFIED") {
        toast.success("Your email address is already verified.");
        router.refresh(); // re-render the page so the banner disappears
        return;
      }
      toast.error(friendlyAuthError(error));
      if (error.status === 429) setSecondsLeft(COOLDOWN_SECONDS);
      return;
    }

    toast.success(`Verification email sent to ${email}. Check your inbox.`);
    setSecondsLeft(COOLDOWN_SECONDS);
  }

  const coolingDown = secondsLeft > 0;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={sending || coolingDown}
      onClick={handleClick}
    >
      {sending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
      {sending ? "Sending..." : coolingDown ? `Resend in ${secondsLeft}s` : label}
    </Button>
  );
}
