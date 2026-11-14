import type { Metadata } from "next";

// Search-engine settings shared by the public pages.
//
// What Google may show:      the landing page, /signup, /login, /docs/api,
//                            /privacy and /terms (listed in app/sitemap.ts).
// What Google must never show: everything behind the login, and the per-person
//                            pages reached from emails (unsubscribe, sign-up
//                            forms, tracking links...). Those are blocked in
//                            app/robots.ts AND marked "noindex" with NO_INDEX.
//
// Share previews: app/layout.tsx sets the site name; Next.js copies each
// page's title and description into the og:/twitter: tags, and the picture
// comes from app/opengraph-image.tsx and app/twitter-image.tsx.

/** Short description used when a page has none of its own (and in share previews). */
export const SITE_DESCRIPTION =
  "Free email marketing that sends through your own provider (Amazon SES, Resend, SendGrid, Mailgun, Postmark or SMTP): campaigns, automations, analytics and AI writing help.";

/** Paths search engines should not crawl. Keep in sync with the private areas of the app. */
export const PRIVATE_PATHS = [
  "/api/",
  // Logged-in app
  "/dashboard",
  "/campaigns",
  "/contacts",
  "/automations",
  "/forms",
  "/library",
  "/settings",
  "/statistics",
  "/templates",
  "/transactional",
  "/onboarding",
  "/invite/",
  // Account steps that only make sense from an email or after logging in
  "/two-factor",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  // Per-person pages reached from emails and customers' forms
  "/c/",
  "/f/",
  "/p/",
  "/t/",
  "/u/",
  "/v/",
  "/media/",
];

/** `metadata.robots` for pages that must stay out of search results. */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: false };

