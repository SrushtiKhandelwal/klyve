import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/landing/legal-page";
import { BRAND } from "@/lib/brand";
import { TRANSACTIONAL_LIMITS } from "@/lib/transactional/schema";

// DRAFT, have it reviewed before launch.
// This is a plain-English STARTER privacy policy, not legal advice. Before
// going live: fill in every [placeholder], replace privacy@your-domain with a
// real inbox, list your real hosting providers, and have a lawyer review it.
//
// The page is static (nothing read per request), so it's prerendered.

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND.name} collects, uses and protects your data and your contacts' data.`,
  alternates: { canonical: "/privacy" },
};

const CONTACT_EMAIL = "privacy@your-domain";
const L = TRANSACTIONAL_LIMITS;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="[date]"
      intro={
        <p>
          {BRAND.name} is a free email marketing tool. You connect your own sending provider, and we give you the
          tools to manage contacts and send email through it. This page explains what data we keep, why, and the
          choices you have.
        </p>
      }
    >
      <h2>Who this covers</h2>
      <p>There are two kinds of people whose data we handle:</p>
      <ul>
        <li>
          <strong>You, our user.</strong> For your account details, {BRAND.name} ([company name, address]) is the
          data controller.
        </li>
        <li>
          <strong>Your contacts</strong>, the people on the lists you upload. For their data, <em>you</em> are the
          controller and we are your processor: we only use it to provide the service to you, following your
          instructions.
        </li>
      </ul>

      <h2>What we store</h2>
      <h3>Your account</h3>
      <ul>
        <li>Your name, email address and a securely hashed password (we never store the password itself).</li>
        <li>Whether your email address is verified, and which workspaces you belong to.</li>
        <li>
          If you log in with Google: the name, email address and profile picture Google shares with us, and the sign-in
          tokens Google gives us (stored encrypted). We don&apos;t ask Google for anything else, so we can&apos;t see
          your Gmail, contacts or files.
        </li>
        <li>For each login session: the IP address and browser type, so you can stay logged in and we can spot misuse.</li>
      </ul>

      <h3>Your workspace</h3>
      <ul>
        <li>Lists, segments, custom fields, templates, campaigns, automations, sign-up forms and brand kit settings.</li>
        <li>Images and files you upload to use in your emails.</li>
        <li>API keys you create (stored so we can check them, not so we can show them again).</li>
      </ul>

      <h3>Contacts you upload (as your processor)</h3>
      <ul>
        <li>Email addresses, names and any custom fields you add.</li>
        <li>List membership, subscription status and consent records (for example, double opt-in confirmations).</li>
        <li>Email activity: deliveries, opens, clicks, bounces, complaints and unsubscribes.</li>
      </ul>

      <h3>Your sending provider credentials</h3>
      <p>
        API keys and SMTP passwords for your provider are encrypted (AES-256-GCM) before they are saved, are only
        decrypted to send your email, and are never shown again in the app.
      </p>

      <h3>Logs</h3>
      <ul>
        <li>Records of the emails sent from your workspace, so you can see what was delivered and why something failed.</li>
        <li>
          For the transactional email API, the full email content is kept for {L.contentRetentionDays} days, then
          cleared. The log entry (who, when, status) is deleted after {L.logRetentionDays} days.
        </li>
        <li>Basic security and error logs from our servers.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the service: log you in, store your work and send your emails through your provider.</li>
        <li>To keep it safe: prevent spam and abuse, and protect accounts.</li>
        <li>To contact you about your account, for example to verify your email or reset your password.</li>
      </ul>
      <p>
        We don&apos;t sell your data or your contacts&apos; data, and we don&apos;t use it for advertising.
      </p>

      <h2>Cookies</h2>
      <p>
        We only use cookies that are needed for the service to work: one to keep you logged in, and one to remember
        which workspace you have open. We don&apos;t use advertising or analytics cookies. The API docs page also
        remembers your preferred code language in your browser&apos;s storage; it never leaves your device.
      </p>

      <h2>Who else receives data (sub-processors)</h2>
      <ul>
        <li>
          <strong>Your chosen sending provider</strong> (for example Amazon SES, Resend, SendGrid, Mailgun, Postmark
          or your SMTP server). When you send, they receive the recipient&apos;s address and the email content. Their
          own privacy policy and terms apply, under your account with them.
        </li>
        <li>
          <strong>[Hosting provider]</strong> and <strong>[database provider]</strong>, which run our servers and
          store data in [region].
        </li>
      </ul>
      <p>We may also disclose data if the law requires it.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account and workspace data: for as long as your account exists.</li>
        <li>
          Transactional email content: {L.contentRetentionDays} days. Transactional log entries:{" "}
          {L.logRetentionDays} days.
        </li>
        <li>
          Suppressed addresses (unsubscribes, bounces and complaints) are kept while your workspace exists, so
          those people are never emailed again by mistake.
        </li>
        <li>When an account is deleted, its data is removed within [30] days, and from backups within [90] days.</li>
      </ul>

      <h2>Your rights (GDPR and similar laws)</h2>
      <p>
        You can ask to access, correct, delete or export your personal data, to restrict or object to how we use
        it, and you can complain to your local data protection authority.
      </p>
      <ul>
        <li>
          <strong>Users:</strong> you can change most details yourself in the app. For anything else, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We&apos;ll reply within 30 days.
        </li>
        <li>
          <strong>Contacts of a {BRAND.name} user:</strong> please contact the sender who emailed you first; they
          control your data and can export or erase it from their workspace. Every marketing email also has an
          unsubscribe link. If you can&apos;t reach them, email us and we&apos;ll help.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Each workspace&apos;s data is kept separate, and every request checks that you belong to the workspace.
        Passwords are hashed, provider credentials are encrypted, and connections use HTTPS. No system is perfect,
        so if we learn of a breach affecting your data we&apos;ll tell you without undue delay.
      </p>

      <h2>Children</h2>
      <p>{BRAND.name} isn&apos;t meant for children under 16, and we don&apos;t knowingly collect their data.</p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top. For important changes, we&apos;ll also
        email account owners before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
