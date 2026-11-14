import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GlyphGradientDefs } from "@/components/brand/glyph";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAppUrl } from "@/lib/app-url";
import { BRAND } from "@/lib/brand";
import { SITE_DESCRIPTION } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Turns relative links in metadata (canonical URLs, share images) into
  // full https://app.klyveapp.tech/... addresses, as search engines need.
  metadataBase: new URL(getAppUrl()),
  // A page that sets title: "Log in" shows as "Log in | Klyve" in the tab.
  // Pages without their own title just show the brand name.
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: SITE_DESCRIPTION,
  applicationName: BRAND.name,
  category: "technology",
  // Share previews (the image comes from app/opengraph-image.tsx).
  openGraph: { type: "website", siteName: BRAND.name, locale: "en_US" },
  twitter: { card: "summary_large_image" },
  // Don't turn numbers in the page into phone links on iPhones.
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The gradient every <Glyph> icon is painted with (defined once). */}
        <GlyphGradientDefs />
        {/* Lets any component use <Tooltip> hover hints. */}
        <TooltipProvider>{children}</TooltipProvider>
        {/* Pop-up notifications. Call toast("...") from "sonner" anywhere. */}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
