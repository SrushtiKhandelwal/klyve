# Klyve: Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Klyve, free email marketing for everyone |
| **Status** | In development: Phases 0–3 done, Phase 4 next |
| **Last updated** | November 2026 |
| **Repository** | `email-tool/` (Next.js app) |

---

## 1. Summary

Klyve is a **free, open, Brevo-style email marketing platform**. People sign up, import their contacts, design emails in a drag-and-drop editor and send campaigns, **through their own email provider** (Gmail, Amazon SES, Resend, SendGrid, Mailgun, Postmark or any SMTP server).

Because users bring their own sending service, Klyve never pays for anyone's email. That makes it possible to give away what other tools charge for: **no daily sending cap, a large template library, and advanced automation on the free plan.**

## 2. Problem

Popular tools like Brevo and Mailchimp make getting started easy, but their free plans are tightly limited:

- **Brevo** caps the free plan at **300 emails per day**.
- Templates, A/B testing, automation and removing the tool's branding are **paid features**.
- Pricing climbs quickly as a list grows, which hurts students, small businesses and non-profits most.

Self-hosted alternatives (e.g. listmonk) are free and unlimited, but they need a server and technical skills, and they have no visual automation builder.

## 3. Vision and goals

**Vision:** the ease of Brevo with the freedom of a self-hosted tool, free for everyone.

| Goal | How Klyve achieves it |
|---|---|
| **Free, no daily cap** | Users connect their own provider; the only limit is their provider's own. |
| **More templates than Brevo** | A large, brand-aware starter library (22 today, growing). |
| **Advanced automation, free** | A visual workflow builder (Phase 8) on the free plan. |
| **Great deliverability** | Verified senders, SPF/DKIM/DMARC checks, one-click unsubscribe and bounce handling. |
| **Easy for beginners** | Plain-English UI, guided setup, sensible defaults. |

### Non-goals (for now)
- SMS and WhatsApp campaigns. The name "Klyve" was chosen so these can be added later.
- Klyve sending email on users' behalf from its own servers.
- Paid plans and billing.
- A native mobile app (the web app is responsive instead).

## 4. Target users

| User | Needs |
|---|---|
| **Small business owner / shop** | Newsletters, sales and festival offers, abandoned-cart emails, all on a tiny budget. |
| **Creator / blogger** | Grow a list, send updates, personalise with first names. |
| **Student group / non-profit** | Event invites and announcements without paying per contact. |
| **Developer** (later) | A transactional email API with templates (Phase 9). |

## 5. Product principles

1. **Users own their sending.** Credentials are encrypted and never shown again.
2. **Never help anyone spam.** Consent is confirmed on import, senders are verified, unsubscribes are honoured forever, and bounce and complaint suppression is built in.
3. **Workspaces are walled gardens.** Every piece of data belongs to one workspace, and every query checks it.
4. **Safe by default.** All user input is validated; HTML is sanitized; links like `javascript:` are blocked.
5. **Explain, don't assume.** Every screen says what to do next in plain English.

---

## 6. Features by phase

Legend: ✅ done · 🚧 in progress · ⏭️ next · ⏳ planned

### Phase 0: Foundations ✅
- Sign up / log in with email and password.
- **Workspaces** (one per business or team), with a switcher; roles OWNER / ADMIN / MEMBER.
- Dashboard shell: sidebar (Home, Contacts, Campaigns, Templates, Automations, Settings), works on phones.
- Route protection; a user can never see another workspace's data.

### Phase 1: Contacts ✅
- **Contacts table**: search, filter by status or list, pagination, bulk actions (add to list, unsubscribe, delete).
- **Contact page**: edit details and custom fields, manage lists, change subscription status.
- **Statuses**: Subscribed, Unsubscribed, Bounced, Complained.
- **Lists**: create, rename, delete; add people by pasting emails.
- **Custom fields** (text, number, date, yes/no), each with a personalisation tag like `{{ contact.CITY }}`.
- **CSV import wizard**: automatic column matching, progress bar, a report of failed rows, import history.
  - *Requirement:* the user must confirm the contacts agreed to receive email.
  - *Requirement:* an unsubscribed, bounced or complained contact is **never** re-subscribed by an import.
- **Segments**: a rule builder (e.g. *City contains "pune" AND Age > 35*) with a live count, evaluated fresh every time.

### Phase 2: Sending setup ✅
- **Sending providers**: SMTP (with presets for Gmail, Outlook, Zoho and Brevo), Amazon SES, Resend, SendGrid, Mailgun, Postmark.
  - Test the connection and send a test email; choose a default provider; set a speed limit and an optional daily cap.
  - Credentials are encrypted (AES-256-GCM) and never sent back to the browser.
  - In production, SMTP hosts on private networks are blocked.
- **Senders**: "From" addresses, each verified with a 6-digit code emailed to it.
- **Domains**: live SPF / DKIM / DMARC / MX checks with plain-English fix-it help.
- **Account emails**: forgot / reset password, email verification, rate limits on login and sign-up.

### Phase 3: Templates & editor ✅
- **Drag-and-drop editor**: rows of 1–4 columns; blocks for heading, text, image, button, divider, spacer, social, video, HTML and footer.
  - Rich text, **Insert personalisation**, undo/redo, autosave, desktop/mobile preview, a "Checks" list (e.g. missing unsubscribe link or alt text).
- **Rendering**: output works across Gmail, Outlook, Apple Mail and phones (via MJML), with a plain-text version.
- **Personalisation**: Liquid tags such as `{{ contact.FIRSTNAME | default: "there" }}`; contact data can never inject code.
- **Starter library**: 22 starters in 10 categories (welcome, newsletter, sales, events, e-commerce, Diwali/festival, birthday, feedback…), all automatically in the user's brand.
- **Brand kit**: logo, colours, font, postal address and social links.
- **Media library**: image upload (PNG/JPG/GIF/WebP, max 5 MB) with strict safety checks.
- **Test emails**: send a template to yourself, personalised as a real contact.

### Phase 4: Campaigns ⏭️ *(next: completes the first working version)*

**User story:** *"As a business owner, I want to send a designed email to a list or segment, now or at a set time, and see that it went out."*

Requirements:
1. **Create a campaign** with:
   - a name
   - **recipients**: one or more lists and/or segments, with duplicates removed and an exclusion list
   - **sender**: a verified sender
   - **content**: a saved template or a starter
   - **subject and preview text**, with personalisation tags
2. **Pre-send checks** that block sending:
   - no recipients
   - unverified sender, or a broken provider
   - missing unsubscribe link, or a broken merge tag
   - account email not verified
3. **Recipient count** shown before sending; only **Subscribed** contacts are ever emailed.
4. **Send now** or **schedule** for a date and time, in the user's timezone.
5. **Background sending queue**:
   - respects each provider's speed limit and daily cap
   - retries temporary failures with back-off
   - never sends the same contact the same campaign twice
   - survives a server restart
6. **Per-recipient personalisation**, plus a unique **unsubscribe link** and a one-click `List-Unsubscribe` header.
7. **Unsubscribe page**: one click, no login needed; the contact becomes Unsubscribed immediately.
8. **Progress view**: queued / sent / failed counts updating live; pause, resume and cancel.
9. **Campaign list**: Draft, Scheduled, Sending, Sent, Paused, Failed; duplicate a past campaign.
10. **Test send** of the campaign before launch.

### Phase 5: Tracking & reports ⏳
- Open tracking (pixel) and click tracking (link redirects), with the option to turn them off.
- Bounce and complaint handling via provider webhooks (SES, Resend, SendGrid, Mailgun, Postmark), automatically setting contacts to Bounced or Complained.
- A campaign report: delivered, opened, clicked, unsubscribed, bounced, top links, and a timeline.
- A dashboard with recent campaign performance.

### Phase 6: Compliance & deliverability ⏳
- A workspace-wide suppression list, including re-importing it.
- Optional double opt-in for new subscribers.
- A preference centre (pick which lists to stay on).
- GDPR tools: export or delete a contact's data; consent records.
- Sending health checks (bounce and complaint rates) that pause risky sending.

### Phase 7: Sign-up forms ⏳
- A form builder with fields mapped to contact fields, plus an embed code or a hosted page.
- Spam protection (honeypot, rate limit), and optionally double opt-in.

### Phase 8: Automation ⏳ *(free on Klyve, paid elsewhere)*
- A visual workflow builder.
  - **Triggers:** joined a list, form submitted, date or birthday, field changed.
  - **Steps:** send email, wait, if/else, update field, add or remove from a list.
- Ready-made automations: welcome series, birthday, win-back, abandoned cart.

### Phase 9: Transactional API ⏳
- API keys per workspace; a "send with template" endpoint; per-key logs and rate limits.

### Phase 10: Launch ⏳
- Deployment with Docker (Postgres, app, queue worker), backups, monitoring and error alerts.
- Object storage (S3/R2) for images; a shared store for rate limits.
- Abuse prevention for a public service; terms and privacy pages.
- A custom domain for Klyve's own website and system emails.

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Security** | Workspace isolation on every query and action; encrypted provider credentials; sanitized HTML; parameterized SQL; no secrets in the code or in git. |
| **Privacy** | Contact data is never shared between workspaces; images are served from unguessable URLs. |
| **Deliverability** | Unsubscribe link plus `List-Unsubscribe` on every campaign; verified senders; guidance on SPF, DKIM and DMARC. |
| **Performance** | Personalising an email takes about 1 ms per recipient; imports process about 500 rows in under 0.5 s; pages stream in fast. |
| **Accessibility** | Keyboard-usable (including drag-and-drop), labelled controls, visible focus. |
| **Responsiveness** | Every screen works at phone width (375 px) without sideways scrolling. |

## 8. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Base UI) |
| Database | PostgreSQL 17 in Docker, accessed with Prisma 7 |
| Auth | Better Auth (email and password, sessions stored in our own database) |
| Email rendering | MJML, Liquid (personalisation), sanitize-html |
| Editor | dnd-kit (drag-and-drop), TipTap (rich text) |
| Sending | nodemailer (SMTP), AWS SES SDK, provider REST APIs |
| Local testing | Mailpit (fake inbox at `localhost:8025`) |
| Queue *(Phase 4)* | A Postgres-backed job queue, so no extra service is needed to start |

Key decisions:
- **Bring your own provider** keeps Klyve free, with no cap.
- **Self-hosted Postgres (Docker)**, with no third-party database service.
- **One codebase** (a Next.js full-stack app), to keep it simple.

## 9. Success metrics

- **Activation:** a new user connects a provider, imports contacts and sends a first campaign within 30 minutes.
- **Deliverability:** test campaigns land in the Gmail inbox (not spam) for authenticated domains.
- **Reliability:** no duplicate sends; a failed campaign can always be resumed.
- **Safety:** zero cross-workspace data leaks; every campaign carries a working unsubscribe link.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Spammers abuse a free tool | Consent checkbox, verified senders, suppression lists, health-based pausing, terms of use. |
| Users' Gmail accounts get rate-limited | Speed limits and daily caps per provider; recommend SES or Resend for larger lists. |
| Emails land in spam | Domain authentication guide, one-click unsubscribe, content checks. |
| Leaked provider credentials | AES-256-GCM encryption; secrets are never returned to the browser. |
| A server restart stops sending mid-campaign | Durable database-backed queue with resume. |

## 11. Open questions

- The public domain for Klyve (e.g. a `.tech` domain): not chosen yet.
- Hosting provider for launch: decided in Phase 10.
- Whether to offer a small amount of built-in sending later for people with no provider at all.
