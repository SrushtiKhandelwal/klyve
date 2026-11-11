// Browser-side auth helpers, for use in Client Components ("use client").
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
