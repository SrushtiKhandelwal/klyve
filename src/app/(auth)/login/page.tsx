import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Log in", // shown as "Log in | Klyve" (see app/layout.tsx)
};

// This page is a static shell; the interactive form is a Client Component.
export default function LoginPage() {
  return (
    <Card className="gap-6 py-8 shadow-sm">
      <CardHeader className="px-8 text-center">
        <CardTitle>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
        </CardTitle>
        <CardDescription>Log in to your {BRAND.name} account.</CardDescription>
      </CardHeader>
      <CardContent className="px-8">
        <LoginForm />
      </CardContent>
    </Card>
  );
}
