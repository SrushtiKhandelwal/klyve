import "server-only";
import type { KlyveTags, WebhookEvent } from "./types";

// Turns each provider's webhook payload into our common WebhookEvent list.
// Payloads come from the internet, so nothing here trusts their shape: every
// field is read defensively, and anything we don't understand is skipped
// (never thrown), so one odd event can't make the provider retry the batch.
//
// Each email we send carries our ids (see src/lib/campaigns/send-one.ts):
//   tags    { kind: "campaign", campaign_id, recipient_id }
//   headers X-Klyve-Campaign / X-Klyve-Recipient
// Each provider returns the tags in its own way; we read them back here.

// ── Small readers ────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : undefined;
}

/** A short, single-line string, or undefined. */
function s(value: unknown, max = 300): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  // Drop control characters (they could mess up logs or the UI).
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

/** Our ids are cuids: short, letters and digits only. Anything else is ignored. */
function id(value: unknown): string | undefined {
  const v = s(value, 100);
  return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined;
}

/** A provider time (ISO text, or seconds since 1970). Odd values → undefined (= now). */
function time(value: unknown): Date | undefined {
  let d: Date | undefined;
  if (typeof value === "number" && Number.isFinite(value)) d = new Date(value * 1000);
  else if (typeof value === "string" && value.length < 60) d = new Date(value);
  if (!d || Number.isNaN(d.getTime())) return undefined;
  // Ignore times from the future (a wrong clock) or before Klyve existed.
  if (d.getTime() > Date.now() + 60 * 60 * 1000 || d.getTime() < Date.UTC(2020, 0, 1)) return undefined;
  return d;
}

/** Only campaign emails have our ids; test emails (kind "provider-test") are skipped. */
function tagsFrom(t: KlyveTags): Pick<WebhookEvent, "recipientId" | "campaignId"> | null {
  if (t.kind !== undefined && t.kind !== "campaign") return null;
  return { recipientId: id(t.recipient_id), campaignId: id(t.campaign_id) };
}

function event(base: Omit<WebhookEvent, "recipientId" | "campaignId">, tags: KlyveTags): WebhookEvent | null {
  const ids = tagsFrom(tags);
  if (!ids) return null;
  return { ...ids, ...base };
}

/** Caps how many events one request may contain. */
export const MAX_EVENTS_PER_REQUEST = 1000;

// ── Amazon SES (the Message inside an SNS notification) ──────────────────────

/**
 * Handles both SES "event publishing" (configuration set → `eventType`) and
 * the older identity notifications (`notificationType`).
 */
export function parseSesMessage(message: unknown, snsMessageId: string): WebhookEvent[] {
  const m = obj(message);
  if (!m) return [];
  const kind = s(m.eventType) ?? s(m.notificationType);
  const mail = obj(m.mail);
  const messageId = s(mail?.messageId, 200);

  // Tags come back as { name: ["value"] }. Headers as [{ name, value }] when included.
  const sesTags = obj(mail?.tags) ?? {};
  const firstTag = (name: string) => (Array.isArray(sesTags[name]) ? s((sesTags[name] as unknown[])[0]) : undefined);
  const header = (name: string) => {
    if (!Array.isArray(mail?.headers)) return undefined;
    const found = (mail.headers as unknown[]).map(obj).find((h) => s(h?.name)?.toLowerCase() === name.toLowerCase());
    return s(found?.value);
  };
  const tags: KlyveTags = {
    kind: firstTag("kind"),
    campaign_id: firstTag("campaign_id") ?? header("X-Klyve-Campaign"),
    recipient_id: firstTag("recipient_id") ?? header("X-Klyve-Recipient"),
  };
  const base = { messageId, providerEventId: `sns:${snsMessageId}` };

  if (kind === "Bounce") {
    const b = obj(m.bounce);
    const first = Array.isArray(b?.bouncedRecipients) ? obj(b.bouncedRecipients[0]) : undefined;
    const e = event(
      {
        ...base,
        type: "BOUNCED",
        // Permanent = the address is bad. Transient/Undetermined = maybe later.
        bounceType: s(b?.bounceType) === "Permanent" ? "hard" : "soft",
        diagnostic: s(first?.diagnosticCode) ?? [s(b?.bounceType), s(b?.bounceSubType)].filter(Boolean).join(" / "),
        at: time(b?.timestamp),
      },
      tags,
    );
    return e ? [e] : [];
  }
  if (kind === "Complaint") {
    const c = obj(m.complaint);
    const e = event({ ...base, type: "COMPLAINED", diagnostic: s(c?.complaintFeedbackType), at: time(c?.timestamp) }, tags);
    return e ? [e] : [];
  }
  if (kind === "Delivery") {
    const d = obj(m.delivery);
    const e = event({ ...base, type: "DELIVERED", at: time(d?.timestamp) }, tags);
    return e ? [e] : [];
  }
  return []; // Send, Open, Click, DeliveryDelay… are not used here
}

// ── Resend ───────────────────────────────────────────────────────────────────

/** Resend returns tags as { name: value } (older payloads: [{ name, value }]). */
function resendTags(value: unknown): KlyveTags {
  const out: Obj = {};
  if (Array.isArray(value)) {
    for (const t of value.map(obj)) if (t && s(t.name)) out[s(t.name) as string] = t.value;
  } else Object.assign(out, obj(value) ?? {});
  return { kind: s(out.kind), campaign_id: s(out.campaign_id), recipient_id: s(out.recipient_id) };
}

export function parseResend(payload: unknown, svixId: string | null): WebhookEvent[] {
  const p = obj(payload);
  const data = obj(p?.data);
  if (!p || !data) return [];
  const tags = resendTags(data.tags);
  const base = {
    messageId: s(data.email_id, 200),
    providerEventId: svixId ? `svix:${s(svixId, 200)}` : undefined,
    at: time(p.created_at) ?? time(data.created_at),
  };
  const kind = s(p.type);

  if (kind === "email.bounced") {
    const b = obj(data.bounce);
    const bounceKind = s(b?.type);
    const e = event(
      {
        ...base,
        type: "BOUNCED",
        // Resend reports permanent bounces here; "Transient"/"Undetermined" are temporary.
        bounceType: bounceKind === "Transient" || bounceKind === "Undetermined" ? "soft" : "hard",
        diagnostic: s(b?.message) ?? s(b?.subType),
      },
      tags,
    );
    return e ? [e] : [];
  }
  if (kind === "email.complained") {
    const e = event({ ...base, type: "COMPLAINED" }, tags);
    return e ? [e] : [];
  }
  if (kind === "email.delivered") {
    const e = event({ ...base, type: "DELIVERED" }, tags);
    return e ? [e] : [];
  }
  return [];
}

// ── SendGrid (always a JSON array, often many events) ────────────────────────

export function parseSendgrid(payload: unknown): WebhookEvent[] {
  if (!Array.isArray(payload)) return [];
  const out: WebhookEvent[] = [];
  for (const raw of payload.slice(0, MAX_EVENTS_PER_REQUEST)) {
    const e = obj(raw);
    if (!e) continue;
    // custom_args arrive as top-level fields of each event.
    const tags: KlyveTags = { kind: s(e.kind), campaign_id: s(e.campaign_id), recipient_id: s(e.recipient_id) };
    // sg_message_id is "<x-message-id>.filter…"; we stored only the first part.
    const base = {
      messageId: s(e.sg_message_id, 300)?.split(".")[0],
      providerEventId: s(e.sg_event_id, 200) ? `sg:${s(e.sg_event_id, 200)}` : undefined,
      at: time(e.timestamp),
    };
    const reason = s(e.reason) ?? s(e.status);
    let ev: WebhookEvent | null = null;

    switch (s(e.event)) {
      case "delivered":
        ev = event({ ...base, type: "DELIVERED" }, tags);
        break;
      case "bounce":
        // type "bounce" = the server said the address is bad; "blocked" = refused for now.
        ev = event({ ...base, type: "BOUNCED", bounceType: s(e.type) === "blocked" ? "soft" : "hard", diagnostic: reason }, tags);
        break;
      case "dropped": {
        // SendGrid didn't even try, because of its own lists. Map the useful reasons.
        const why = (reason ?? "").toLowerCase();
        if (why.includes("spam reporting")) ev = event({ ...base, type: "COMPLAINED", diagnostic: reason }, tags);
        else if (why.includes("bounced address") || why.includes("invalid"))
          ev = event({ ...base, type: "BOUNCED", bounceType: "hard", diagnostic: reason }, tags);
        else if (!why.includes("unsubscribed"))
          ev = event({ ...base, type: "BOUNCED", bounceType: "soft", diagnostic: reason }, tags);
        break;
      }
      case "spamreport":
        ev = event({ ...base, type: "COMPLAINED" }, tags);
        break;
    }
    if (ev) out.push(ev);
  }
  return out;
}

// ── Mailgun ──────────────────────────────────────────────────────────────────

export function parseMailgun(payload: unknown): WebhookEvent[] {
  const data = obj(obj(payload)?.["event-data"]);
  if (!data) return [];
  const vars = obj(data["user-variables"]) ?? {};
  const tags: KlyveTags = { kind: s(vars.kind), campaign_id: s(vars.campaign_id), recipient_id: s(vars.recipient_id) };
  const headers = obj(obj(data.message)?.headers);
  const base = {
    messageId: s(headers?.["message-id"], 300)?.replace(/^<|>$/g, ""),
    providerEventId: s(data.id, 200) ? `mg:${s(data.id, 200)}` : undefined,
    at: time(data.timestamp),
  };
  const status = obj(data["delivery-status"]);
  const diagnostic = s(status?.description) || s(status?.message) || s(data.reason);

  let ev: WebhookEvent | null = null;
  switch (s(data.event)) {
    case "delivered":
      ev = event({ ...base, type: "DELIVERED" }, tags);
      break;
    case "failed":
      ev = event(
        { ...base, type: "BOUNCED", bounceType: s(data.severity) === "permanent" ? "hard" : "soft", diagnostic },
        tags,
      );
      break;
    case "complained":
      ev = event({ ...base, type: "COMPLAINED" }, tags);
      break;
  }
  return ev ? [ev] : [];
}

// ── Postmark ─────────────────────────────────────────────────────────────────

/** Postmark bounce "Type"s that mean the address is bad for good. */
const POSTMARK_HARD = new Set(["HardBounce", "BadEmailAddress", "ManuallyDeactivated"]);
/** Types that are NOT delivery failures (auto-replies, subscribe requests…): ignored. */
const POSTMARK_NOT_BOUNCES = new Set([
  "Unsubscribe", "Subscribe", "AutoResponder", "AddressChange", "SpamNotification", "OpenRelayTest",
  "VirusNotification", "ChallengeVerification", "InboxPlacement", "TemplateRenderingFailed",
]);

export function parsePostmark(payload: unknown): WebhookEvent[] {
  const p = obj(payload);
  if (!p) return [];
  const meta = obj(p.Metadata) ?? {};
  const tags: KlyveTags = { kind: s(meta.kind), campaign_id: s(meta.campaign_id), recipient_id: s(meta.recipient_id) };
  const messageId = s(p.MessageID, 200);
  const recordType = s(p.RecordType);
  const eventId = s(p.ID, 100);
  let ev: WebhookEvent | null = null;

  if (recordType === "Bounce") {
    const type = s(p.Type) ?? "";
    if (type === "SpamComplaint") {
      ev = event({ type: "COMPLAINED", messageId, providerEventId: eventId && `pm:bounce:${eventId}`, at: time(p.BouncedAt) }, tags);
    } else if (!POSTMARK_NOT_BOUNCES.has(type)) {
      ev = event(
        {
          type: "BOUNCED",
          bounceType: POSTMARK_HARD.has(type) ? "hard" : "soft",
          diagnostic: s(p.Details) ?? s(p.Description),
          messageId,
          providerEventId: eventId && `pm:bounce:${eventId}`,
          at: time(p.BouncedAt),
        },
        tags,
      );
    }
  } else if (recordType === "SpamComplaint") {
    ev = event({ type: "COMPLAINED", messageId, providerEventId: eventId && `pm:spam:${eventId}`, at: time(p.BouncedAt) }, tags);
  } else if (recordType === "Delivery") {
    // Deliveries have no event id; one delivery per message, so the message id works.
    ev = event({ type: "DELIVERED", messageId, providerEventId: messageId && `pm:delivery:${messageId}`, at: time(p.DeliveredAt) }, tags);
  }
  return ev ? [ev] : [];
}
