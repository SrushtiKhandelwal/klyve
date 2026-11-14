import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { EditorMockup } from "@/components/landing/mockups/editor-mockup";
import { EmailCollage } from "@/components/landing/mockups/email-collage";
import "@/components/landing/landing.css";

// Sending providers Klyve connects to (shown as plain names: these are
// integrations, not customers).
const PROVIDERS = ["Amazon SES", "Resend", "SendGrid", "Mailgun", "Postmark", "SMTP"];

/** Staggers the hero's "rise" entrance animation. */
const delay = (seconds: number) => ({ "--rise-delay": `${seconds}s` }) as CSSProperties;

// The first thing visitors see: a warm ivory band. On wide screens it's half
// and half — the promise on the left, a collage of colourful emails from
// different brands on the right. On phones they stack (words first).
// Below the band sits the campaign editor.
export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <div className="border-b border-[#EAE3D4] bg-[#FBF8F2]">
        <div className="mx-auto grid w-full max-w-[84rem] grid-cols-1 items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:px-10 lg:pt-20 lg:pb-24">
          <div className="max-w-[36rem]">
            <p
              style={delay(0)}
              className="klv-rise flex items-center gap-3 text-[13px] font-semibold tracking-[0.14em] text-[#7A6A4F] uppercase"
            >
              <span aria-hidden="true" className="h-px w-8 bg-[#C9B996]" />
              Email marketing, done properly
            </p>

            <h1
              id="hero-title"
              style={delay(0.06)}
              className="klv-rise mt-6 text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-[#10201B] sm:text-[3.6rem] lg:text-[3.5rem] xl:text-[4rem]"
            >
              Send emails people are{" "}
              <span className="klv-marker">glad to open.</span>
            </h1>

            <p
              style={delay(0.12)}
              className="klv-rise mt-6 text-lg leading-8 text-pretty text-[#4A5550] sm:text-[1.2rem] sm:leading-8"
            >
              Design on-brand campaigns, automate the follow-ups and let AI write the first draft. Every email goes
              out through the provider you already trust.
            </p>

            <div style={delay(0.18)} className="klv-rise mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link
                href="/signup"
                className="group/cta inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#10201B] px-6 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgb(16_32_27/0.2)] outline-none transition-colors hover:bg-[#1D3A31] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Get started
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover/cta:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
              <Link
                href="#how-it-works"
                className="group inline-flex items-center justify-center gap-1.5 rounded-md text-[15px] font-semibold text-[#10201B] underline decoration-[#C9B996] decoration-2 underline-offset-[6px] outline-none transition-colors hover:decoration-[#10201B] focus-visible:ring-3 focus-visible:ring-emerald-600/40"
              >
                See how it works
              </Link>
            </div>

            <div style={delay(0.24)} className="klv-rise mt-12 border-t border-[#E6DDCB] pt-6">
              <p className="text-[13px] text-[#7A6A4F]">Sends through the provider you already use</p>
              <ul
                aria-label="Supported sending providers"
                className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2"
              >
                {PROVIDERS.map((name) => (
                  <li key={name} className="text-[15px] font-semibold tracking-tight text-[#5E665F]">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <EmailCollage />
        </div>
      </div>

      <div className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
        <EditorMockup />
      </div>
    </section>
  );
}
