import "server-only";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/consent";
import {
  describeSubscription,
  maskEmail,
  publicBrand,
  resolveUnsubscribeToken,
  type PublicBrandInfo,
  type RequestMeta,
  type SubscriptionState,
} from "@/lib/campaigns/unsubscribe";
import { isSuppressed } from "@/lib/suppression";

// The data behind the /p/<token> preference centre: which of the sender's
// PUBLIC lists this person is on, and saving their choices.
//
// Same security model as unsubscribe (lib/campaigns/unsubscribe.ts):
//  - The signed "unsubscribe" token is the only authorization and names one
//    recipient. We only ever touch the contact it leads to, in the campaign's
//    own workspace.
//  - Only lists marked "Show in preference centre" (isPublic) of THAT
//    workspace are ever shown or changed. A private list, or a list id from
//    another workspace slipped into the form, is silently ignored.

/** Most list ids we read from one form post (a workspace won't show more). */
const MAX_LIST_IDS = 200;

export type PreferenceList = {
  id: string;
  /** The public name (or the list's own name when none was given). */
  name: string;
  description: string | null;
  /** Is the person on this list right now? */
  subscribed: boolean;
};

export type PreferenceContext =
  | {
      ok: true;
      email: string;
      brand: PublicBrandInfo;
      state: SubscriptionState;
      canResubscribe: boolean;
      /**
       * The public lists to choose from. Empty when the workspace has none,
       * or when there's no contact to attach them to (contact deleted).
       */
      lists: PreferenceList[];
      /** On at least one PRIVATE list (so may still get those emails). */
      inPrivateLists: boolean;
    }
  | { ok: false };

export type SaveResult =
  | { ok: true; joined: number; left: number }
  | { ok: false; reason: "invalid" | "no_contact" | "not_subscribed" | "blocked" };

/** The name people see: publicName if set, else the list's own name. */
function displayName(list: { name: string; publicName: string | null }): string {
  return list.publicName?.trim() || list.name;
}

/** Everything the /p page needs. `{ ok: false }` for any invalid token. */
export async function getPreferenceContext(token: string): Promise<PreferenceContext> {
  const target = await resolveUnsubscribeToken(token);
  if (!target) return { ok: false };
  const { workspace, contact } = target;

  const [subscription, brand, publicLists, privateMembership] = await Promise.all([
    describeSubscription(target),
    publicBrand(workspace),
    contact
      ? db.contactList.findMany({
          where: { workspaceId: workspace.id, isPublic: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            publicName: true,
            publicDescription: true,
            // Just this contact's membership (0 or 1 row).
            members: { where: { contactId: contact.id }, select: { contactId: true } },
          },
        })
      : [],
    contact
      ? db.listMembership.findFirst({
          where: { contactId: contact.id, list: { workspaceId: workspace.id, isPublic: false } },
          select: { listId: true },
        })
      : null,
  ]);

  return {
    ok: true,
    email: maskEmail(target.recipient.email),
    brand,
    ...subscription,
    lists: publicLists.map((list) => ({
      id: list.id,
      name: displayName(list),
      description: list.publicDescription?.trim() || null,
      subscribed: list.members.length > 0,
    })),
    inPrivateLists: privateMembership !== null,
  };
}

/** The list ids ticked in the form (junk is dropped; ownership is checked later). */
export function readListIds(formData: FormData): string[] {
  return formData
    .getAll("list")
    .filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64)
    .slice(0, MAX_LIST_IDS);
}

/**
 * Saves the person's choices: they end up on exactly the ticked PUBLIC lists.
 * Private lists are never touched; unknown or foreign ids are ignored.
 * Only for someone who can receive email (subscribed, not bounced/suppressed):
 * an unsubscribed person resubscribes first.
 */
export async function savePreferencesByToken(
  token: string,
  requestedIds: string[],
  meta: RequestMeta = {},
): Promise<SaveResult> {
  const result = await db.$transaction(async (tx) => {
    const target = await resolveUnsubscribeToken(token, tx);
    if (!target) return { ok: false, reason: "invalid" } as const;
    const { workspace, contact } = target;
    if (!contact) return { ok: false, reason: "no_contact" } as const;
    if (contact.status === "BOUNCED" || contact.status === "COMPLAINED") {
      return { ok: false, reason: "blocked" } as const;
    }
    if (await isSuppressed(workspace.id, contact.email, { client: tx })) {
      return { ok: false, reason: "blocked" } as const;
    }
    if (contact.status !== "SUBSCRIBED" && contact.status !== "PENDING") {
      return { ok: false, reason: "not_subscribed" } as const;
    }

    // The ONLY lists this form may change: the workspace's public ones.
    const publicLists = await tx.contactList.findMany({
      where: { workspaceId: workspace.id, isPublic: true },
      select: { id: true, name: true, publicName: true },
    });
    const byId = new Map(publicLists.map((l) => [l.id, l]));
    const wanted = new Set(requestedIds.filter((id) => byId.has(id)));

    const current = await tx.listMembership.findMany({
      where: { contactId: contact.id, listId: { in: [...byId.keys()] } },
      select: { listId: true },
    });
    const currentIds = new Set(current.map((m) => m.listId));

    const toJoin = [...wanted].filter((id) => !currentIds.has(id));
    const toLeave = [...currentIds].filter((id) => !wanted.has(id));

    if (toJoin.length > 0) {
      await tx.listMembership.createMany({
        data: toJoin.map((listId) => ({ listId, contactId: contact.id })),
        skipDuplicates: true,
      });
    }
    if (toLeave.length > 0) {
      await tx.listMembership.deleteMany({
        // The list filter repeats the "public, this workspace" rule as a safety net.
        where: { contactId: contact.id, listId: { in: toLeave }, list: { workspaceId: workspace.id, isPublic: true } },
      });
    }

    // Names as the person saw them, so the record still reads well if a list
    // is renamed or deleted later.
    const describe = (id: string) => ({ id, name: displayName(byId.get(id)!) });
    return {
      ok: true,
      joined: toJoin.map(describe),
      left: toLeave.map(describe),
      workspaceId: workspace.id,
      contact,
    } as const;
  });

  if (!result.ok) return result;

  // Only real changes go into the consent record (saving the same choices
  // twice records nothing).
  if (result.joined.length > 0 || result.left.length > 0) {
    await recordConsent({
      workspaceId: result.workspaceId,
      contactId: result.contact.id,
      email: result.contact.email,
      type: "PREFERENCES_UPDATED",
      source: "preference_centre",
      ip: meta.ip && meta.ip !== "unknown" ? meta.ip : null,
      userAgent: meta.userAgent,
      detail: { joined: result.joined, left: result.left },
    });
  }
  return { ok: true, joined: result.joined.length, left: result.left.length };
}
