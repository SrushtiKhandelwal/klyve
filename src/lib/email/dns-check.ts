import "server-only";
import { Resolver } from "node:dns/promises";
import { domainToASCII } from "node:url";

// Looks up a domain's email DNS records (SPF, DKIM, DMARC, MX) and explains,
// in plain English, what is right, what is wrong and how to fix it.
//
// Safety notes:
// - We only ever do DNS lookups (never HTTP requests), and only for names that
//   passed parseDomain(), so junk input never reaches the DNS server.
// - Every lookup has a timeout. A slow or broken DNS server gives "couldn't
//   check" for that record, never a crash or a hanging page.

// ── Result shapes (stored as JSON in SendingDomain.lastResult) ──────────────

/**
 * pass    = looks good
 * warning = exists but has a problem
 * missing = no record found
 * unknown = we couldn't check (DNS timeout or server error); try again later
 */
export type CheckStatus = "pass" | "warning" | "missing" | "unknown";

/** A DNS record the user can copy into their DNS provider. */
export type ExampleRecord = { type: "TXT" | "CNAME"; host: string; value: string };

export type RecordCheck = {
  status: CheckStatus;
  /** The DNS name we looked up, e.g. "_dmarc.acme.com". */
  host: string;
  /** The raw records we found (TXT chunks already joined). */
  found: string[];
  /** One short sentence describing the result. */
  summary: string;
  /** Extra details or warnings. */
  notes: string[];
  /** Plain-English steps, only when something needs fixing. */
  howToFix?: string;
  example?: ExampleRecord;
};

export type SpfCheck = RecordCheck & {
  /** Sending services we recognised in the record, e.g. ["Amazon SES"]. */
  providers: string[];
  /** Roughly how many DNS lookups the record needs (the limit is 10). */
  lookupCount: number;
};

export type DkimCheck = RecordCheck & { selector: string };

export type DmarcCheck = RecordCheck & {
  policy: "none" | "quarantine" | "reject" | null;
};

export type DomainCheckResult = {
  /** Bump this if the shape changes, so old stored results can be ignored. */
  version: 1;
  domain: string;
  checkedAt: string;
  /** false when DNS says the domain doesn't exist at all (a typo?). */
  domainExists: boolean;
  spf: SpfCheck;
  /** Overall DKIM verdict, plus one entry per selector we tried. */
  dkim: RecordCheck & { selectors: DkimCheck[] };
  dmarc: DmarcCheck;
  /** Info only: MX records are about RECEIVING mail. */
  mx: RecordCheck;
};

/** Hints from the workspace's providers, so the advice can be specific. */
export type CheckContext = {
  /** e.g. ["include:amazonses.com"]: what we'd expect to see in SPF. */
  expectedSpfIncludes?: string[];
  /** true if the workspace uses Resend (it checks SPF on send.<domain>). */
  usesResend?: boolean;
};

// ── Input validation ────────────────────────────────────────────────────────

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
// The last label (".com", ".in", ".xn--p1ai") must be letters or punycode.
// This also rules out IP addresses like 192.168.0.1.
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const BLOCKED_SUFFIXES = ["localhost", "local", "internal", "arpa", "invalid", "example", "test", "lan", "home"];

/**
 * Cleans up what the user typed and checks it is a real-looking public
 * domain. Accepts "Acme.com", "https://acme.com/about", "news@acme.com" and
 * international names like "münchen.de" (converted to "xn--mnchen-3ya.de").
 */
export function parseDomain(input: string): { ok: true; domain: string } | { ok: false; error: string } {
  let value = String(input ?? "").trim().toLowerCase();
  if (!value) return { ok: false, error: "Enter a domain like acme.com." };
  if (value.length > 300) return { ok: false, error: "That domain is too long." };

  // Be forgiving about common copy-paste forms.
  value = value.replace(/^[a-z]+:\/\//, ""); // https://
  value = value.split(/[/?#]/)[0]; // /path?query
  if (value.includes("@")) value = value.slice(value.lastIndexOf("@") + 1); // an email address
  value = value.replace(/\.$/, ""); // trailing dot

  if (/[\s:[\]]/.test(value)) return { ok: false, error: "Enter just the domain, like acme.com." };

  const ascii = domainToASCII(value);
  if (!ascii) return { ok: false, error: "That doesn't look like a valid domain." };
  if (ascii.length > 253) return { ok: false, error: "That domain is too long." };

  const labels = ascii.split(".");
  if (labels.length < 2) return { ok: false, error: "Enter a full domain, like acme.com." };
  if (!labels.every((l) => LABEL.test(l))) {
    return { ok: false, error: "A domain may only contain letters, numbers, hyphens and dots." };
  }
  if (!TLD.test(labels[labels.length - 1])) return { ok: false, error: "That doesn't look like a public domain." };
  if (BLOCKED_SUFFIXES.includes(labels[labels.length - 1])) {
    return { ok: false, error: "Use a public domain (local or test domains can't send email)." };
  }
  return { ok: true, domain: ascii };
}

/**
 * Validates a DKIM selector such as "s1", "resend" or "selector1". If the user
 * pastes the whole name ("s1._domainkey.acme.com") we keep just "s1".
 */
export function parseSelector(input: string): { ok: true; selector: string } | { ok: false; error: string } {
  let value = String(input ?? "").trim().toLowerCase().replace(/\.$/, "");
  const marker = value.indexOf("._domainkey");
  if (marker !== -1) value = value.slice(0, marker);
  if (!value) return { ok: false, error: "Enter a selector, like s1." };
  if (value.length > 100) return { ok: false, error: "That selector is too long." };
  const part = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/;
  if (!value.split(".").every((p) => part.test(p))) {
    return { ok: false, error: "A selector may only contain letters, numbers, hyphens, underscores and dots." };
  }
  return { ok: true, selector: value };
}

// ── Low-level lookups ───────────────────────────────────────────────────────

// Each try waits up to 2.5 s and we try twice, so one lookup takes ~5 s at most.
const resolver = new Resolver({ timeout: 2500, tries: 2 });
const HARD_TIMEOUT_MS = 6000;

type Lookup<T> = { ok: true; records: T[] } | { ok: false; kind: "none" | "error"; code: string };

// Codes that mean "the name or record doesn't exist" (a real answer, not a failure).
const NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ENONAME"]);

async function lookup<T>(run: () => Promise<T[]>): Promise<Lookup<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Belt and braces: even if the resolver ignores its own timeout, we give up.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), HARD_TIMEOUT_MS);
  });
  try {
    const records = await Promise.race([run(), timeout]);
    return { ok: true, records };
  } catch (error) {
    const code = String((error as { code?: unknown })?.code ?? "EUNKNOWN");
    return { ok: false, kind: NOT_FOUND_CODES.has(code) ? "none" : "error", code };
  } finally {
    clearTimeout(timer);
  }
}

/** TXT records arrive split into 255-character chunks; join each record back together. */
async function txt(name: string): Promise<Lookup<string>> {
  const result = await lookup(() => resolver.resolveTxt(name));
  if (!result.ok) return result;
  return { ok: true, records: result.records.map((chunks) => chunks.join("")) };
}

const COULD_NOT_CHECK = "We couldn't reach DNS to check this (it timed out or the DNS server returned an error). Try again in a minute.";

// ── SPF ─────────────────────────────────────────────────────────────────────

// Text found in an SPF include → the sending service it belongs to.
const KNOWN_SPF_PROVIDERS: { match: string; label: string }[] = [
  { match: "amazonses.com", label: "Amazon SES" },
  { match: "_spf.google.com", label: "Google (Gmail / Workspace)" },
  { match: "sendgrid.net", label: "SendGrid" },
  { match: "mailgun.org", label: "Mailgun" },
  { match: "spf.mtasv.net", label: "Postmark" },
  { match: "spf.protection.outlook.com", label: "Microsoft 365 / Outlook" },
  { match: "zoho", label: "Zoho Mail" },
  { match: "spf.brevo.com", label: "Brevo" },
  { match: "sendinblue.com", label: "Brevo (Sendinblue)" },
];

function detectProviders(record: string): string[] {
  const includes = [...record.matchAll(/\b(?:include:|redirect=)(\S+)/gi)].map((m) => m[1].toLowerCase());
  const labels = new Set<string>();
  for (const inc of includes) {
    for (const p of KNOWN_SPF_PROVIDERS) if (inc.includes(p.match)) labels.add(p.label);
  }
  return [...labels];
}

/** Terms in an SPF record that cost a DNS lookup (RFC 7208 allows 10 in total). */
function lookupTerms(record: string): { count: number; follow: string[] } {
  let count = 0;
  const follow: string[] = [];
  for (const term of record.split(/\s+/).slice(1)) {
    const t = term.toLowerCase().replace(/^[+?~-]/, "");
    const include = /^include:(.+)$/.exec(t);
    const redirect = /^redirect=(.+)$/.exec(t);
    if (include || redirect) {
      count++;
      const target = (include ?? redirect)![1];
      // Macros like %{i} can't be followed; count them but stop there.
      if (!target.includes("%")) follow.push(target);
    } else if (/^(a|mx|ptr|exists)(:|\/|$)/.test(t)) {
      count++;
    }
  }
  return { count, follow };
}

/**
 * Counts DNS lookups across the record and everything it includes, the way
 * receiving servers do. "Roughly": we stop after a fixed budget so a huge or
 * looping chain can't make the check slow.
 */
async function countSpfLookups(record: string): Promise<number> {
  let budget = 15; // max extra TXT lookups we're willing to do
  const seen = new Set<string>();

  async function walk(rec: string, depth: number): Promise<number> {
    const { count, follow } = lookupTerms(rec);
    if (depth >= 5) return count;
    const children = await Promise.all(
      follow.map(async (name) => {
        if (seen.has(name) || budget <= 0) return 0;
        seen.add(name);
        budget--;
        const res = await txt(name);
        const child = res.ok ? res.records.find((r) => /^v=spf1(\s|$)/i.test(r)) : undefined;
        return child ? walk(child, depth + 1) : 0;
      }),
    );
    return count + children.reduce((a, b) => a + b, 0);
  }

  return walk(record, 0);
}

async function checkSpf(domain: string, ctx: CheckContext): Promise<SpfCheck> {
  const expected = ctx.expectedSpfIncludes?.length ? ctx.expectedSpfIncludes : ["include:<your provider's SPF domain>"];
  const example: ExampleRecord = { type: "TXT", host: domain, value: `v=spf1 ${expected.join(" ")} ~all` };
  const base = { host: domain, providers: [] as string[], lookupCount: 0, notes: [] as string[] };

  const res = await txt(domain);
  if (!res.ok && res.kind === "error") {
    return { ...base, status: "unknown", found: [], summary: COULD_NOT_CHECK };
  }
  const all = res.ok ? res.records : [];
  const spfRecords = all.filter((r) => /^v=spf1(\s|$)/i.test(r.trim()));

  // Resend sends from a "send." subdomain, so its SPF lives there.
  const notes: string[] = [];
  if (ctx.usesResend) {
    const sub = await txt(`send.${domain}`);
    const subSpf = sub.ok ? sub.records.find((r) => /^v=spf1(\s|$)/i.test(r)) : undefined;
    if (subSpf && /amazonses\.com/i.test(subSpf)) {
      notes.push(`send.${domain} has an SPF record for Resend (include:amazonses.com). Good.`);
    } else {
      notes.push(
        `Resend checks SPF on send.${domain}. Add the TXT record "v=spf1 include:amazonses.com ~all" on send.${domain} (Resend shows it in its Domains page).`,
      );
    }
  }

  if (spfRecords.length === 0) {
    return {
      ...base,
      notes,
      status: "missing",
      found: [],
      summary: "No SPF record found.",
      howToFix:
        "SPF lists the services allowed to send email for your domain. In your DNS provider (where you bought the domain), add ONE TXT record on the domain itself. Include every service that sends email for you (your email provider and your mailbox provider).",
      example,
    };
  }

  const record = spfRecords[0].trim();
  const providers = detectProviders(spfRecords.join(" "));
  const lookupCount = await countSpfLookups(record);
  const problems: string[] = [];

  if (spfRecords.length > 1) {
    problems.push(
      `You have ${spfRecords.length} SPF records. Only one is allowed: with more, SPF fails for everyone. Merge them into one record.`,
    );
  }
  const allTerm = /(?:^|\s)([+?~-]?)all(?:\s|$)/i.exec(record);
  if (allTerm && (allTerm[1] === "" || allTerm[1] === "+")) {
    problems.push(`"${allTerm[1]}all" lets ANY server in the world send as your domain. Change it to "~all" (or "-all").`);
  } else if (allTerm && allTerm[1] === "?") {
    problems.push(`"?all" is neutral and gives no protection. "~all" is a safer ending.`);
  } else if (!allTerm && !/redirect=/i.test(record)) {
    notes.push(`The record has no "all" at the end. Adding "~all" is recommended.`);
  }
  if (lookupCount > 10) {
    problems.push(
      `This record needs about ${lookupCount} DNS lookups; the limit is 10, so SPF may fail. Remove services you no longer use.`,
    );
  }
  for (const inc of ctx.expectedSpfIncludes ?? []) {
    const target = inc.replace(/^include:/, "");
    if (!record.toLowerCase().includes(target)) {
      notes.push(`Your provider usually needs "${inc}" in SPF, and we didn't see it.`);
    }
  }
  if (providers.length) notes.push(`Recognised senders: ${providers.join(", ")}.`);
  notes.push(`About ${lookupCount} of 10 allowed DNS lookups used.`);

  if (problems.length) {
    return {
      ...base,
      status: "warning",
      found: spfRecords,
      providers,
      lookupCount,
      summary: "SPF record found, but it has a problem.",
      notes: [...problems, ...notes],
      howToFix: problems.join(" "),
      example,
    };
  }
  return {
    ...base,
    status: "pass",
    found: spfRecords,
    providers,
    lookupCount,
    summary: "SPF record found and looks fine.",
    notes,
  };
}

// ── DKIM ────────────────────────────────────────────────────────────────────

async function checkSelector(domain: string, selector: string): Promise<DkimCheck> {
  const host = `${selector}._domainkey.${domain}`;
  // Many providers ask for a CNAME (pointing at a key they host), others for a
  // TXT with the key itself. resolveTxt follows the CNAME, so we do both.
  const [cname, text] = await Promise.all([lookup(() => resolver.resolveCname(host)), txt(host)]);
  const target = cname.ok ? cname.records[0] : undefined;
  const found = [
    ...(target ? [`CNAME → ${target}`] : []),
    ...(text.ok ? text.records.map((r) => (r.length > 120 ? `${r.slice(0, 117)}…` : r)) : []),
  ];

  const key = text.ok ? text.records.find((r) => /(^|;)\s*(v=DKIM1|p=)/i.test(r)) : undefined;
  if (key) {
    if (/(^|;)\s*p=\s*(;|$)/i.test(key)) {
      return {
        selector, host, found, status: "warning", notes: [],
        summary: `Selector "${selector}" exists but its key is empty (revoked).`,
        howToFix: "Copy the current DKIM record from your email provider's dashboard and replace this one.",
      };
    }
    return { selector, host, found, status: "pass", notes: [], summary: `DKIM key found for selector "${selector}".` };
  }
  if (target) {
    return {
      selector, host, found, status: "warning", notes: [],
      summary: `Selector "${selector}" points to ${target}, but no key was found there yet.`,
      howToFix: "Check the CNAME value against your provider's dashboard. New records can take up to a few hours to work.",
    };
  }
  if (!cname.ok && cname.kind === "error" && !text.ok && text.kind === "error") {
    return { selector, host, found, status: "unknown", notes: [], summary: COULD_NOT_CHECK };
  }
  return { selector, host, found, status: "missing", notes: [], summary: `No DKIM record for selector "${selector}".` };
}

async function checkDkim(domain: string, selectors: string[]): Promise<DomainCheckResult["dkim"]> {
  const host = `<selector>._domainkey.${domain}`;
  const fix =
    "DKIM adds a digital signature to your emails. Your email provider (SES, Resend, SendGrid, Google…) gives you the exact DKIM record(s) when you add your domain there. Copy them into your DNS, then add the selector here (the part before ._domainkey) and check again.";

  if (selectors.length === 0) {
    return {
      host, found: [], notes: [], selectors: [], status: "missing",
      summary: "No DKIM selectors to check yet.",
      howToFix: `${fix} Amazon SES uses three random-looking selectors; copy them from SES → Identities → your domain.`,
    };
  }

  const results = await Promise.all(selectors.map((s) => checkSelector(domain, s)));
  const passing = results.filter((r) => r.status === "pass");
  const base = { host, found: passing.map((r) => r.host), notes: [], selectors: results };

  if (passing.length) {
    return {
      ...base,
      status: "pass",
      summary: `DKIM is set up (${passing.map((r) => `"${r.selector}"`).join(", ")}).`,
    };
  }
  if (results.some((r) => r.status === "warning")) {
    return { ...base, status: "warning", summary: "A DKIM record exists but isn't working yet.", howToFix: fix };
  }
  if (results.every((r) => r.status === "unknown")) {
    return { ...base, status: "unknown", summary: COULD_NOT_CHECK };
  }
  return {
    ...base,
    status: "missing",
    summary: `No DKIM key found for the ${results.length} selector${results.length === 1 ? "" : "s"} we tried.`,
    howToFix: `${fix} If your provider uses a different selector, add it below.`,
    example: { type: "TXT", host: `<selector>._domainkey.${domain}`, value: "v=DKIM1; k=rsa; p=<public key from your provider>" },
  };
}

// ── DMARC ───────────────────────────────────────────────────────────────────

function parseTags(record: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of record.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) tags[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return tags;
}

async function checkDmarc(domain: string): Promise<DmarcCheck> {
  const host = `_dmarc.${domain}`;
  const example: ExampleRecord = { type: "TXT", host, value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` };
  const howToFixMissing =
    "DMARC tells inboxes what to do with email that fails SPF/DKIM. Gmail and Yahoo require it for bulk senders. Start with p=none (monitor only: nothing gets blocked) and the reports address, then move to p=quarantine once everything passes.";

  let res = await txt(host);
  let usedHost = host;
  // No record on a subdomain (news.acme.com)? Receivers fall back to the
  // main domain's record (acme.com), so we do too. (Roughly: we take the last
  // two labels, which is right for most domains.)
  const labels = domain.split(".");
  const hasRecord = (r: Lookup<string>) => r.ok && r.records.some((x) => /^v=DMARC1(\s|;|$)/i.test(x.trim()));
  if (!hasRecord(res) && labels.length > 2 && !(!res.ok && res.kind === "error")) {
    const parentHost = `_dmarc.${labels.slice(-2).join(".")}`;
    const parent = await txt(parentHost);
    if (hasRecord(parent)) {
      res = parent;
      usedHost = parentHost;
    }
  }

  if (!res.ok && res.kind === "error") {
    return { host, found: [], notes: [], policy: null, status: "unknown", summary: COULD_NOT_CHECK };
  }
  const records = res.ok ? res.records.filter((r) => /^v=DMARC1(\s|;|$)/i.test(r.trim())) : [];
  if (records.length === 0) {
    return {
      host, found: [], notes: [], policy: null, status: "missing",
      summary: "No DMARC record found. Gmail and Yahoo require one for bulk sending.",
      howToFix: howToFixMissing,
      example,
    };
  }

  const tags = parseTags(records[0]);
  const p = (tags.p ?? "").toLowerCase();
  const policy = p === "none" || p === "quarantine" || p === "reject" ? p : null;
  const notes: string[] = [];
  if (usedHost !== host) notes.push(`Found on ${usedHost} (applies to subdomains too${tags.sp ? `, subdomain policy sp=${tags.sp}` : ""}).`);
  if (!tags.rua) notes.push("No rua= reports address. Adding one (e.g. rua=mailto:dmarc@yourdomain) shows you who sends as your domain.");
  if (policy === "none") notes.push("p=none only monitors. Once SPF/DKIM pass reliably, consider p=quarantine for real protection.");

  if (records.length > 1) {
    return {
      host: usedHost, found: records, policy, notes, status: "warning",
      summary: `There are ${records.length} DMARC records. Only one is allowed, so receivers may ignore them all.`,
      howToFix: "Delete the extra records and keep one.",
      example,
    };
  }
  if (!policy) {
    return {
      host: usedHost, found: records, policy, notes, status: "warning",
      summary: "DMARC record found, but its policy (p=) is missing or invalid.",
      howToFix: 'The record must contain "p=none", "p=quarantine" or "p=reject".',
      example,
    };
  }
  return {
    host: usedHost, found: records, policy, notes, status: "pass",
    summary: `DMARC record found. Policy: ${policy}.`,
  };
}

// ── MX (info only) ──────────────────────────────────────────────────────────

async function checkMx(domain: string): Promise<{ mx: RecordCheck; nxdomain: boolean }> {
  const res = await lookup(() => resolver.resolveMx(domain));
  // ENOTFOUND = the name doesn't exist at all (ENODATA = exists, but no MX).
  const nxdomain = !res.ok && res.code === "ENOTFOUND";
  return { mx: mxCheck(domain, res, nxdomain), nxdomain };
}

function mxCheck(domain: string, res: Lookup<{ priority: number; exchange: string }>, nxdomain: boolean): RecordCheck {
  if (nxdomain) {
    return {
      host: domain, found: [], notes: [], status: "missing",
      summary: "This domain doesn't exist in DNS. Check the spelling.",
    };
  }
  if (!res.ok && res.kind === "error") {
    return { host: domain, found: [], notes: [], status: "unknown", summary: COULD_NOT_CHECK };
  }
  const records = res.ok ? [...res.records].sort((a, b) => a.priority - b.priority) : [];
  if (records.length === 0) {
    return {
      host: domain, found: [], notes: [], status: "missing",
      summary: "No MX records: this domain can't receive email.",
      howToFix: "Not required for sending, but replies to your campaigns will bounce, and some inboxes trust domains that can't receive mail less. Set up a mailbox (Google Workspace, Zoho, Microsoft 365…) if you want replies.",
    };
  }
  return {
    host: domain, notes: [], status: "pass",
    found: records.map((r) => `${r.priority} ${r.exchange}`),
    summary: "This domain can receive email (replies will reach you).",
  };
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Checks SPF, DKIM (for the given selectors), DMARC and MX for a domain.
 * Never throws for DNS problems: each record reports its own status.
 * Throws only if `domain` isn't valid (callers should use parseDomain first).
 */
export async function checkDomain(
  domain: string,
  selectors: string[],
  ctx: CheckContext = {},
): Promise<DomainCheckResult> {
  const parsed = parseDomain(domain);
  if (!parsed.ok) throw new Error(parsed.error);
  const name = parsed.domain;

  // Validate and de-duplicate selectors; cap them so one check stays quick.
  const cleanSelectors = [
    ...new Set(selectors.map(parseSelector).flatMap((s) => (s.ok ? [s.selector] : []))),
  ].slice(0, 20);

  const [spf, dkim, dmarc, { mx, nxdomain }] = await Promise.all([
    checkSpf(name, ctx),
    checkDkim(name, cleanSelectors),
    checkDmarc(name),
    checkMx(name),
  ]);

  return {
    version: 1,
    domain: name,
    checkedAt: new Date().toISOString(),
    domainExists: !nxdomain,
    spf,
    dkim,
    dmarc,
    mx,
  };
}

/** Reads a stored result back from the database, ignoring old or broken shapes. */
export function readStoredResult(json: unknown): DomainCheckResult | null {
  if (json && typeof json === "object" && (json as { version?: unknown }).version === 1) {
    return json as DomainCheckResult;
  }
  return null;
}
