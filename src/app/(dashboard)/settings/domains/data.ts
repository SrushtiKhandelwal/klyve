import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isFreeMailDomain } from "@/components/settings/domains/free-mail";
import { db } from "@/lib/db";
import { checkDomain, readStoredResult, type CheckContext, type DomainCheckResult } from "@/lib/email/dns-check";
import { PROVIDERS, type ProviderTypeValue } from "@/lib/email/provider-configs";

// Database helpers for Settings → Domains and its Server Actions.
// They take a workspaceId, so ONLY pass the id from requireActiveWorkspace().

export const DOMAIN_RULES = {
  /** One DNS check per domain per this many seconds. */
  checkCooldownSeconds: 30,
  maxDomainsPerWorkspace: 20,
  maxSelectorsPerDomain: 10,
} as const;

export type DomainRow = {
  id: string;
  domain: string;
  dkimSelectors: string[];
  lastResult: DomainCheckResult | null;
  lastCheckedAt: Date | null;
};

export async function listDomains(workspaceId: string): Promise<DomainRow[]> {
  const rows = await db.sendingDomain.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: { id: true, domain: true, dkimSelectors: true, lastResult: true, lastCheckedAt: true },
  });
  return rows.map((r) => ({ ...r, lastResult: readStoredResult(r.lastResult) }));
}

export type DomainSuggestion = { domain: string; senderCount: number; freeMail: boolean };

/** Domains used by the workspace's senders that aren't added yet, e.g. "acme.com (used by 2 senders)". */
export async function getDomainSuggestions(workspaceId: string, existing: string[]): Promise<DomainSuggestion[]> {
  const senders = await db.sender.findMany({ where: { workspaceId }, select: { email: true } });
  const counts = new Map<string, number>();
  for (const { email } of senders) {
    const domain = email.slice(email.lastIndexOf("@") + 1);
    if (domain && !existing.includes(domain)) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts]
    .map(([domain, senderCount]) => ({ domain, senderCount, freeMail: isFreeMailDomain(domain) }))
    .sort((a, b) => Number(a.freeMail) - Number(b.freeMail) || b.senderCount - a.senderCount);
}

// SPF "include:" each provider normally needs. SMTP depends on the server.
const SPF_INCLUDE_BY_TYPE: Partial<Record<ProviderTypeValue, string>> = {
  AMAZON_SES: "include:amazonses.com",
  SENDGRID: "include:sendgrid.net",
  MAILGUN: "include:mailgun.org",
  POSTMARK: "include:spf.mtasv.net",
};
const SPF_INCLUDE_BY_SMTP_HOST: { match: RegExp; include: string }[] = [
  { match: /gmail\.com|google\.com/, include: "include:_spf.google.com" },
  { match: /office365\.com|outlook\.com/, include: "include:spf.protection.outlook.com" },
  { match: /zoho\.in$/, include: "include:zohomail.in" },
  { match: /zoho\.eu$/, include: "include:zohomail.eu" },
  { match: /zoho\.com$/, include: "include:zohomail.com" },
  { match: /brevo\.com|sendinblue\.com/, include: "include:spf.brevo.com" },
];

export type ProviderDnsHints = CheckContext & {
  /** DKIM selectors the workspace's provider types usually use. */
  selectorHints: string[];
};

/** What the workspace's providers tell us about the DNS records to expect. */
export async function getProviderDnsHints(workspaceId: string): Promise<ProviderDnsHints> {
  // credentialsHint is the safe, already-masked summary (e.g. the SMTP host).
  const providers = await db.sendingProvider.findMany({
    where: { workspaceId },
    select: { type: true, credentialsHint: true },
  });
  const selectors = new Set<string>();
  const includes = new Set<string>();
  for (const p of providers) {
    const type = p.type as ProviderTypeValue;
    for (const s of PROVIDERS[type]?.dkimSelectorHints ?? []) selectors.add(s);
    const include = SPF_INCLUDE_BY_TYPE[type];
    if (include) includes.add(include);
    if (type === "SMTP") {
      const hint = (p.credentialsHint ?? {}) as Record<string, unknown>;
      const host = String(hint.host ?? "").toLowerCase().split(":")[0];
      const match = SPF_INCLUDE_BY_SMTP_HOST.find((h) => h.match.test(host));
      if (match) includes.add(match.include);
    }
  }
  return {
    selectorHints: [...selectors],
    expectedSpfIncludes: [...includes],
    usesResend: providers.some((p) => p.type === "RESEND"),
  };
}

export type RunCheckResult =
  | { ok: true; result: DomainCheckResult }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Runs a DNS check for one domain of this workspace and stores the result.
 * Limited to one check per domain per 30 seconds (also protects DNS servers
 * from someone clicking the button in a loop).
 */
export async function runDomainCheck(workspaceId: string, domainId: string): Promise<RunCheckResult> {
  const now = new Date();
  const cooldownMs = DOMAIN_RULES.checkCooldownSeconds * 1000;

  // Claim the check in ONE conditional update, so two clicks at once can't both run.
  const claimed = await db.sendingDomain.updateMany({
    where: {
      id: domainId,
      workspaceId,
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: new Date(now.getTime() - cooldownMs) } }],
    },
    data: { lastCheckedAt: now },
  });

  const row = await db.sendingDomain.findFirst({
    where: { id: domainId, workspaceId },
    select: { domain: true, dkimSelectors: true, lastCheckedAt: true },
  });
  if (!row) return { ok: false, error: "Domain not found." };
  if (claimed.count === 0) {
    const last = row.lastCheckedAt?.getTime() ?? now.getTime();
    const wait = Math.max(1, Math.ceil((last + cooldownMs - now.getTime()) / 1000));
    return { ok: false, error: `Checked moments ago. Try again in ${wait} seconds.`, retryAfterSeconds: wait };
  }

  const hints = await getProviderDnsHints(workspaceId);
  const result = await checkDomain(row.domain, [...row.dkimSelectors, ...hints.selectorHints], hints);

  await db.sendingDomain.updateMany({
    where: { id: domainId, workspaceId },
    data: { lastResult: result as unknown as Prisma.InputJsonValue, lastCheckedAt: new Date() },
  });
  return { ok: true, result };
}
