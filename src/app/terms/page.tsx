import type { Metadata } from "next";
import Link from "next/link";
import { InlineContactEmail } from "@/components/landing/contact-email";
import { LegalPage } from "@/components/landing/legal-page";
import { BRAND } from "@/lib/brand";

// Klyve's terms, in plain English. Klyve is run by Srushti Khandelwal as an
// individual (no company), under Indian law. Not legal advice: if Klyve grows
// (or starts charging), have a lawyer review them. Update LAST_UPDATED, and
// email users about important changes, whenever they change.
//
// The contact address comes from CONTACT_EMAIL and is shown scrambled to spam bots.

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The rules for using ${BRAND.name}, the free email marketing tool where you bring your own sending provider.`,
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "15 November 2026";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          These terms are the agreement between you and Srushti Khandelwal, an independent developer based in India
          who runs {BRAND.name} (&quot;we&quot;, &quot;us&quot;), when you use the service. By creating an account,
          you agree to them. We&apos;ve kept them short and plain on purpose.
        </p>
      }
    >
      <h2>1. Your account</h2>
      <ul>
        <li>Give us accurate details and keep your password safe. You&apos;re responsible for what happens in your account.</li>
        <li>You must be at least 18, and old enough to agree to these terms where you live.</li>
        <li>If you use {BRAND.name} for a business, you agree to these terms on its behalf.</li>
      </ul>

      <h2>2. Your sending provider</h2>
      <p>
        {BRAND.name} doesn&apos;t send email from its own servers. You connect a provider of your choice (such as
        Amazon SES, Resend, SendGrid, Mailgun, Postmark or an SMTP server), and your emails go out through your
        account with them. That means:
      </p>
      <ul>
        <li>Your provider&apos;s own terms, limits and prices apply, and you pay them directly.</li>
        <li>You&apos;re responsible for keeping that account in good standing.</li>
        <li>We aren&apos;t responsible for your provider&apos;s outages, charges or decisions about your account.</li>
      </ul>

      <h2>3. Acceptable use: no spam</h2>
      <p>Email only works when people trust it. When you use {BRAND.name}, you agree to:</p>
      <ul>
        <li>
          <strong>Only email people who agreed to hear from you.</strong> Keep proof of consent, and use double
          opt-in where the law or good practice calls for it.
        </li>
        <li>
          <strong>Never use purchased, rented, borrowed or scraped lists.</strong>
        </li>
        <li>
          <strong>Follow the law</strong>, including CAN-SPAM, GDPR, and any other anti-spam and privacy laws that
          apply to you and your recipients. For example: say who you are, include a valid postal address where
          required, and don&apos;t use misleading subject lines.
        </li>
        <li>
          <strong>Honour unsubscribes.</strong> {BRAND.name} adds an unsubscribe link and suppresses those
          addresses automatically; don&apos;t work around it.
        </li>
        <li>
          Not send phishing, malware, illegal content, or anything that impersonates someone else or harasses
          people.
        </li>
        <li>
          Not try to break, overload or get around the security or limits of the service, including the API rate
          limits.
        </li>
      </ul>

      <h2>4. Your content and data</h2>
      <ul>
        <li>You own your content and your contact lists. We only use them to provide the service to you.</li>
        <li>
          For your contacts&apos; personal data, you are the controller and we are your processor, as described in
          our <Link href="/privacy">Privacy Policy</Link>.
        </li>
        <li>You&apos;re responsible for having the right to use the content and contacts you upload.</li>
      </ul>

      <h2>5. Pausing, suspension and termination</h2>
      <ul>
        <li>
          To protect your sender reputation, {BRAND.name} may automatically pause a campaign when its bounce or
          complaint rate becomes too high.
        </li>
        <li>
          We may suspend or close accounts that break these terms, put the service or other users at risk, or are
          used for spam. Where it&apos;s reasonable, we&apos;ll tell you first and give you a chance to fix things.
        </li>
        <li>
          You can stop using {BRAND.name} at any time, and delete your account yourself in Settings → Profile (or
          ask us to by emailing <InlineContactEmail />).
        </li>
      </ul>

      <h2>6. A free service, provided as is</h2>
      <p>
        {BRAND.name} is free. We work hard to keep it reliable, but we provide it &quot;as is&quot; and &quot;as
        available&quot;, without warranties of any kind, to the extent the law allows. We may change, add or
        remove features. If we ever plan to shut the service down, we&apos;ll give reasonable notice so you can
        export your data.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the extent the law allows, {BRAND.name} isn&apos;t liable for indirect or consequential losses, such
        as lost profits, lost data or damage to reputation, or for anything caused by your sending provider.
        Because the service is free, our total liability to you for all claims is limited to the amount you paid us
        in the 12 months before the claim (nothing, for a free account) or US$10, whichever is greater. Nothing in
        these terms limits liability that can&apos;t be limited by law.
      </p>

      <h2>8. Changes to these terms</h2>
      <p>
        We may update these terms. We&apos;ll change the date at the top, and for important changes we&apos;ll
        email account owners before they take effect. If you keep using {BRAND.name} after that, the new terms
        apply.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and disputes will be handled by the courts of India, unless
        the law where you live gives you the right to bring a claim locally.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms? Email <InlineContactEmail />.
      </p>
    </LegalPage>
  );
}
