import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Stops users from pointing an SMTP provider at OUR OWN private network.
//
// Why: "Test connection" makes our server open a connection to whatever host
// the user typed. Without this check, someone could type 127.0.0.1 or
// 10.0.0.5 and use us to probe machines that aren't on the public internet
// (this attack is called SSRF).
//
// In development the check is OFF, because the local test mail server
// (Mailpit, on localhost) is exactly such an address. In production it is ON
// unless ALLOW_PRIVATE_SMTP_HOSTS=true (e.g. a self-hosted install whose mail
// server sits on the same private network).

export function privateHostsBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.ALLOW_PRIVATE_SMTP_HOSTS !== "true";
}

/** true for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || // "this network"
      a === 10 || // private
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 192 && b === 0) || // IETF / test ranges
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast + reserved
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  // IPv4 written as IPv6, e.g. ::ffff:127.0.0.1
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return (
    v6.startsWith("fc") || v6.startsWith("fd") || // unique local
    v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || // link-local
    v6.startsWith("ff") // multicast
  );
}

export type ResolvedHost =
  | { ok: true; address: string } // connect to THIS address (prevents DNS tricks between check and connect)
  | { ok: false; error: string };

/**
 * Resolves `host` once and checks every address it points to.
 * When the guard is off, returns the host unchanged.
 */
export async function resolveSafeHost(host: string): Promise<ResolvedHost> {
  if (!privateHostsBlocked()) return { ok: true, address: host };

  let addresses: { address: string }[];
  try {
    addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, error: `Couldn't find the server "${host}". Check the host name.` };
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    return {
      ok: false,
      error: `"${host}" points to a private or local network address, which isn't allowed. Use your mail provider's public SMTP host.`,
    };
  }
  return { ok: true, address: addresses[0].address };
}
