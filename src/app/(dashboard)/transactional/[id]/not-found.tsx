import Link from "next/link";
import { MailQuestionIcon } from "lucide-react";
import { PageContainer } from "@/components/dashboard/page-header";
import { buttonVariants } from "@/components/ui/button";

// Shown when the email id in the URL doesn't exist, was deleted after 90 days,
// or belongs to another workspace (we deliberately don't say which).
export default function TransactionalEmailNotFound() {
  return (
    <PageContainer>
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:py-20">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
          <MailQuestionIcon className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-zinc-900">Email not found</h1>
        <p className="mt-1.5 max-w-md text-sm text-zinc-500">
          It may be older than 90 days (logs are deleted then), or it belongs to a different workspace.
        </p>
        <Link href="/transactional" className={`${buttonVariants({ variant: "outline" })} mt-6`}>
          Back to all emails
        </Link>
      </div>
    </PageContainer>
  );
}
