import type { CSSProperties } from "react";
import { readableTextOn } from "@/components/forms/form-view";
import type { FormConfig } from "@/lib/forms/schema";

// The "thanks" box shown after signing up, in the form's own look (colours,
// card/plain, logo). Used by the hosted page and by /f/<id>/thanks.
// No hooks, so it works in both server and client components.

export function SuccessView({
  config,
  brand,
  continueUrl,
}: {
  config: FormConfig;
  brand: { name: string; logoUrl: string | null };
  /** Inside an iframe: the form's "after signing up" page, opened in the whole window. */
  continueUrl?: string | null;
}) {
  const { style } = config;
  const card = style.layout !== "plain";
  const box: CSSProperties = {
    color: style.textColor,
    background: style.backgroundColor,
    // Same system fonts as the form itself (FormView).
    fontFamily: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
    ...(card
      ? { border: `1px solid color-mix(in srgb, ${style.textColor} 12%, transparent)`, borderRadius: 16, padding: "28px 24px" }
      : { padding: "8px 4px" }),
  };
  return (
    <div role="status" className={`mx-auto w-full max-w-[480px] text-center ${card ? "shadow-sm" : ""}`} style={box}>
      {style.showLogo && (brand.logoUrl || brand.name) && (
        <div className="mb-4 flex justify-center">
          {brand.logoUrl ? (
            // A plain <img>: the logo can live on any https host (or /media).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name || "Logo"} className="max-h-11 max-w-[180px] object-contain" />
          ) : (
            <span className="text-[15px] font-semibold">{brand.name}</span>
          )}
        </div>
      )}
      {/* A check mark in the accent colour. */}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mx-auto mb-3 size-10" fill="none" stroke={style.accentColor} strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="m8 12.5 2.5 2.5L16 9.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="text-2xl leading-tight font-bold break-words">{config.successTitle}</h2>
      {config.successMessage && <p className="mt-2 text-[15px] break-words whitespace-pre-line opacity-80">{config.successMessage}</p>}
      {continueUrl && (
        <p className="mt-5">
          {/* target=_top: leave the iframe and open the page in the whole window. */}
          <a
            href={continueUrl}
            target="_top"
            rel="noopener"
            className="inline-block rounded-[10px] px-4 py-2.5 text-[15px] font-semibold"
            style={{ background: style.accentColor, color: readableTextOn(style.accentColor) }}
          >
            Continue
          </a>
        </p>
      )}
    </div>
  );
}

