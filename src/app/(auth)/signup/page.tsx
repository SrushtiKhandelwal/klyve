import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Sign up", // shown as "Sign up | Klyve" (see app/layout.tsx)
};

// This page is a static shell; the interactive form is a Client Component.
export default function SignupPage() {
  return (
    <Card className="gap-6 py-8 shadow-sm">
      <CardHeader className="px-8 text-center">
        <CardTitle>
          <h1 className="text-2xl font-semibold">Create your account</h1>
        </CardTitle>
        <CardDescription>It&apos;s free. No credit card needed.</CardDescription>
      </CardHeader>
      <CardContent className="px-8">
        <SignupForm />
      </CardContent>
    </Card>
  );
}
