import "server-only";
import type { PostmarkCredentials } from "@/lib/email/provider-configs";
import { formatAddress, type PreparedEmail } from "@/lib/email/mime";
import { fail, httpRequest, isFailure, mapHttpError, providerSaid, str, type AdapterCheckResult, type AdapterSendResult, type Failure } from "./shared";

// Postmark adapter. Docs: https://postmarkapp.com/developer/api/email-api
// Postmark keeps marketing ("broadcast") and transactional email in separate
// message streams, so every send says which stream to use.
const BASE_URL = "https://api.postmarkapp.com";

function authHeaders(config: PostmarkCredentials) {
  return { "X-Postmark-Server-Token": config.serverToken, "Content-Type": "application/json", Accept: "application/json" };
}

/** Postmark metadata: at most 10 fields, keys up to 20 chars, values up to 80. */
function toMetadata(tags: Record<string, string>) {
  const entries = Object.entries(tags).slice(0, 10).map(([k, v]) => [k.slice(0, 20), v.slice(0, 80)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export async function send(config: PostmarkCredentials, email: PreparedEmail): Promise<AdapterSendResult> {
  const headers = Object.entries(email.headers).map(([Name, Value]) => ({ Name, Value }));
  const res = await httpRequest("Postmark", `${BASE_URL}/email`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      From: formatAddress(email.from),
      To: formatAddress(email.to),
      ReplyTo: email.replyTo,
      Subject: email.subject,
      HtmlBody: email.html || undefined,
      TextBody: email.text,
      Headers: headers.length ? headers : undefined,
      Metadata: toMetadata(email.tags),
      MessageStream: config.messageStream || "broadcast",
    }),
  });
  if (isFailure(res)) return res;
  const errorCode = Number(str(res.body, "ErrorCode") ?? 0);
  if (res.status >= 200 && res.status < 300 && errorCode === 0) {
    return { ok: true, providerMessageId: str(res.body, "MessageID") };
  }
  return mapPostmarkError(res.status, res.body, config);
}

export async function check(config: PostmarkCredentials): Promise<AdapterCheckResult> {
  // 1) Is the token a valid Server token?
  const server = await httpRequest("Postmark", `${BASE_URL}/server`, { method: "GET", headers: authHeaders(config) });
  if (isFailure(server)) return server;
  if (server.status < 200 || server.status >= 300) return mapPostmarkError(server.status, server.body, config);
  const serverName = str(server.body, "Name") ?? "your server";

  // 2) Does the message stream exist, and is it a Broadcast stream?
  const streamId = config.messageStream || "broadcast";
  const stream = await httpRequest("Postmark", `${BASE_URL}/message-streams/${encodeURIComponent(streamId)}`, {
    method: "GET",
    headers: authHeaders(config),
  });
  if (isFailure(stream)) return stream;
  if (stream.status === 404 || stream.status === 422) {
    return fail(`Postmark server "${serverName}" has no message stream with the ID "${streamId}". Check the stream ID in Postmark.`, false, true);
  }
  if (stream.status < 200 || stream.status >= 300) return mapPostmarkError(stream.status, stream.body, config);

  const type = str(stream.body, "MessageStreamType") ?? "";
  if (type === "Inbound") {
    return fail(`"${streamId}" is an Inbound stream, which can't send email. Use a Broadcast stream.`, false, true);
  }
  if (type === "Transactional") {
    return {
      ok: true,
      detail: `Connected to "${serverName}". Warning: "${streamId}" is a Transactional stream; Postmark requires marketing email to use a Broadcast stream.`,
    };
  }
  return { ok: true, detail: `Connected to "${serverName}", sending through the "${streamId}" Broadcast stream.` };
}

function mapPostmarkError(status: number, body: unknown, config: PostmarkCredentials): Failure {
  const code = Number(str(body, "ErrorCode") ?? 0);
  const message = str(body, "Message") ?? (typeof body === "string" ? body : "");
  const secrets = [config.serverToken];
  const said = providerSaid("Postmark", message, secrets);

  if (status === 401 || code === 10) {
    return fail("Server API token rejected by Postmark. Use a Server token (Server → API Tokens), not an Account token.", false, true);
  }
  if (code === 405) return fail(`Postmark isn't allowing this account to send right now (for example, out of credits).${said}`, false, true);
  if (code === 1235 || /message ?stream/i.test(message)) {
    return fail(`Postmark message stream problem: check the stream ID "${config.messageStream}".${said}`, false, true);
  }
  if (code === 400 || code === 401) {
    return fail(`The From address isn't a confirmed Sender Signature or verified domain in Postmark.${said}`, false);
  }
  if (code === 406) return fail(`Postmark won't send to this address because it bounced or unsubscribed before (inactive recipient).${said}`, false);
  return mapHttpError("Postmark", status, message, secrets);
}
