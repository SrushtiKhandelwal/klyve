import { ipv4InRange } from "@/lib/tracking/ip";

// Telling people from machines, for opens and clicks.
//
// Machines load images and follow links too: Apple's privacy proxy loads
// every image as soon as the email arrives, and company security filters
// "click" every link to check it before the person sees the email. If we
// counted those, open and click rates would be wildly too high.
//
// A bot event is still RECORDED (with isBot = true, so it can be inspected),
// it just doesn't count towards the human open/click numbers.
//
// CONSERVATIVE ON PURPOSE: wrongly hiding a real person's click is worse
// than counting a few machines, so each rule below needs a clear signal.
// Every rule has a `reason` so reports (and debugging) can say why.

export type BotVerdict = { isBot: boolean; reason: string | null };

const HUMAN: BotVerdict = { isBot: false, reason: null };

/**
 * Apple Mail Privacy Protection (MPP) fetches images through Apple's own
 * servers, from Apple's 17.0.0.0/8 network, whether or not the person ever
 * reads the email. Its fetches also use a bare "Mozilla/5.0" user agent.
 */
const APPLE_NETWORK = "17.0.0.0/8";
const MPP_USER_AGENT = "mozilla/5.0";

/**
 * User agents that are clearly not a person's email app or browser:
 * security scanners (Barracuda, Mimecast, Proofpoint, …), link checkers,
 * scripts and crawlers. Matched case-insensitively anywhere in the UA.
 *
 * NOT listed on purpose: "GoogleImageProxy" (Gmail loads images through it
 * when a person OPENS the email, so it is a real open) and "YahooMailProxy"
 * (same idea for Yahoo).
 */
const SCANNER_UA = new RegExp(
  [
    // Generic robots: "bot" as a word or "SomethingBot/1.0", crawlers, scripts.
    String.raw`\bbot\b`, String.raw`bot\/`, "crawler", "spider", "scanner", "headless", "phantomjs",
    String.raw`^python`, String.raw`^curl\/`, String.raw`^wget`, "go-http-client", String.raw`^java\/`, "okhttp",
    "libwww", "httpclient", "axios", "node-fetch", "undici", "postman",
    // Email security gateways that check links/images before delivery.
    "barracuda", "mimecast", "proofpoint", "messagelabs", "symantec", "forcepoint", "fortiguard",
    "trendmicro", "sophos", "ironport", "zscaler", "safelinks",
    // Link previews in chat apps and Office.
    "microsoft office protocol discovery", "skypeuripreview", "facebookexternalhit", "whatsapp", "telegrambot",
  ].join("|"),
  "i",
);

/**
 * A person can't open an email and click a link within 2 seconds of it being
 * sent; a scanner checking every link on arrival can. (Opens don't use this
 * rule: Gmail's proxy may legitimately fetch the image quickly.)
 */
const MIN_HUMAN_CLICK_MS = 2_000;

function cleanUa(ua: string | null | undefined): string {
  return typeof ua === "string" ? ua.trim() : "";
}

/** Is this open (tracking pixel load) a machine? */
export function classifyOpen(ua: string | null | undefined, ip: string | null | undefined, sentAt?: Date | null): BotVerdict {
  void sentAt; // not used for opens (see MIN_HUMAN_CLICK_MS); kept so both checks look the same
  const agent = cleanUa(ua);
  // 1. Apple Mail Privacy Protection: a "machine open", not a person reading.
  if (ipv4InRange(ip, APPLE_NETWORK)) return { isBot: true, reason: "apple-mpp-ip" };
  if (agent.toLowerCase() === MPP_USER_AGENT) return { isBot: true, reason: "apple-mpp-ua" };
  // 2. Known scanners / scripts.
  if (SCANNER_UA.test(agent)) return { isBot: true, reason: "scanner-ua" };
  // A missing user agent is NOT treated as a bot for opens: some email apps
  // and proxies load images without one.
  return HUMAN;
}

/** Is this click a machine (e.g. a security filter checking links)? */
export function classifyClick(ua: string | null | undefined, ip: string | null | undefined, sentAt?: Date | null): BotVerdict {
  void ip; // Apple's network is NOT a bot signal for clicks: MPP only prefetches images, never links.
  const agent = cleanUa(ua);
  // 1. Every real browser sends a user agent; scripts often don't.
  if (!agent) return { isBot: true, reason: "no-user-agent" };
  // 2. Known scanners / scripts.
  if (SCANNER_UA.test(agent)) return { isBot: true, reason: "scanner-ua" };
  // 3. Too fast to be a person.
  if (sentAt && Date.now() - sentAt.getTime() < MIN_HUMAN_CLICK_MS) return { isBot: true, reason: "too-soon-after-send" };
  return HUMAN;
}
