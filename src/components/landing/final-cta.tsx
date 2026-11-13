import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// The last nudge before the footer.
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="rounded-3xl bg-emerald-700 px-6 py-14 text-center shadow-lg shadow-emerald-900/10 sm:px-12">
          <h2 id="cta-title" className="text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
            Start sending on your terms
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-pretty text-emerald-50">
            Create a free account, connect your provider and send your first campaign today.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/signup" />}
              className="h-11 bg-white px-6 text-base text-emerald-800 hover:bg-emerald-50 focus-visible:ring-white/60"
            >
              Create a free account
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              nativeButton={false}
              render={<Link href="/login" />}
              className="h-11 px-6 text-base text-white hover:bg-white/10 hover:text-white focus-visible:ring-white/60"
            >
              Log in
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
