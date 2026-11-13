import { CtaLink } from "@/components/landing/cta-link";
import "@/components/landing/landing.css";

// The last nudge before the footer: a quiet band with a very faint grid,
// one large line and the two main actions.
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-zinc-200/70 bg-zinc-50">
      <div aria-hidden="true" className="klv-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto w-full max-w-4xl px-4 py-28 text-center sm:px-6 sm:py-36">
        <h2
          id="cta-title"
          className="text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.045em] text-balance text-zinc-950 sm:text-6xl lg:text-7xl"
        >
          Send something worth opening.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-pretty text-zinc-600">
          Create your workspace, connect your provider and launch your first campaign today. Klyve is free to
          use.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <CtaLink href="/signup" arrow>
            Get started
          </CtaLink>
          <CtaLink href="/login" variant="outline">
            Log in
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
