// All Better Auth endpoints live under /api/auth/* (sign-up, sign-in, sign-out, session...).
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
