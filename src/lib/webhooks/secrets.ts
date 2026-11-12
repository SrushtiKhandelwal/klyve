import "server-only";
import { createPublicKey } from "node:crypto";
import { z } from "zod";
import { decryptJson, encryptJson } from "@/lib/crypto";
import type { WebhookProviderType } from "./setup-guide";

// The optional signing secret of a provider's webhook, stored ENCRYPTED in
// SendingProvider.webhookSecret as JSON. Its shape depends on the provider:
//
//   RESEND      { signingSecret: "whsec_…" }      Svix HMAC key
//   SENDGRID    { publicKey: "MFkw…" }            ECDSA P-256 public key
//   MAILGUN     { signingKey: "…" }               HMAC key
//   POSTMARK    { username, password }            HTTP Basic auth
//   AMAZON_SES  { topicArn: "arn:aws:sns:…" }     the SNS topic we accept (not secret, but kept together)

export type WebhookSecret = {
  signingSecret?: string;
  publicKey?: string;
  signingKey?: string;
  username?: string;
  password?: string;
  topicArn?: string;
};

/** Reads the stored secret. Unreadable (e.g. key rotated) → null, i.e. "not set". */
export function readWebhookSecret(stored: string | null): WebhookSecret | null {
  if (!stored) return null;
  try {
    const value = decryptJson<WebhookSecret>(stored);
    return value && typeof value === "object" ? value : null;
  } catch {
    console.error("[webhooks] a stored webhook secret could not be decrypted");
    return null;
  }
}

export function encryptWebhookSecret(secret: WebhookSecret): string {
  return encryptJson(secret);
}

/** true when the stored value really protects the webhook (SES's topic lock counts too). */
export function hasWebhookSecret(type: WebhookProviderType, secret: WebhookSecret | null): boolean {
  if (!secret) return false;
  switch (type) {
    case "RESEND":
      return !!secret.signingSecret;
    case "SENDGRID":
      return !!secret.publicKey;
    case "MAILGUN":
      return !!secret.signingKey;
    case "POSTMARK":
      return !!secret.username && !!secret.password;
    case "AMAZON_SES":
      return !!secret.topicArn;
  }
}

// ── Validation of what the user types ────────────────────────────────────────

const text = z.string().trim().max(2000).optional().default("");

export const TOPIC_ARN_RE = /^arn:aws(-[a-z]+)?:sns:[a-z]{2}(-[a-z]+)+-\d+:\d{12}:[A-Za-z0-9_-]{1,256}$/;

/** SendGrid shows the key as base64 DER; some people paste a PEM. Both work. */
export function parseSendgridPublicKey(value: string) {
  const trimmed = value.trim();
  const key = trimmed.includes("BEGIN PUBLIC KEY")
    ? createPublicKey(trimmed)
    : createPublicKey({ key: Buffer.from(trimmed.replace(/\s+/g, ""), "base64"), format: "der", type: "spki" });
  // SendGrid uses ECDSA on the P-256 curve; refuse anything else so a wrong paste is caught now.
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("not a P-256 key");
  }
  return key;
}

export type SecretInput = Record<string, unknown>;
export type SecretFieldErrors = Record<string, string[]>;

/**
 * Merges what the user typed into the stored secret. A blank field keeps
 * the old value ("Leave blank to keep"), like the provider credentials form.
 */
export function mergeWebhookSecret(
  type: WebhookProviderType,
  current: WebhookSecret | null,
  input: SecretInput,
): { ok: true; secret: WebhookSecret } | { ok: false; errors: SecretFieldErrors } {
  const read = (name: string) => {
    const parsed = text.safeParse(input[name]);
    return parsed.success ? parsed.data : null;
  };
  const errors: SecretFieldErrors = {};
  const next: WebhookSecret = { ...(current ?? {}) };

  switch (type) {
    case "RESEND": {
      const v = read("signingSecret");
      if (v === null) errors.signingSecret = ["That's too long."];
      else if (v) {
        if (!/^whsec_[A-Za-z0-9+/=]{16,}$/.test(v)) errors.signingSecret = ["Paste the whole secret: it starts with whsec_."];
        else next.signingSecret = v;
      }
      break;
    }
    case "SENDGRID": {
      const v = read("publicKey");
      if (v === null) errors.publicKey = ["That's too long."];
      else if (v) {
        try {
          parseSendgridPublicKey(v);
          next.publicKey = v;
        } catch {
          errors.publicKey = ["That doesn't look like SendGrid's verification key (it starts with MFkw)."];
        }
      }
      break;
    }
    case "MAILGUN": {
      const v = read("signingKey");
      if (v === null) errors.signingKey = ["That's too long."];
      else if (v) {
        if (!/^[A-Za-z0-9_-]{16,200}$/.test(v)) errors.signingKey = ["That doesn't look like a Mailgun signing key."];
        else next.signingKey = v;
      }
      break;
    }
    case "POSTMARK": {
      const username = read("username");
      const password = read("password");
      if (username === null) errors.username = ["That's too long."];
      if (password === null) errors.password = ["That's too long."];
      if (username) {
        // Basic auth sends "username:password", so a colon would break it.
        if (username.includes(":")) errors.username = ["The username can't contain a colon (:)."];
        else next.username = username;
      }
      if (password) next.password = password;
      if (!errors.username && !errors.password && (!next.username !== !next.password)) {
        errors[next.username ? "password" : "username"] = ["Enter both a username and a password."];
      }
      break;
    }
    case "AMAZON_SES": {
      const v = read("topicArn");
      if (v === null) errors.topicArn = ["That's too long."];
      else if (v) {
        if (!TOPIC_ARN_RE.test(v)) errors.topicArn = ["Enter a topic ARN like arn:aws:sns:us-east-1:123456789012:klyve-events."];
        else next.topicArn = v;
      }
      break;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, secret: next };
}
