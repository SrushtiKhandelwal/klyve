import Link from "next/link";
import { FileX } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { PageContainer } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";

// Shown when the form id in the URL doesn't exist, or belongs to another
// workspace (we deliberately don't say which).
export default function FormNotFound() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
        <Glyph icon={FileX} size="xl" tone="muted" strokeWidth={1.5} className="size-10" />
        <h1 className="mt-5 text-lg font-semibold text-zinc-900">Form not found</h1>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500">
          This form may have been deleted, or it belongs to a different workspace.
        </p>
        <Link href="/forms" className={`${buttonVariants({ variant: "outline" })} mt-6`}>
          Back to all forms
        </Link>
      </div>
    </PageContainer>
  );
}
