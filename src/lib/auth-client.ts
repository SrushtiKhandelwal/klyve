// Browser-side auth helpers, for use in Client Components ("use client").
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { safeNextPath } from "@/components/auth/safe-next";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // A user with two-step login turned on typed the right password: send
      // them to /two-factor for their 6-digit code. Keep the "?next=" of the
      // login page (e.g. a team invite) so they still end up there afterwards.
      onTwoFactorRedirect() {
        const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
        const target = next ? `/two-factor?next=${encodeURIComponent(next)}` : "/two-factor";
        // Full page load, like the rest of the login flow.
        window.location.assign(target);
      },
    }),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
