import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

// Server-side authentication setup (Better Auth).
// Users, sessions and passwords are stored in our own Postgres database.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // TODO (Phase 2): turn on email verification once sending is set up.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the session once a day
  },
  // Must be last: lets Server Actions set the login cookie.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
