import Link from "next/link";
import { MailX } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";

// Shown when the campaign id in the URL doesn't exist, or belongs to another
// workspace (we deliberately don't say which).
export default function CampaignNotFound() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
          <MailX className="size-7" aria-hidden />
        </span>
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
