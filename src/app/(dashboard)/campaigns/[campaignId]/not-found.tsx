import Link from "next/link";
import { MailX } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { PageContainer } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";

// Shown when the campaign id in the URL doesn't exist, or belongs to another
// workspace (we deliberately don't say which).
export default function CampaignNotFound() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
        <Glyph icon={MailX} size="xl" tone="muted" strokeWidth={1.5} className="size-10" />
        <h1 className="mt-5 text-lg font-semibold text-zinc-900">Campaign not found</h1>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500">
          This campaign may have been deleted, or it belongs to a different workspace.
        </p>
        <Link href="/campaigns" className={`${buttonVariants({ variant: "outline" })} mt-6`}>
          Back to all campaigns
        </Link>
      </div>
    </PageContainer>
  );
}
