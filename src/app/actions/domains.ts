"use server";

import { refresh } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { DOMAIN_RULES, runDomainCheck } from "@/app/(dashboard)/settings/domains/data";
import { db } from "@/lib/db";
import { parseDomain, parseSelector } from "@/lib/email/dns-check";
import { requireActiveWorkspace, type ActiveWorkspace } from "@/lib/workspace";

// Server Actions for Settings → Domains. Each one checks the workspace (and
// role) itself, and every query is filtered by the workspace id, so an id
// from another workspace simply finds nothing.

export type DomainActionResult = { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };

const NOT_ALLOWED = "Only workspace owners and admins can change domains.";

function canManage(ws: ActiveWorkspace) {
  return ws.role === "OWNER" || ws.role === "ADMIN";
}

const asId = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

/** Adds a domain (OWNER/ADMIN) and runs the first DNS check straight away. */
export async function addDomain(input: unknown): Promise<DomainActionResult & { domain?: string }> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };

  const parsed = parseDomain(typeof input === "string" ? input : "");
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const count = await db.sendingDomain.count({ where: { workspaceId: ws.id } });
  if (count >= DOMAIN_RULES.maxDomainsPerWorkspace) {
    return { ok: false, error: `You can add up to ${DOMAIN_RULES.maxDomainsPerWorkspace} domains.` };
  }

  let id: string;
  try {
    ({ id } = await db.sendingDomain.create({
      data: { workspaceId: ws.id, domain: parsed.domain },
      select: { id: true },
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: `${parsed.domain} is already in your list.` };
    }
    console.error("addDomain failed:", error);
    return { ok: false, error: "Something went wrong adding the domain. Please try again." };
  }

  try {
    await runDomainCheck(ws.id, id);
  } catch (error) {
    // The domain is saved; the user can press "Check DNS" again.
    console.error("addDomain: first check failed:", error);
  }
  refresh();
  return { ok: true, domain: parsed.domain };
}

/** Runs the DNS check. Anyone in the workspace may do this (rate-limited). */
export async function checkDomainDns(domainId: unknown): Promise<DomainActionResult> {
  const ws = await requireActiveWorkspace();
  const id = asId(domainId);
  if (!id) return { ok: false, error: "Domain not found." };

  try {
    const result = await runDomainCheck(ws.id, id);
    if (!result.ok) return result;
  } catch (error) {
    console.error("checkDomainDns failed:", error);
    return { ok: false, error: "Something went wrong checking DNS. Please try again." };
  }
  refresh();
  return { ok: true };
}

/** Adds a DKIM selector to look up (OWNER/ADMIN). */
export async function addDkimSelector(domainId: unknown, selector: unknown): Promise<DomainActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = asId(domainId);
  if (!id) return { ok: false, error: "Domain not found." };

  const parsed = parseSelector(typeof selector === "string" ? selector : "");
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const row = await db.sendingDomain.findFirst({ where: { id, workspaceId: ws.id }, select: { dkimSelectors: true } });
  if (!row) return { ok: false, error: "Domain not found." };
  if (row.dkimSelectors.includes(parsed.selector)) return { ok: false, error: "That selector is already in the list." };
  if (row.dkimSelectors.length >= DOMAIN_RULES.maxSelectorsPerDomain) {
    return { ok: false, error: `You can add up to ${DOMAIN_RULES.maxSelectorsPerDomain} selectors.` };
  }

  await db.sendingDomain.updateMany({
    where: { id, workspaceId: ws.id },
    data: { dkimSelectors: [...row.dkimSelectors, parsed.selector] },
  });
  refresh();
  return { ok: true };
}

export async function removeDkimSelector(domainId: unknown, selector: unknown): Promise<DomainActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = asId(domainId);
  if (!id) return { ok: false, error: "Domain not found." };

  const row = await db.sendingDomain.findFirst({ where: { id, workspaceId: ws.id }, select: { dkimSelectors: true } });
  if (!row) return { ok: false, error: "Domain not found." };

  await db.sendingDomain.updateMany({
    where: { id, workspaceId: ws.id },
    data: { dkimSelectors: row.dkimSelectors.filter((s) => s !== selector) },
  });
  refresh();
  return { ok: true };
}

export async function deleteDomain(domainId: unknown): Promise<DomainActionResult> {
  const ws = await requireActiveWorkspace();
  if (!canManage(ws)) return { ok: false, error: NOT_ALLOWED };
  const id = asId(domainId);
  if (!id) return { ok: false, error: "Domain not found." };

  const result = await db.sendingDomain.deleteMany({ where: { id, workspaceId: ws.id } });
  if (result.count === 0) return { ok: false, error: "Domain not found." };
  refresh();
  return { ok: true };
}
