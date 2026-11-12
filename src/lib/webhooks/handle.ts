import "server-only";
import { db } from "@/lib/db";
import { parseJsonSafe, readLimited } from "./body";
import { MAX_EVENTS_PER_REQUEST, parseMailgun, parsePostmark, parseResend, parseSesMessage, parseSendgrid } from "./parse";
import { processWebhookEvents } from "./process";
import { encryptWebhookSecret, readWebhookSecret } from "./secrets";
import {
  confirmSnsSubscription,
  fetchSnsCert,
  snsMessageSchema,
  subscribeUrlFor,
  verifySnsMessage,
  type CertFetcher,
} from "./sns";
import type { WebhookEvent } from "./types";
import { safeEqualString, verifyBasicAuth, verifyMailgun, verifySendgrid, verifySvix } from "./verify";

// The public endpoint POST /api/webhooks/<providerId>/<token>, where email
// providers report deliveries, bounces and spam complaints.
//
// Security, in order:
//   1. The URL token (random, secret) must match this provider → else 404.
//      404 (not 401) so the endpoint doesn't confirm which provider ids exist.
//   2. The body is capped at 1 MB and parsed carefully.
//   3. The provider's signature is checked when it can sign (always for SNS;
//      for others once the user saved the signing secret) → else 400.
//   4. Events only ever touch recipients of THIS provider's campaigns in
//      THIS provider's workspace (see process.ts).
//
// Status codes matter: providers retry on anything but 2xx, so a valid
// request always gets 200 quickly, even when some events are unknown.

const MAX_BODY_BYTES = 1024 * 1024;

const HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

const notFound = () => reply(404, { error: "Not found" });
const badSignature = (why = "Signature could not be verified") => reply(400, { error: why });

/** Things tests replace, so SNS can be tested without reaching Amazon. */
export type WebhookDeps = {
  getSnsCert: CertFetcher;
  confirmSubscription: (url: URL) => Promise<boolean>;
};

const defaultDeps: WebhookDeps = { getSnsCert: fetchSnsCert, confirmSubscription: confirmSnsSubscription };

// Used to compare against when the provider doesn't exist, so a wrong id and
// a wrong token take about the same time.
const DUMMY_TOKEN = "x".repeat(43);

export async function handleProviderWebhook(
  request: Request,
  providerId: string,
  token: string,
  deps: WebhookDeps = defaultDeps,
): Promise<Response> {
  // ── 1. Who is this for? ────────────────────────────────────────────────────
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(providerId) || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return notFound();

  const provider = await db.sendingProvider.findUnique({
    where: { id: providerId },
    select: { id: true, workspaceId: true, type: true, webhookToken: true, webhookSecret: true },
  });
  const tokenOk = safeEqualString(token, provider?.webhookToken ?? DUMMY_TOKEN);
  // SMTP servers can't send webhooks, so their URL never exists.
  if (!provider || !provider.webhookToken || !tokenOk || provider.type === "SMTP") return notFound();

  // ── 2. Read the body (capped) ─────────────────────────────────────────────
  const raw = await readLimited(request.body, MAX_BODY_BYTES, request.headers.get("content-length"));
  if (!raw) return reply(413, { error: "Body too large" });
  const text = raw.toString("utf8");
  const json = parseJsonSafe(text);
  if (json === undefined) return reply(400, { error: "Body must be JSON" });

  // A secret that was saved but can't be decrypted (e.g. the server key
  // changed) must NOT silently turn signature checks off: refuse instead.
  const secret = readWebhookSecret(provider.webhookSecret);
  if (provider.webhookSecret && !secret) return badSignature("Signing secret unreadable; save it again in Klyve");

  // ── 3. Verify + parse, per provider ───────────────────────────────────────
  let events: WebhookEvent[];
  const h = request.headers;

  switch (provider.type) {
    case "AMAZON_SES": {
      const parsed = snsMessageSchema.safeParse(json);
      if (!parsed.success) return reply(400, { error: "Not an SNS message" });
      const m = parsed.data;
      if (!(await verifySnsMessage(m, deps.getSnsCert))) return badSignature();
      // Locked to one topic (set when the first subscription was confirmed).
      if (secret?.topicArn && secret.topicArn !== m.TopicArn) return badSignature("Unexpected SNS topic");

      if (m.Type === "SubscriptionConfirmation") {
        const url = subscribeUrlFor(m);
        if (!url) return badSignature("Invalid SubscribeURL");
        if (!(await deps.confirmSubscription(url))) return reply(502, { error: "Could not confirm the subscription" });
        // First topic wins: from now on only this topic is accepted.
        const data: { lastWebhookAt: Date; webhookSecret?: string } = { lastWebhookAt: new Date() };
        if (!secret?.topicArn) data.webhookSecret = encryptWebhookSecret({ ...(secret ?? {}), topicArn: m.TopicArn });
        await db.sendingProvider.updateMany({ where: { id: provider.id, webhookToken: provider.webhookToken }, data });
        return reply(200, { ok: true, subscribed: true });
      }
      if (m.Type === "UnsubscribeConfirmation") {
        await touch(provider.id);
        return reply(200, { ok: true });
      }
      events = parseSesMessage(parseJsonSafe(m.Message), m.MessageId);
      break;
    }

    case "RESEND": {
      const svixId = h.get("svix-id") ?? h.get("webhook-id");
      if (secret?.signingSecret) {
        const ok = verifySvix(
          secret.signingSecret,
          {
            id: svixId,
            timestamp: h.get("svix-timestamp") ?? h.get("webhook-timestamp"),
            signature: h.get("svix-signature") ?? h.get("webhook-signature"),
          },
          text,
        );
        if (!ok) return badSignature();
      }
      events = parseResend(json, svixId);
      break;
    }

    case "SENDGRID": {
      if (secret?.publicKey) {
        const ok = verifySendgrid(
          secret.publicKey,
          {
            signature: h.get("x-twilio-email-event-webhook-signature"),
            timestamp: h.get("x-twilio-email-event-webhook-timestamp"),
          },
          raw,
        );
        if (!ok) return badSignature();
      }
      events = parseSendgrid(json);
      break;
    }

    case "MAILGUN": {
      if (secret?.signingKey) {
        const sig = (json as { signature?: unknown } | null)?.signature;
        if (!verifyMailgun(secret.signingKey, sig)) return badSignature();
      }
      events = parseMailgun(json);
      break;
    }

    case "POSTMARK": {
      if (secret?.username && secret.password) {
        if (!verifyBasicAuth(h.get("authorization"), secret.username, secret.password)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...HEADERS, "WWW-Authenticate": 'Basic realm="klyve-webhooks"' },
          });
        }
      }
      events = parsePostmark(json);
      break;
    }
  }

  // ── 4. Record ─────────────────────────────────────────────────────────────
  await touch(provider.id);
  const result = await processWebhookEvents(provider, events.slice(0, MAX_EVENTS_PER_REQUEST));
  if (result.ignored > 0) {
    console.info(`[webhooks] ${provider.type} ${provider.id}: ${result.ignored} event(s) for unknown emails ignored`);
  }
  return reply(200, { ok: true, ...result });
}

/** Remembers that a genuine webhook arrived (the settings page shows "Last event received …"). */
async function touch(providerId: string): Promise<void> {
  await db.sendingProvider.update({ where: { id: providerId }, data: { lastWebhookAt: new Date() } });
}

