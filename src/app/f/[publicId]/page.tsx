import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { BRAND } from "@/lib/brand";
import { cleanSourceUrl, decodeErrorCodes, errorMessages, getPublicForm } from "@/lib/forms/public";
import { RENDERED_AT_FIELD } from "@/lib/forms/schema";
import { createRenderedAtToken } from "@/lib/forms/spam";
import { submitHostedFormAction } from "./actions";
import { HostedForm } from "./hosted-form";

// /f/<publicId>: the hosted sign-up form. Public: no login, no cookies.
//
//  - /f/<id>          a full page with the form, in the sender's brand.
//  - /f/<id>?embed=1  just the form, no page around it, for an <iframe> on
//                     another website (the "embed" option in the builder).
//                     Other websites may frame /f pages only: the
//                     "Content-Security-Policy: frame-ancestors *" header
//                     for /f/:path* is set in next.config.ts.
//  - ?error=…         errors from the cross-site endpoint (/api/forms/…),
//                     as short codes, shown next to the fields.
//
// Everything must work with JavaScript switched OFF, so this route renders
// the whole page before responding (no streaming); `instant = false` says
// that waiting is intended (node_modules/next/dist/docs, "instant"), as on
// the /u and /c pages.

export const instant = false;

const NO_INDEX: Metadata["robots"] = { index: false, follow: false, nocache: true };

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params;
  const form = await getPublicForm(publicId);
  // "absolute": the sender's title, without our " | Klyve" suffix.
  const title = form ? form.config.title || form.brand.name : "Not found";
  return { title: { absolute: title }, robots: NO_INDEX };
}

export default async function FormPage({ params, searchParams }: PageProps<"/f/[publicId]">) {
  const [{ publicId }, query, h] = await Promise.all([params, searchParams, headers()]);
  const form = await getPublicForm(publicId);
  // Unknown id: the standard "not found" page, which says nothing more.
  if (!form) notFound();

  const embed = query.embed === "1";
  const { config, brand } = form;

  if (!form.accepting) {
    const message = (
      <>
        <h1 className="text-xl font-semibold text-zinc-900">This form isn&apos;t accepting sign-ups right now.</h1>
        <p className="mt-3 text-sm text-zinc-500">Please check back later.</p>
      </>
    );
    if (embed) {
      return (
        <EmbedFrame>
          <div className="p-4 text-center">{message}</div>
        </EmbedFrame>
      );
    }
    return <PublicShell brand={{ ...brand, primaryColor: config.style.accentColor }}>{message}</PublicShell>;
  }

  // Inside an iframe the Referer is the website around it: remember it for
  // the "where do sign-ups come from" stats (cleaned; our own pages don't count).
  const src = cleanSourceUrl(h.get("referer"));
  const hiddenFields: Record<string, string> = {
    // Signed "shown at" time: a submit within ~2.5 s is a bot (lib/forms/spam.ts).
    [RENDERED_AT_FIELD]: createRenderedAtToken(form.id),
    ...(embed ? { embed: "1" } : {}),
    ...(src ? { _src: src } : {}),
  };
  const rawError = typeof query.error === "string" ? query.error : "";
  const initialErrors = rawError ? errorMessages(decodeErrorCodes(rawError, config), form) : undefined;

  const content = (
    <HostedForm
      action={submitHostedFormAction.bind(null, form.publicId)}
      config={config}
      brand={brand}
      attributeTypes={form.attributeTypes}
      hiddenFields={hiddenFields}
      initialErrors={initialErrors}
    />
  );

  if (embed) return <EmbedFrame>{content}</EmbedFrame>;

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-[480px] flex-1 flex-col">
        <main>{content}</main>
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

/** Embed mode: no page chrome, and a see-through page so the form blends into the website. */
function EmbedFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{"html,body{background:transparent!important}"}</style>
      <main className="w-full">{children}</main>
    </>
  );
}
