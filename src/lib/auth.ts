import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { sendSystemEmail, type SystemEmail } from "@/lib/email/system-mailer";
import { resetPasswordEmail, verifyEmailEmail } from "@/lib/email/system-templates";

// Server-side authentication setup (Better Auth).
// Users, sessions and passwords are stored in our own Postgres database.

// The public address of the app, e.g. https://app.example.com.
// ALL links in our emails use this, never the incoming request's "Host"
// header, so an attacker can't trick us into emailing a reset link that
// points to their own website.
const APP_URL = process.env.BETTER_AUTH_URL;

/**
 * Builds a system email and sends it WITHOUT waiting, only logging failures.
 *
 * Why not wait? Sending takes a moment, but only happens when the account
 * exists. If the response waited for it, an attacker could time the
 * "forgot password" form to find out which emails have accounts. And if
 * anything fails, the visitor still sees the normal message (we log it).
 * Note: this relies on a long-running Node server (`next start` / Docker).
 * On serverless hosting, use Better Auth's `advanced.backgroundTasks` instead.
 */
function sendInBackground(kind: string, build: () => SystemEmail) {
  Promise.resolve()
    .then(() => sendSystemEmail(build()))
    .catch((error: unknown) => {
      // Only the error text: never the email body, which contains the token.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[system-email] Could not send the "${kind}" email: ${message}`);
    });
}

/**
 * Takes the link Better Auth made and (1) forces it onto APP_URL and
 * (2) sets the page of ours the user lands on once the token is checked.
 */
function buildEmailLink(betterAuthUrl: string, landingPath: string): string {
  if (!APP_URL) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BETTER_AUTH_URL is not set, so email links can't be built safely.");
    }
    // Development only: fall back to the link exactly as Better Auth made it.
  }
  const link = new URL(betterAuthUrl);
  if (APP_URL) {
    const app = new URL(APP_URL);
    link.protocol = app.protocol;
    link.host = app.host;
  }
  link.searchParams.set("callbackURL", landingPath);
  return link.toString();
}

export const auth = betterAuth({
  baseURL: APP_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Users can log in before verifying their email, so nobody gets locked
    // out by a lost email. Phase 4 will instead require a verified email
    // before a user can SEND campaigns.
    requireEmailVerification: false,

    // "Forgot password": email a one-time link.
    sendResetPassword: async ({ user, url }) => {
      // Better Auth's link first checks the token, then forwards the user to
      // our /reset-password page with ?token=... (or ?error=INVALID_TOKEN).
      sendInBackground("reset password", () => ({
        to: user.email,
        ...resetPasswordEmail({ name: user.name, url: buildEmailLink(url, "/reset-password") }),
      }));
    },
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour (the email says so too)
    // After a reset, log the account out everywhere. If someone else had
    // got into the account, this kicks them out.
    revokeSessionsOnPasswordReset: true,
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // After the link is checked, land on our /verify-email page, which
      // shows "verified!" or "this link expired" (?error=TOKEN_EXPIRED).
      sendInBackground("verify email", () => ({
        to: user.email,
        ...verifyEmailEmail({ name: user.name, url: buildEmailLink(url, "/verify-email") }),
      }));
    },
    sendOnSignUp: true,
    // Clicking the link also logs the user in (handy on a new device).
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 hours (the email says so too)
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the session once a day
  },

  // Slows down password guessing and email spam. Each rule allows `max`
  // requests per `window` seconds, per IP address and per endpoint.
  // Paths are relative to /api/auth.
  //
  // NOTE: "memory" storage keeps the counters inside the server process. That
  // is fine for one server, but the counters reset on restart and aren't
  // shared between several servers. Switch to "database" (needs a rateLimit
  // table) or Redis before running more than one server.
  // NOTE: the client IP comes from the X-Forwarded-For header, so in
  // production the app must sit behind a proxy that sets it (e.g. Nginx,
  // Caddy, Vercel). See `advanced.ipAddress` in the Better Auth docs.
  rateLimit: {
    enabled: true, // Better Auth only turns it on in production by default
    storage: "memory",
    // Everything not listed below keeps Better Auth's default (100 per 10 s).
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },

  // Must be last: lets Server Actions set the login cookie.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
