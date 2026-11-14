import type { Metadata } from "next";
import Link from "next/link";
import { InlineContactEmail } from "@/components/landing/contact-email";
import { LegalPage } from "@/components/landing/legal-page";
import { BRAND } from "@/lib/brand";
import { TRANSACTIONAL_LIMITS } from "@/lib/transactional/schema";

// Klyve's privacy policy, in plain English, written for how Klyve actually
// runs (one AWS server in Mumbai, Amazon SES for our own emails, Groq for AI
// help, Google sign-in). It isn't legal advice: if Klyve grows, have a lawyer
// review it. Update LAST_UPDATED (and email users about big changes) whenever
// it changes, e.g. when a new service starts receiving data.
//
// The contact address comes from CONTACT_EMAIL (never written in the code, as
// the repository is public) and is shown scrambled to spam bots.

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND.name} collects, uses and protects your data and your contacts' data.`,
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "15 November 2026";
const L = TRANSACTIONAL_LIMITS;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          {BRAND.name} is a free email marketing tool, run by Srushti Khandelwal, an independent developer based in
          India. You connect your own sending provider, and we give you the tools to manage contacts and send email
          through it. This page explains what data we keep, why, and the choices you have.
        </p>
      }
    >
      <h2>Who this covers</h2>
      <p>There are two kinds of people whose data we handle:</p>
      <ul>
        <li>
          <strong>You, our user.</strong> For your account details, {BRAND.name} (run by Srushti Khandelwal, India) is
          the data controller. In this policy, &quot;we&quot; and &quot;us&quot; means {BRAND.name}.
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
        <li>A count of how often your workspace uses the AI writing help (not the text itself), to apply usage limits.</li>
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
        We only use cookies that are needed for the service to work: one to keep you logged in, one to remember which
        workspace you have open, and short-lived ones while you log in (for two-step login and for signing in with
        Google). If you choose &quot;trust this device&quot; at two-step login, a cookie remembers that for 30 days.
        We don&apos;t use advertising or analytics cookies. The API docs page also remembers your preferred code
        language in your browser&apos;s storage; it never leaves your device.
      </p>

      <h2>Who else receives data (sub-processors)</h2>
      <ul>
        <li>
          <strong>Your chosen sending provider</strong> (for example Amazon SES, Resend, SendGrid, Mailgun, Postmark
          or your SMTP server). When you send, they receive the recipient&apos;s address and the email content. Their
          own privacy policy and terms apply, under your account with them.
        </li>
        <li>
          <strong>Amazon Web Services (AWS)</strong> runs our server and database in Mumbai, India. Everything
          described in this policy is stored there.
        </li>
        <li>
          <strong>Amazon SES</strong> (part of AWS) sends {BRAND.name}&apos;s own emails to you: email verification,
          password resets and team invitations. It receives your email address and that email.
        </li>
        <li>
          <strong>Groq, Inc.</strong> (United States) powers the optional AI writing help. Only when you use an AI
          feature, the text you typed and the details that request needs (for example a campaign&apos;s subject, or
          the numbers in a report you ask it to explain) are sent to Groq to write the answer. We don&apos;t keep that
          text.
        </li>
        <li>
          <strong>Google</strong>, only if you choose &quot;Continue with Google&quot; to log in (see above).
        </li>
        <li>
          <strong>ImprovMX</strong> forwards emails you send to our contact address to our inbox.
        </li>
      </ul>
      <p>
        Because our servers are in India, your data is processed in India, wherever you live. We may also disclose
        data if the law requires it.
      </p>

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
        <li>
          When you delete your account (Settings → Profile), your login and the workspaces only you use are deleted
          straight away; workspaces you share with others stay for them. If you ask us by email instead, we do it
          within 30 days. Copies in our nightly backups are gone within 14 days after that.
        </li>
      </ul>

      <h2>Your rights (GDPR, India&apos;s DPDP Act and similar laws)</h2>
      <p>
        You can ask to access, correct, delete or export your personal data, to restrict or object to how we use
        it, and you can complain to your local data protection authority.
      </p>
      <ul>
        <li>
          <strong>Users:</strong> you can change most details yourself in the app, and delete your account in
          Settings → Profile. For anything else, email <InlineContactEmail />. We&apos;ll reply within 30 days.
        </li>
        <li>
          <strong>Contacts of a {BRAND.name} user:</strong> please contact the sender who emailed you first; they
          control your data and can export or erase it from their workspace. Every marketing email also has an
          unsubscribe link. If you can&apos;t reach them, email us and we&apos;ll help.
        </li>
        <li>
          <strong>In India:</strong> the same address is our contact for grievances under the Digital Personal Data
          Protection Act, 2023.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Each workspace&apos;s data is kept separate, and every request checks that you belong to the workspace.
        Passwords are hashed, provider credentials are encrypted, and connections use HTTPS. No system is perfect,
        so if we learn of a breach affecting your data we&apos;ll tell you without undue delay.
      </p>

      <h2>Children</h2>
      <p>
        {BRAND.name} is meant for adults (18 or older), and we don&apos;t knowingly collect data from anyone younger.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we&apos;ll update the date at the top. For important changes, we&apos;ll also
        email account owners before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Email <InlineContactEmail />. See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
