import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { CtaLink } from "@/components/landing/cta-link";
import { EditorMockup } from "@/components/landing/mockups/editor-mockup";
import { LivePanel } from "@/components/landing/mockups/live-panel";
import { MockStage } from "@/components/landing/mockups/parts";
import "@/components/landing/landing.css";

// Sending providers Klyve connects to (shown as plain names: these are
// integrations, not customers).
const PROVIDERS = ["Amazon SES", "Resend", "SendGrid", "Mailgun", "Postmark", "SMTP", "Gmail"];

/** Staggers the hero's "rise" entrance animation. */
const delay = (seconds: number) => ({ "--rise-delay": `${seconds}s` }) as CSSProperties;

// The first thing visitors see. On wide screens it's half and half: the
// headline on the left, and a "live" panel of Klyve at work on the right.
// On phones and tablets they stack (words first). Below sits the campaign
// editor, then the providers Klyve sends through.
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      <div aria-hidden="true" className="klv-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem]" />

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-16 lg:pt-24">
        <div>
          <Link
            href="#ai"
            style={delay(0)}
            className="klv-rise group inline-flex items-center gap-2 rounded-md text-sm text-zinc-600 outline-none hover:text-zinc-950 focus-visible:ring-3 focus-visible:ring-emerald-600/40"
          >
            <Glyph icon={SparklesIcon} size="sm" />
            <span>
              <span className="font-medium text-emerald-700">New:</span> write a whole campaign from one sentence
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-950 motion-reduce:transition-none"
            />
          </Link>

          <h1
            id="hero-title"
            style={delay(0.06)}
            className="klv-rise mt-7 text-[2.6rem] leading-[1.03] font-semibold tracking-[-0.045em] text-balance text-zinc-950 sm:text-6xl lg:text-[3.1rem] xl:text-[3.6rem]"
          >
            Campaigns that land.{" "}
            <span className="block">
              Sending that&apos;s <span className="text-emerald-700">yours</span>.
            </span>
          </h1>

          <p
            style={delay(0.12)}
            className="klv-rise mt-6 max-w-xl text-lg leading-8 text-pretty text-zinc-600 sm:text-xl sm:leading-8"
          >
            One workspace for campaigns, automations, AI writing and analytics. Every email goes out through the
            provider you choose, so your reputation, your costs and your data stay yours.
          </p>

          <div style={delay(0.18)} className="klv-rise mt-9 flex flex-col gap-3 sm:flex-row">
            <CtaLink href="/signup" arrow>
              Get started
            </CtaLink>
            <CtaLink href="#how-it-works" variant="outline">
              See how it works
            </CtaLink>
          </div>
        </div>

        <MockStage className="mx-auto w-full max-w-md lg:max-w-none">
          <LivePanel />
        </MockStage>
      </div>

      <div className="mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-32 sm:px-6">
        <EditorMockup />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-4 sm:px-6 sm:pt-20 lg:pt-28">
        <p className="text-center text-sm text-zinc-500">Sends through the provider you already trust</p>
        <ul
          aria-label="Supported sending providers"
          className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4"
        >
          {PROVIDERS.map((name) => (
            <li key={name} className="text-lg font-semibold tracking-tight text-zinc-500 sm:text-xl">
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
