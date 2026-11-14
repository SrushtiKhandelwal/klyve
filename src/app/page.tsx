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
import { getAppUrl } from "@/lib/app-url";
import { BRAND } from "@/lib/brand";

// The title and description Google shows for the home page. Kept under ~60
// and ~160 characters so they aren't cut off in search results.
const TITLE = `${BRAND.name}: free email marketing through your own provider`;
const DESCRIPTION =
  "Free email marketing tool with campaigns, automations, AI writing help and analytics. Send through Amazon SES, Resend, SendGrid, Mailgun, Postmark or any SMTP.";

export const metadata: Metadata = {
  // `absolute` skips the "%s | Klyve" template from app/layout.tsx.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
};

// Facts about Klyve in the format search engines read (schema.org JSON-LD):
// who makes it, what it is, that it's free. Can earn richer Google results.
function StructuredData() {
  const base = getAppUrl();
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}/#organization`,
        name: BRAND.name,
        url: `${base}/`,
        logo: `${base}/apple-icon.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: BRAND.name,
        url: `${base}/`,
        publisher: { "@id": `${base}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: BRAND.name,
        url: `${base}/`,
        description: DESCRIPTION,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Email marketing",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@id": `${base}/#organization` },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // Our own fixed data (no user input). "<" is escaped so the text can
      // never close the <script> tag early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

// Public landing page. It is fully static (no login check, nothing read per
// request), so Next.js can prerender it and serve it instantly.
// overflow-x-clip stops the decorative backdrops behind the mock-ups from
// causing sideways scrolling on phones (unlike overflow-hidden, it keeps the
// sticky header working).
export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-white text-zinc-900">
      <StructuredData />
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
