import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/signup-form";
import { googleSignInEnabled } from "@/lib/google-auth";
import { BRAND } from "@/lib/brand";

const DESCRIPTION = `Create your free ${BRAND.name} account. No credit card needed: connect your own sending provider and start sending email campaigns.`;

export const metadata: Metadata = {
  title: "Sign up free", // shown as "Sign up free | Klyve" (see app/layout.tsx)
  description: DESCRIPTION,
  alternates: { canonical: "/signup" },
};

// This page is a static shell; the interactive form is a Client Component.
export default function SignupPage() {
  return (
    <>
      <Card className="gap-6 py-8 shadow-lg shadow-zinc-900/5">
        <CardHeader className="px-6 text-center sm:px-8">
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          </CardTitle>
          <CardDescription>
            It&apos;s free, with no credit card needed. You can connect your sending provider later.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 sm:px-8">
          <SignupForm googleEnabled={googleSignInEnabled()} />
        </CardContent>
      </Card>

      <p className="mt-6 px-4 text-center text-xs leading-5 text-zinc-500">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-medium text-zinc-700 underline underline-offset-4 hover:text-zinc-900">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}
