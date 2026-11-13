import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { getPublicForm } from "@/lib/forms/public";
import { SuccessView } from "../success-view";

// /f/<publicId>/thanks: where the cross-site endpoint sends people after a
// plain HTML form on another website was submitted (when the form has no
// "after signing up" page of its own).
//
// It shows the same "thanks" for everyone and reads nothing from the URL, so
// it can't reveal anything about anyone. Visiting it directly does nothing.

export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const form = await getPublicForm(publicId);
  return {
    title: { absolute: form ? form.config.successTitle : "Not found" },
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function FormThanksPage({ params }: PageProps<"/f/[publicId]/thanks">) {
  const { publicId } = await params;
  const form = await getPublicForm(publicId);
  if (!form) notFound();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-[480px] flex-1 flex-col">
        <main>
          <SuccessView config={form.config} brand={form.brand} />
        </main>
        <footer className="mt-auto pt-10 text-center text-xs text-zinc-400">
          Powered by{" "}
          <Link href="/" prefetch={false} className="font-medium text-zinc-500 hover:text-zinc-700">
            {BRAND.name}
          </Link>
        </footer>
      </div>
    </div>
  );
}
