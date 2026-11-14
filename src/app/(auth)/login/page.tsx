import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { BRAND } from "@/lib/brand";
import { googleSignInEnabled } from "@/lib/google-auth";

const DESCRIPTION = `Log in to your ${BRAND.name} account to send campaigns, run automations and see your results.`;

export const metadata: Metadata = {
  title: "Log in", // shown as "Log in | Klyve" (see app/layout.tsx)
  description: DESCRIPTION,
  alternates: { canonical: "/login" },
};

// This page is a static shell; the interactive form is a Client Component.
export default function LoginPage() {
  return (
    <Card className="gap-6 py-8 shadow-lg shadow-zinc-900/5">
      <CardHeader className="px-6 text-center sm:px-8">
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        </CardTitle>
        <CardDescription>Log in to your {BRAND.name} account.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        <LoginForm googleEnabled={googleSignInEnabled()} />
      </CardContent>
    </Card>
  );
}
