import "server-only";
import { X509Certificate, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { readLimited } from "./body";

// Amazon SNS messages (how Amazon SES reports bounces/complaints/deliveries).
//
// Every SNS message is signed by Amazon. To check it we download Amazon's
// certificate from the message's `SigningCertURL`. That URL comes from the
// (untrusted) request, so before fetching ANYTHING we insist it really is an
// https://sns.<region>.amazonaws.com/….pem address. Otherwise an attacker
// could make our server fetch internal addresses (SSRF), or hand us their
// own certificate and sign fake messages with it.
//
// The same strict check guards `SubscribeURL`, which we GET to confirm a new
// subscription — and only after the message's signature is verified.

// ── The message ──────────────────────────────────────────────────────────────

const str = z.string().max(300_000);

export const snsMessageSchema = z.object({
  Type: z.enum(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"]),
  MessageId: z.string().min(1).max(200),
  TopicArn: z.string().min(1).max(500),
  Message: str,
  Timestamp: z.string().min(1).max(100),
  SignatureVersion: z.enum(["1", "2"]),
  Signature: z.string().min(1).max(2000),
  SigningCertURL: z.string().min(1).max(1000),
  Subject: z.string().max(1000).optional(),
  SubscribeURL: z.string().max(4000).optional(),
  Token: z.string().max(4000).optional(),
});

export type SnsMessage = z.infer<typeof snsMessageSchema>;

/**
 * The exact text Amazon signed: chosen fields as "Name\nvalue\n", in a fixed
 * order (https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html).
 */
export function snsStringToSign(m: SnsMessage): string | null {
  const keys =
    m.Type === "Notification"
      ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  let out = "";
  for (const key of keys) {
    const value = m[key as keyof SnsMessage];
    if (typeof value !== "string") return null; // a required field is missing
    out += `${key}\n${value}\n`;
  }
  return out;
}

// ── Strict URL checks (the SSRF guard) ───────────────────────────────────────

/** "us-east-1", "eu-central-1", "us-gov-west-1", "ap-southeast-2"… */
const REGION = "[a-z]{2}(?:-[a-z]+)+-\\d{1,2}";
const SNS_HOST_RE = new RegExp(`^sns\\.(${REGION})\\.amazonaws\\.com$`);

/**
 * Returns the parsed URL only if it's https://sns.<region>.amazonaws.com
 * with no port, no user:password@, and (for certificates) a .pem path.
 * Anything else — http, other hosts, "amazonaws.com.evil.com", IPs — is null.
 */
export function trustedSnsUrl(raw: string, kind: "cert" | "subscribe"): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.port !== "" || url.username !== "" || url.password !== "") return null;
  if (!SNS_HOST_RE.test(url.hostname)) return null;
  if (url.hash !== "") return null;
  if (kind === "cert") {
    if (url.search !== "" || !/^\/[A-Za-z0-9._-]+\.pem$/.test(url.pathname)) return null;
  } else {
    if (url.pathname !== "/" || url.searchParams.get("Action") !== "ConfirmSubscription") return null;
  }
  return url;
}

/** The region in "sns.<region>.amazonaws.com". */
function regionOfHost(url: URL): string | null {
  return SNS_HOST_RE.exec(url.hostname)?.[1] ?? null;
}

/** The region in "arn:aws:sns:<region>:<account>:<name>". */
export function regionOfTopicArn(arn: string): string | null {
  const parts = arn.split(":");
  return parts.length === 6 && parts[0] === "arn" && parts[2] === "sns" ? parts[3] : null;
}

// ── Certificates ─────────────────────────────────────────────────────────────

export type CertFetcher = (url: URL) => Promise<KeyObject>;

const CERT_TTL_MS = 12 * 60 * 60 * 1000;
const CERT_CACHE_MAX = 20;
const MAX_CERT_BYTES = 64 * 1024;

// Kept on globalThis so hot reloads in development share one cache.
const store = globalThis as unknown as { klyveSnsCerts?: Map<string, { key: KeyObject; until: number }> };

/** Downloads (and caches) Amazon's signing certificate. The URL must already be checked. */
export const fetchSnsCert: CertFetcher = async (url) => {
  store.klyveSnsCerts ??= new Map();
  const cache = store.klyveSnsCerts;
  const hit = cache.get(url.href);
  if (hit && hit.until > Date.now()) return hit.key;

  const res = await fetch(url.href, {
    redirect: "error", // a redirect could lead anywhere: refuse it
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`certificate download failed (${res.status})`);
  }
  const bytes = await readLimited(res.body, MAX_CERT_BYTES, res.headers.get("content-length"));
  if (!bytes) throw new Error("certificate too large");
  const pem = bytes.toString("utf8");

  const cert = new X509Certificate(pem);
  const now = Date.now();
  if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) throw new Error("certificate expired");

  if (cache.size >= CERT_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(url.href, { key: cert.publicKey, until: now + CERT_TTL_MS });
  return cert.publicKey;
};

/**
 * Checks Amazon's signature on an SNS message. SignatureVersion 1 is
 * RSA-SHA1, version 2 is RSA-SHA256. `getCert` is injectable for tests.
 */
export async function verifySnsMessage(m: SnsMessage, getCert: CertFetcher = fetchSnsCert): Promise<boolean> {
  const certUrl = trustedSnsUrl(m.SigningCertURL, "cert");
  if (!certUrl) return false;
  // The certificate must come from the topic's own region.
  const topicRegion = regionOfTopicArn(m.TopicArn);
  if (!topicRegion || regionOfHost(certUrl) !== topicRegion) return false;

  const text = snsStringToSign(m);
  if (!text) return false;
  try {
    const key = await getCert(certUrl);
    const algorithm = m.SignatureVersion === "1" ? "sha1" : "sha256";
    return cryptoVerify(algorithm, Buffer.from(text, "utf8"), key, Buffer.from(m.Signature, "base64"));
  } catch (err) {
    console.error("[webhooks] SNS certificate problem:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Returns the checked SubscribeURL of a (signature-verified!) confirmation
 * message, or null if it isn't a genuine SNS confirm link for that topic.
 */
export function subscribeUrlFor(m: SnsMessage): URL | null {
  if (m.Type !== "SubscriptionConfirmation" || !m.SubscribeURL) return null;
  const url = trustedSnsUrl(m.SubscribeURL, "subscribe");
  if (!url) return null;
  if (regionOfHost(url) !== regionOfTopicArn(m.TopicArn)) return null;
  if (url.searchParams.get("TopicArn") !== m.TopicArn) return null;
  return url;
}

/** Visits the SubscribeURL, which tells SNS "yes, send messages here". */
export async function confirmSnsSubscription(url: URL): Promise<boolean> {
  try {
    const res = await fetch(url.href, { redirect: "error", signal: AbortSignal.timeout(5_000), cache: "no-store" });
    await res.body?.cancel(); // we only need the status
    return res.ok;
  } catch (err) {
    console.error("[webhooks] SNS subscription confirm failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
