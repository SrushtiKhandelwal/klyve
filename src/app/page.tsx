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

const TITLE = `${BRAND.name}: email marketing, sent through your own provider`;
const DESCRIPTION =
  "Campaigns, automations, AI writing help and analytics in one workspace. Every email goes out through Amazon SES, Resend, SendGrid, Mailgun, Postmark or any SMTP server you choose.";

export const metadata: Metadata = {
  // `absolute` skips the "%s | Klyve" template from app/layout.tsx.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Public landing page. It is fully static (no login check, nothing read per
// request), so Next.js can prerender it and serve it instantly.
// overflow-x-clip stops the decorative backdrops behind the mock-ups from
// causing sideways scrolling on phones (unlike overflow-hidden, it keeps the
// sticky header working).
export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-white text-zinc-900">
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <HowItWorks />
        <Features />
        <Developers />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
