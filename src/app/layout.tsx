import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";
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
  // A page that sets title: "Log in" shows as "Log in | MailFlow" in the tab.
  // Pages without their own title just show the brand name.
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Pop-up notifications. Call toast("...") from "sonner" anywhere. */}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
