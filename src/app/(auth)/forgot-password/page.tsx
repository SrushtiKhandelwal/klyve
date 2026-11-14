import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { NO_INDEX } from "@/lib/seo";

export const metadata: Metadata = {
  robots: NO_INDEX, // a step in the login flow: keep it out of search results
  title: "Forgot password",
};

// Static shell; the interactive form is a Client Component.
export default function ForgotPasswordPage() {
  return (
    <Card className="gap-6 py-8 shadow-lg shadow-zinc-900/5">
      <CardHeader className="px-6 text-center sm:px-8">
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        </CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to choose a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8">
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
