import type { Metadata } from "next";
import { Developers } from "@/components/landing/developers";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Pricing } from "@/components/landing/pricing";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { BRAND } from "@/lib/brand";

const DESCRIPTION =
  "Free email marketing with contacts, campaigns, a drag-and-drop editor, automation and a transactional API. Connect your own sending provider, with no daily sending cap.";

export const metadata: Metadata = {
  // `absolute` skips the "%s | Klyve" template from app/layout.tsx.
  title: { absolute: `${BRAND.name}: free email marketing with your own provider` },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name}: free email marketing with your own provider`,
    description: DESCRIPTION,
  },
};

// Public landing page. It is fully static (no login check, nothing read per
// request), so Next.js can prerender it and serve it instantly.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white text-zinc-900">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <Developers />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
