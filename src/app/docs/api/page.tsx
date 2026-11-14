import type { Metadata } from "next";
import Link from "next/link";
import { BaseUrl, CodeBlock, CodeTabs } from "@/components/transactional/code";
import { BASE_URL_TOKEN, sendEmailSnippet, type SnippetLang } from "@/components/transactional/snippets";
import { TRANSACTIONAL_STATUS_META } from "@/components/transactional/status";
import { BRAND } from "@/lib/brand";
import { API_ERROR_CODES, TRANSACTIONAL_LIMITS as L, TRANSACTIONAL_STATUSES } from "@/lib/transactional/schema";
import { DocsMobileNav, DocsSideNav, type DocsSection } from "./docs-nav";
import { C, Callout, DocSection, DocTable, Endpoint, FieldList, H3 } from "./parts";

// The public developer documentation for the transactional API.
//
// It's a STATIC page: no login, no cookies, no database. Next.js builds it
// once and serves it instantly, so it's safe to share with any developer.
// Every number on it (limits, error codes) comes from
// src/lib/transactional/schema.ts, the same file the API itself uses, so
// the docs can't drift from the real rules.

const DOCS_DESCRIPTION = `Send receipts, password resets and other one-to-one emails from your app through ${BRAND.name}.`;

export const metadata: Metadata = {
  title: "Transactional email API",
  description: DOCS_DESCRIPTION,
  alternates: { canonical: "/docs/api" },
};

const SECTIONS: DocsSection[] = [
  { id: "introduction", title: "Introduction", group: "Get started" },
  { id: "authentication", title: "Authentication", group: "Get started" },
  { id: "quick-start", title: "Quick start", group: "Get started" },
  { id: "send-email", title: "Sending an email", group: "Emails" },
  { id: "merge-tags", title: "Merge tags", group: "Emails" },
  { id: "templates", title: "Using a template", group: "Emails" },
  { id: "idempotency", title: "Idempotency", group: "Emails" },
  { id: "statuses", title: "Email statuses", group: "Emails" },
  { id: "read-emails", title: "Reading emails", group: "Emails" },
  { id: "contacts", title: "Contacts", group: "More endpoints" },
  { id: "senders-templates", title: "Senders & templates", group: "More endpoints" },
  { id: "me", title: "/me", group: "More endpoints" },
  { id: "errors", title: "Errors", group: "Reference" },
  { id: "rate-limits", title: "Rate limits", group: "Reference" },
  { id: "good-practices", title: "Good practices", group: "Reference" },
];

const n = (v: number) => v.toLocaleString("en");

/** Every language for one example (the quick start). */
function allLangs(make: (lang: SnippetLang) => string): Record<SnippetLang, string> {
  return { curl: make("curl"), node: make("node"), python: make("python"), php: make("php") };
}

const AUTH_HEADER = "Authorization: Bearer klv_3fA9x2…";

const EXAMPLE_EMAIL = {
  id: "cm4x8b2k10003qz8l2v6e9d1a",
  object: "email",
  status: "queued",
  to: { email: "anita@example.com", name: "Anita" },
  from: { email: "hello@yourshop.com", name: "Your Shop" },
  replyTo: null,
  subject: "Your order has shipped",
  templateId: null,
  tags: ["shipping"],
  metadata: { orderId: "1234" },
  error: null,
  createdAt: "2026-11-13T09:30:00.000Z",
  sentAt: null,
};

const FULL_REQUEST = {
  from: { email: "hello@yourshop.com", name: "Your Shop" },
  to: { email: "anita@example.com", name: "Anita" },
  replyTo: "support@yourshop.com",
  subject: "Your order #{{ params.order_id }} has shipped",
  html: "<h1>Hi {{ params.name | default: \"there\" }}!</h1><p>Track it here: {{ params.tracking_url }}</p>",
  text: "Hi {{ params.name | default: \"there\" }}! Track it here: {{ params.tracking_url }}",
  params: { name: "Anita", order_id: 1234, tracking_url: "https://track.example/abc" },
  tags: ["shipping"],
  metadata: { orderId: "1234" },
};

const TEMPLATE_REQUEST = {
  from: "Your Shop <hello@yourshop.com>",
  to: "anita@example.com",
  templateId: "cm4tq0x8n0001abcd2efgh345",
  params: { name: "Anita", reset_url: "https://yourshop.com/reset?token=..." },
};

const ERROR_TEXT: Record<keyof typeof API_ERROR_CODES, string> = {
  invalid_request:
    "The body isn't JSON (or Content-Type isn't application/json), is too large, or a field is missing or wrong. details lists each problem.",
  unauthorized: "The API key is missing, mistyped or revoked.",
  forbidden: "The key is fine, but this action isn't allowed (for example, the account's email isn't verified yet).",
  not_found: "No email, template or contact with that id in your workspace.",
  sender_not_verified: '"from" isn\'t a verified sender of your workspace. Verify it under Settings → Senders.',
  no_provider: "Your workspace has no working sending provider. Connect one under Settings → Sending providers.",
  idempotency_conflict: "You reused an Idempotency-Key with a different body.",
  method_not_allowed: "The endpoint exists but not with this method (e.g. DELETE a contact). The Allow header lists the methods it accepts.",
  rate_limited: "Too many requests. Wait for the number of seconds in the Retry-After header.",
  internal_error: "Something broke on our side. It's safe to retry with the same Idempotency-Key.",
};

const j = (v: unknown) => JSON.stringify(v, null, 2);
const shellBody = (v: unknown) => `'${j(v).replace(/\n/g, "\n  ").replace(/'/g, `'\\''`)}'`;

export default function ApiDocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl gap-10 px-4 py-8 sm:px-6 lg:py-12">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8">
          <DocsSideNav sections={SECTIONS} />
        </div>
      </aside>

      <main className="flex min-w-0 max-w-3xl flex-1 flex-col gap-10">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium text-emerald-700">Developer docs</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Transactional email API</h1>
          <p className="text-base leading-7 text-zinc-600 sm:text-lg">
            Send receipts, password resets, order updates and other one-to-one emails straight from your app. They go
            out through your own sending provider, with your verified senders, and every email shows up in your{" "}
            {BRAND.name} logs.
          </p>
        </header>

        <DocsMobileNav sections={SECTIONS} />

        {/* ── Introduction ─────────────────────────────────────────────── */}
        <DocSection id="introduction" title="Introduction">
          <p>
            The API is a small REST API that speaks JSON over HTTPS. Every request goes to this base URL:
          </p>
          <CodeBlock code={`${BASE_URL_TOKEN}/api/v1`} title="Base URL" what="Base URL" />
          <p>
            Campaigns are for sending one email to many people. The transactional API is for the opposite: one email to
            one person, triggered by something they did in your app. A typical flow:
          </p>
          <ol className="ml-5 list-decimal space-y-1.5 marker:text-zinc-400">
            <li>
              Your server calls <C>POST /api/v1/emails</C> with who it&apos;s for and what to say.
            </li>
            <li>
              We check it, save it and answer right away with the email&apos;s <C>id</C> and status <C>queued</C>.
            </li>
            <li>A few seconds later it&apos;s sent through your sending provider. You can see it under Transactional in the dashboard.</li>
          </ol>
          <p>
            Bodies are JSON (send <C>Content-Type: application/json</C>), dates are ISO 8601 in UTC, and ids are opaque
            strings.
          </p>
        </DocSection>

        {/* ── Authentication ───────────────────────────────────────────── */}
        <DocSection id="authentication" title="Authentication">
          <p>
            Every request needs an API key. Create one under{" "}
            <Link href="/settings/api" className="font-medium text-emerald-700 underline underline-offset-2">
              Settings → API keys
            </Link>{" "}
            (owners and admins can do this) and send it in the <C>Authorization</C> header:
          </p>
          <CodeBlock code={AUTH_HEADER} title="Header" what="Header" />
          <p>
            Keys start with <C>klv_</C> followed by 40 letters and digits. A key belongs to one workspace and can do
            anything the API allows in that workspace. You can have up to {L.keysPerWorkspace} active keys per workspace,
            so give each app its own key and revoke it alone if it ever leaks.
          </p>
          <Callout tone="warn" title="Keep keys secret">
            Use keys only on your server. Never put them in website or mobile app code, and never commit them to a public
            repository. Store them in an environment variable such as <C>KLYVE_API_KEY</C>. We only keep a fingerprint of
            each key, so we can&apos;t show it to you again: if you lose one, create a new one and revoke the old one.
          </Callout>
          <p>
            If your tool can&apos;t set the <C>Authorization</C> header, send the key as <C>X-API-Key: klv_…</C> instead.
            A missing, mistyped or revoked key gets a <C>401</C> with the code <C>unauthorized</C>. Until the
            workspace owner has verified their own email address, every request gets <C>403 forbidden</C>.
          </p>
        </DocSection>

        {/* ── Quick start ──────────────────────────────────────────────── */}
        <DocSection id="quick-start" title="Quick start">
          <p>Five minutes from zero to an email in your inbox:</p>
          <ol className="ml-5 list-decimal space-y-1.5 marker:text-zinc-400">
            <li>
              Connect a <Link href="/settings/providers" className="font-medium text-emerald-700 underline underline-offset-2">sending provider</Link>{" "}
              and verify a <Link href="/settings/senders" className="font-medium text-emerald-700 underline underline-offset-2">sender address</Link>{" "}
              (if you already send campaigns, you&apos;ve done this).
            </li>
            <li>
              Create an <Link href="/settings/api" className="font-medium text-emerald-700 underline underline-offset-2">API key</Link> and
              save it as <C>KLYVE_API_KEY</C> on your server.
            </li>
            <li>
              Run this, with <C>from</C> changed to your verified sender and <C>to</C> changed to your own address:
            </li>
          </ol>
          <CodeTabs snippets={allLangs((lang) => sendEmailSnippet(lang))} />
          <p>
            You get back <C>202 Accepted</C> and the email object. Open Transactional in the dashboard to watch it go from{" "}
            <C>queued</C> to <C>sent</C>.
          </p>
          <CodeBlock code={j(EXAMPLE_EMAIL)} title="Response · 202 Accepted" what="Response" />
        </DocSection>

        {/* ── Sending an email ─────────────────────────────────────────── */}
        <DocSection id="send-email" title="Sending an email">
          <Endpoint method="POST" path="/api/v1/emails">
            Sends one email to one recipient
          </Endpoint>
          <p>The request body. Fields you don&apos;t know about are rejected, so typos are caught early.</p>
          <FieldList
            fields={[
              {
                name: "from",
                type: "string | { email, name }",
                required: true,
                children: (
                  <>
                    Must be a <strong className="font-medium text-zinc-800">verified sender</strong> of your workspace.
                    Write it as <C>&quot;hello@shop.com&quot;</C>, <C>&quot;Shop &lt;hello@shop.com&gt;&quot;</C> or{" "}
                    <C>{`{ "email": "hello@shop.com", "name": "Shop" }`}</C>. A name replaces the sender&apos;s
                    display name for this email (up to 70 characters, and it can&apos;t look like an email address).
                    Leave it out to use the sender&apos;s own name.
                  </>
                ),
              },
              {
                name: "to",
                type: "string | { email, name }",
                required: true,
                children: <>One recipient, in the same formats as <C>from</C>. To email several people, make one request each.</>,
              },
              {
                name: "subject",
                type: "string",
                required: "required without templateId",
                children: (
                  <>
                    Up to {n(L.subjectMax)} characters, no line breaks. Can use merge tags. With a template, leave it
                    out to use the template&apos;s subject.
                  </>
                ),
              },
              {
                name: "html",
                type: "string",
                required: "html or text, or templateId",
                children: (
                  <>
                    The HTML body, up to {n(L.htmlMax)} characters. Can use merge tags. For safety it&apos;s cleaned
                    like the editor&apos;s HTML block: scripts, forms, frames and <C>&lt;style&gt;</C>/<C>&lt;head&gt;</C>{" "}
                    tags are removed, so put CSS inline (<C>style=&quot;…&quot;</C>), which email apps prefer anyway.
                  </>
                ),
              },
              {
                name: "text",
                type: "string",
                children: (
                  <>
                    The plain-text body, up to {n(L.textMax)} characters. If you only send <C>html</C>, we make the
                    text version from it; if you only send <C>text</C>, we make a simple HTML version from it.
                  </>
                ),
              },
              {
                name: "templateId",
                type: "string",
                children: (
                  <>
                    Send one of your saved templates instead of <C>html</C>/<C>text</C> (not both). See{" "}
                    <a href="#templates" className="text-emerald-700 underline underline-offset-2">Using a template</a>.
                  </>
                ),
              },
              {
                name: "params",
                type: "object",
                children: (
                  <>
                    Values for <C>{"{{ params.* }}"}</C> merge tags, e.g. <C>{`{ "order_id": 1234 }`}</C>. Up to{" "}
                    {n(L.paramsMaxBytes)} bytes as JSON.
                  </>
                ),
              },
              {
                name: "replyTo",
                type: "string | { email, name }",
                children: <>Where replies go. Defaults to the sender&apos;s reply-to address.</>,
              },
              {
                name: "tags",
                type: "string[]",
                children: (
                  <>
                    Up to {L.tagsMax} labels to group and filter emails, e.g. <C>[&quot;receipt&quot;]</C>. Each up to{" "}
                    {L.tagMax} characters of letters, numbers and <C>_ . : -</C>.
                  </>
                ),
              },
              {
                name: "metadata",
                type: "object",
                children: (
                  <>
                    Your own data (an order id, a user id…), up to {n(L.metadataMaxBytes)} bytes as JSON. It&apos;s
                    never put in the email; you get it back when you read the email.
                  </>
                ),
              },
            ]}
          />
          <H3>Headers</H3>
          <FieldList
            fields={[
              { name: "Authorization", type: "Bearer klv_…", required: true, children: "Your API key." },
              { name: "Content-Type", type: "application/json", required: true, children: "The body is JSON." },
              {
                name: "Idempotency-Key",
                type: "string",
                children: (
                  <>
                    Up to {L.idempotencyKeyMax} printable characters. Makes retries safe: see{" "}
                    <a href="#idempotency" className="text-emerald-700 underline underline-offset-2">Idempotency</a>.
                  </>
                ),
              },
            ]}
          />
          <H3>A full example</H3>
          <CodeBlock
            title="Request"
            code={[
              `curl -X POST ${BASE_URL_TOKEN}/api/v1/emails \\`,
              `  -H "Authorization: Bearer $KLYVE_API_KEY" \\`,
              `  -H "Content-Type: application/json" \\`,
              `  -H "Idempotency-Key: order-1234-shipped" \\`,
              `  -d ${shellBody(FULL_REQUEST)}`,
            ].join("\n")}
          />
          <p>
            The answer is <C>202 Accepted</C> with the <a href="#read-emails" className="text-emerald-700 underline underline-offset-2">email object</a>{" "}
            and a <C>Location</C> header pointing at it. &quot;Accepted&quot; means we saved it and will send it within a
            few seconds; check its status to know how it went. Transactional emails have no open or click tracking.
          </p>
          <Callout title="How long we keep emails">
            The full content (HTML and text) is kept for {L.contentRetentionDays} days so you can check what was sent,
            then cleared for privacy. The log entry (who, when, status) stays for {L.logRetentionDays} days.
          </Callout>
        </DocSection>

        {/* ── Merge tags ───────────────────────────────────────────────── */}
        <DocSection id="merge-tags" title="Merge tags">
          <p>
            The subject, HTML and text can contain merge tags in double curly braces. They&apos;re filled in for each
            email, so one template works for every customer.
          </p>
          <DocTable
            head={["Tag", "Becomes"]}
            rows={[
              [<C key="p">{"{{ params.order_id }}"}</C>, <>The value you sent in <C>params</C>.</>],
              [
                <C key="c">{"{{ contact.FIRSTNAME }}"}</C>,
                <>
                  A field of the recipient&apos;s contact in your workspace (<C>EMAIL</C>, <C>FIRSTNAME</C>,{" "}
                  <C>LASTNAME</C> or any custom field such as <C>CITY</C>). If they aren&apos;t a contact, only{" "}
                  <C>contact.EMAIL</C> is set.
                </>,
              ],
              [<C key="w">{"{{ workspace.name }}"}</C>, "Your workspace's name."],
              [<C key="y">{"{{ current_year }}"}</C>, "The current year, e.g. for a footer."],
            ]}
          />
          <p>
            A tag with no value becomes empty text. Give it a fallback with <C>default</C>:
          </p>
          <CodeBlock code={`Hi {{ params.name | default: "there" }},`} title="Default values" />
          <p>
            Values are inserted safely: in HTML they&apos;re escaped, so a customer named <C>&lt;b&gt;Ann&lt;/b&gt;</C>{" "}
            shows up as exactly that text instead of breaking your email. Merge tags use the Liquid syntax, the same as
            in your templates.
          </p>
        </DocSection>

        {/* ── Templates ────────────────────────────────────────────────── */}
        <DocSection id="templates" title="Using a template">
          <p>
            Design the email once in the {BRAND.name} editor (Templates), then send it with <C>templateId</C> and your{" "}
            <C>params</C>. Put merge tags like <C>{"{{ params.reset_url }}"}</C> in the template where the values go.
          </p>
          <CodeBlock title="Request body" code={j(TEMPLATE_REQUEST)} />
          <ul className="ml-5 list-disc space-y-1.5 marker:text-zinc-400">
            <li>
              Find a template&apos;s id in the dashboard or with{" "}
              <a href="#senders-templates" className="text-emerald-700 underline underline-offset-2"><C>GET /api/v1/templates</C></a>.
            </li>
            <li>
              Leave out <C>subject</C> to use the template&apos;s subject, or send one to override it.
            </li>
            <li>
              Don&apos;t send <C>html</C> or <C>text</C> with a template: that&apos;s a <C>400 invalid_request</C>.
            </li>
            <li>The email is built from the template as it is at the moment you call the API, so edits apply to the next email.</li>
          </ul>
        </DocSection>

        {/* ── Idempotency ──────────────────────────────────────────────── */}
        <DocSection id="idempotency" title="Idempotency">
          <p>
            Networks fail. If your request times out, you can&apos;t know whether the email was accepted. Send an{" "}
            <C>Idempotency-Key</C> header and retrying becomes safe: the same key always means the same email, sent at
            most once.
          </p>
          <CodeBlock code={"Idempotency-Key: order-1234-receipt"} title="Header" />
          <ul className="ml-5 list-disc space-y-1.5 marker:text-zinc-400">
            <li>
              Use something unique to the event, like the order id plus the email type. Up to {L.idempotencyKeyMax}{" "}
              printable characters.
            </li>
            <li>
              Same key and same body again: you get the original email back (status <C>200</C>) and nothing new is sent.
            </li>
            <li>
              Same key with a different body: <C>409 idempotency_conflict</C>, because that&apos;s almost always a bug.
            </li>
            <li>Keys are remembered per workspace for as long as the email&apos;s log entry exists ({L.logRetentionDays} days).</li>
          </ul>
        </DocSection>

        {/* ── Statuses ─────────────────────────────────────────────────── */}
        <DocSection id="statuses" title="Email statuses">
          <p>
            An email&apos;s <C>status</C> tells you where it is. When something went wrong, <C>error</C> says why in plain
            English.
          </p>
          <DocTable
            head={["Status", "What it means"]}
            rows={TRANSACTIONAL_STATUSES.map((s) => [
              <C key={s}>{s.toLowerCase()}</C>,
              TRANSACTIONAL_STATUS_META[s].meaning,
            ])}
          />
          <H3>Who we won&apos;t email</H3>
          <p>
            Transactional emails are things people expect, like receipts and password resets, so the rules are gentler
            than for campaigns:
          </p>
          <ul className="ml-5 list-disc space-y-1.5 marker:text-zinc-400">
            <li>
              <strong className="font-medium text-zinc-800">Unsubscribed contacts still get transactional email.</strong>{" "}
              Unsubscribing stops marketing, not their receipts.
            </li>
            <li>
              Addresses that <strong className="font-medium text-zinc-800">hard-bounced</strong>, people who{" "}
              <strong className="font-medium text-zinc-800">marked your email as spam</strong>, people whose data was{" "}
              <strong className="font-medium text-zinc-800">erased</strong> (privacy request) and addresses your team
              added to the suppression list by hand are not emailed. The email is saved with status <C>suppressed</C>{" "}
              and <C>error</C> says why. The API still answers <C>202</C>, so your app doesn&apos;t need special
              handling. (The content of an email to an erased person isn&apos;t kept.)
            </li>
          </ul>
        </DocSection>

        {/* ── Reading emails ───────────────────────────────────────────── */}
        <DocSection id="read-emails" title="Reading emails">
          <Endpoint method="GET" path="/api/v1/emails/{id}">
            One email
          </Endpoint>
          <Endpoint method="GET" path="/api/v1/emails">
            Your emails, newest first
          </Endpoint>
          <p>Both return the email object (the list wraps them in <C>data</C>):</p>
          <FieldList
            fields={[
              { name: "id", type: "string", children: "The email's id." },
              { name: "object", type: '"email"', children: "Always \"email\"." },
              { name: "status", type: "string", children: <>One of the <a href="#statuses" className="text-emerald-700 underline underline-offset-2">statuses</a>, in lower case.</> },
              { name: "to / from", type: "{ email, name }", children: "The recipient and sender (name may be missing)." },
              { name: "replyTo", type: "string | null", children: "The reply-to address, if any." },
              { name: "subject", type: "string", children: "The final subject, with merge tags filled in." },
              { name: "templateId", type: "string | null", children: "The template used, if any." },
              { name: "tags", type: "string[]", children: "Your tags." },
              { name: "metadata", type: "object | null", children: "Your metadata, exactly as you sent it." },
              { name: "error", type: "string | null", children: "Why it failed, was suppressed or bounced." },
              { name: "createdAt", type: "string", children: "When we accepted it (ISO 8601, UTC)." },
              { name: "sentAt", type: "string | null", children: "When your provider accepted it." },
            ]}
          />
          <H3>Listing and pagination</H3>
          <p>The list takes these optional query parameters:</p>
          <FieldList
            fields={[
              { name: "limit", type: "number", children: "How many to return, 1 to 100 (default 20)." },
              { name: "cursor", type: "string", children: <>The <C>nextCursor</C> from the previous page.</> },
              { name: "status", type: "string", children: <>Only this status, e.g. <C>failed</C>.</> },
              { name: "to", type: "string", children: "Only emails to this address." },
              { name: "tag", type: "string", children: "Only emails with this tag." },
            ]}
          />
          <CodeBlock
            title="Request"
            code={`curl "${BASE_URL_TOKEN}/api/v1/emails?limit=2&status=sent" \\\n  -H "Authorization: Bearer $KLYVE_API_KEY"`}
          />
          <CodeBlock
            title="Response · 200 OK"
            code={j({ object: "list", data: [{ ...EXAMPLE_EMAIL, status: "sent", sentAt: "2026-11-13T09:30:04.000Z" }, "…"], nextCursor: "cm4x7z…" })}
          />
          <p>
            When <C>nextCursor</C> is <C>null</C> you&apos;ve reached the end. Otherwise pass it as <C>cursor</C> (with
            the same filters) to get the next page. Unknown query parameters are a <C>400</C>, so typos don&apos;t
            silently return everything. Unknown ids, and ids from another workspace, get <C>404 not_found</C>.
          </p>
        </DocSection>

        {/* ── Contacts ─────────────────────────────────────────────────── */}
        <DocSection id="contacts" title="Contacts">
          <p>
            Keep your {BRAND.name} contacts in sync with your app, for example when someone signs up. Their fields are then
            available as <C>{"{{ contact.* }}"}</C> merge tags in transactional emails and campaigns.
          </p>
          <Endpoint method="POST" path="/api/v1/contacts">
            Create or update a contact
          </Endpoint>
          <FieldList
            fields={[
              { name: "email", type: "string", required: true, children: "Finds the contact by email. If there's none, it's created." },
              { name: "firstName / lastName", type: "string | null", children: "Up to 100 characters each." },
              {
                name: "attributes",
                type: "object",
                children: (
                  <>
                    Custom fields by key, e.g. <C>{`{ "CITY": "Pune", "AGE": 31 }`}</C>. Each field must already exist
                    (Contacts → Attributes). <C>null</C> clears a value; fields you leave out stay as they are.
                  </>
                ),
              },
              { name: "listIds", type: "string[]", children: "Lists to add the contact to (up to 50). It's never removed from other lists." },
              {
                name: "status",
                type: '"subscribed" | "unsubscribed"',
                children: (
                  <>
                    Leave it out and new contacts are subscribed. <C>&quot;unsubscribed&quot;</C> unsubscribes an
                    existing contact (or creates one that doesn&apos;t get campaigns).
                  </>
                ),
              },
              {
                name: "updateExisting",
                type: "boolean",
                children: <>Default <C>true</C>. Set <C>false</C> to only create: an existing contact is then left untouched.</>,
              },
            ]}
          />
          <CodeBlock
            title="Request body"
            code={j({ email: "anita@example.com", firstName: "Anita", attributes: { CITY: "Pune" }, listIds: ["cm4list0001abcd"] })}
          />
          <p>
            The answer is <C>201 Created</C> for a new contact or <C>200 OK</C> for an update, with the contact. When we
            kept something as it was, a <C>note</C> explains why:
          </p>
          <CodeBlock
            title="Response · 200 OK"
            code={j({
              id: "cm4c0ntact01abcd",
              object: "contact",
              email: "anita@example.com",
              firstName: "Anita",
              lastName: null,
              status: "unsubscribed",
              attributes: { CITY: "Pune" },
              listIds: ["cm4list0001abcd"],
              createdAt: "2026-10-02T08:12:00.000Z",
              updatedAt: "2026-11-13T09:30:00.000Z",
              note: "This contact unsubscribed, so the API can't subscribe them again. They can re-subscribe themselves through a sign-up form or the preference centre.",
            })}
          />
          <Callout title="Consent stays in the contact's hands">
            The API never re-subscribes someone who unsubscribed, bounced or complained, and it won&apos;t add an address
            that&apos;s on your suppression list. If your workspace uses double opt-in, new contacts start as{" "}
            <C>pending</C> and get the confirmation email first, just like with a sign-up form. Every subscription is
            recorded in the contact&apos;s consent history as coming from the API. Contacts can&apos;t be deleted with an
            API key; do that in the dashboard.
          </Callout>
          <Endpoint method="GET" path="/api/v1/contacts/{id or email}">
            Read one contact
          </Endpoint>
          <p>
            Use the contact&apos;s id or its email address (URL-encoded, e.g. <C>anita%40example.com</C>). Returns the
            contact as above (without <C>note</C>), or <C>404 not_found</C>.
          </p>
        </DocSection>

        {/* ── Senders & templates ──────────────────────────────────────── */}
        <DocSection id="senders-templates" title="Senders & templates">
          <Endpoint method="GET" path="/api/v1/senders">
            Your verified senders
          </Endpoint>
          <p>The addresses you can use as <C>from</C>.</p>
          <CodeBlock
            title="Response · 200 OK"
            code={j({ object: "list", data: [{ object: "sender", id: "cm4s3nder01abcd", email: "hello@yourshop.com", name: "Your Shop" }] })}
          />
          <Endpoint method="GET" path="/api/v1/templates">
            Your templates
          </Endpoint>
          <p>
            Most recently edited first, to pick a <C>templateId</C>. Takes <C>limit</C> (1 to 100, default 20) and{" "}
            <C>cursor</C>, and pages with <C>nextCursor</C> like the email list.
          </p>
          <CodeBlock
            title="Response · 200 OK"
            code={j({
              object: "list",
              data: [{ object: "template", id: "cm4tq0x8n0001abcd2efgh345", name: "Password reset", subject: "Reset your password", updatedAt: "2026-11-10T14:03:00.000Z" }],
              nextCursor: null,
            })}
          />
        </DocSection>

        {/* ── /me ──────────────────────────────────────────────────────── */}
        <DocSection id="me" title="/me">
          <Endpoint method="GET" path="/api/v1/me">
            Check your key
          </Endpoint>
          <p>
            Returns the workspace and the key you&apos;re using. A quick way to test that a key works before you send
            anything:
          </p>
          <CodeBlock code={`curl ${BASE_URL_TOKEN}/api/v1/me \\\n  -H "Authorization: Bearer $KLYVE_API_KEY"`} title="Request" />
          <CodeBlock
            title="Response · 200 OK"
            code={j({ workspace: { id: "cm4w0rkspace1abc", name: "Your Shop" }, apiKey: { id: "cm4k3y0001abcd", name: "Shop backend", prefix: "klv_3fA9x2" } })}
          />
        </DocSection>

        {/* ── Errors ───────────────────────────────────────────────────── */}
        <DocSection id="errors" title="Errors">
          <p>
            Errors use normal HTTP status codes and always have the same JSON shape, with a stable <C>code</C> your
            code can check and a <C>message</C> written for people.
          </p>
          <CodeBlock
            title="Response · 400 Bad Request"
            code={j({
              error: {
                code: "invalid_request",
                message: "Some fields are missing or invalid. See details.",
                details: [{ path: "subject", message: "A subject is required (unless you use a template)." }],
              },
            })}
          />
          <DocTable
            head={["HTTP", "code", "When"]}
            rows={(Object.keys(API_ERROR_CODES) as (keyof typeof API_ERROR_CODES)[]).map((code) => [
              API_ERROR_CODES[code],
              <C key={code}>{code}</C>,
              ERROR_TEXT[code],
            ])}
          />
          <p>
            <C>4xx</C> errors mean the request needs fixing (retrying the same request won&apos;t help, except{" "}
            <C>429</C>). <C>5xx</C> errors are on us: retry after a short wait, with the same <C>Idempotency-Key</C>.
            An address that isn&apos;t an endpoint gets <C>404 not_found</C>.
          </p>
          <p>
            Every answer has an <C>X-Request-Id</C> header (like <C>req_5f2c…</C>). If you need help with a failed
            request, send us that id: it lets us find it in our logs.
          </p>
        </DocSection>

        {/* ── Rate limits ──────────────────────────────────────────────── */}
        <DocSection id="rate-limits" title="Rate limits">
          <p>
            Each API key can make {L.requestsPerSecond} requests per second, with short bursts of up to {L.burst}. Over
            that, you get <C>429 rate_limited</C> with a <C>Retry-After</C> header saying how many seconds to wait.
            Every answer to a request with a valid key tells you where you stand:
          </p>
          <DocTable
            head={["Header", "Meaning"]}
            rows={[
              [<C key="l">RateLimit-Limit</C>, `The most requests you can make at once (${L.burst}).`],
              [<C key="r">RateLimit-Remaining</C>, "How many you can make right now."],
              [<C key="s">RateLimit-Reset</C>, "Seconds until you're back to the full amount."],
              [<C key="a">Retry-After</C>, <>Seconds to wait before retrying (only on <C>429</C>).</>],
            ]}
          />
          <p>
            To stop key guessing, an IP address that sends 20 invalid keys within a minute gets <C>429</C> (with{" "}
            <C>Retry-After</C>) for the rest of that minute.
          </p>
          <p>
            There&apos;s no daily limit from {BRAND.name}. Your sending provider may have its own; if it pushes back, we
            slow down and retry for you.
          </p>
        </DocSection>

        {/* ── Good practices ───────────────────────────────────────────── */}
        <DocSection id="good-practices" title="Good practices">
          <ul className="flex flex-col gap-3">
            {[
              ["Keep keys on your server.", "Call the API from your backend only. A key in browser or app code can be copied by anyone."],
              ["One key per app.", "Name keys after where they're used (\"Shop backend\"), so you can revoke one without breaking the others."],
              ["Retry with an Idempotency-Key.", "On a timeout or a 5xx, retry with the same key and the customer still gets exactly one email."],
              ["Verify your sending domain.", "Set up SPF, DKIM and DMARC under Settings → Domains so your emails land in the inbox, not spam."],
              ["Send text as well as HTML.", "Some people read plain text, and spam filters like emails that have both."],
              ["Use tags.", "Tag each kind of email (\"receipt\", \"password-reset\") to filter the logs and spot problems fast."],
            ].map(([title, text]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                <span>
                  <strong className="font-medium text-zinc-900">{title}</strong> {text}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-zinc-900">Ready to send?</p>
              <p className="text-sm text-zinc-600">
                Create a key and your first email is one request away. Base URL: <BaseUrl path="/api/v1" />
              </p>
            </div>
            <Link
              href="/settings/api"
              prefetch={false}
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Create an API key
            </Link>
          </div>
        </DocSection>
      </main>
    </div>
  );
}
