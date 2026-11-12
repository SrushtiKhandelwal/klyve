"use server";

import { refresh } from "next/cache";
import { saveBrandKit as saveBrandKitForWorkspace, type SaveBrandKitResult } from "@/lib/brand-kit";
import { SOCIAL_NETWORKS } from "@/lib/templates/document";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Action for Settings → Brand. The browser can send anything, so we
// check the role here and the library validates every field with zod
// (colours, font, web links, max lengths) before saving.

/** Copies only the fields we accept; anything extra the browser sends is ignored. */
function pickInput(input: unknown) {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawLinks = (v.socialLinks && typeof v.socialLinks === "object" ? v.socialLinks : {}) as Record<string, unknown>;
  const socialLinks: Record<string, unknown> = {};
  for (const network of SOCIAL_NETWORKS) {
    if (network in rawLinks) socialLinks[network] = rawLinks[network];
  }
  return {
    companyName: v.companyName,
    logoUrl: v.logoUrl ?? "",
    primaryColor: v.primaryColor,
    secondaryColor: v.secondaryColor,
    backgroundColor: v.backgroundColor,
    textColor: v.textColor,
    fontFamily: v.fontFamily,
    address: v.address,
    websiteUrl: v.websiteUrl ?? "",
    socialLinks,
  };
}

/** Saves the workspace's brand kit (owners and admins only). */
export async function saveBrandKit(input: unknown): Promise<SaveBrandKitResult> {
  const ws = await requireActiveWorkspace();
  if (ws.role !== "OWNER" && ws.role !== "ADMIN") {
    return { ok: false, error: "Only workspace owners and admins can change the brand kit." };
  }

  try {
    const result = await saveBrandKitForWorkspace(ws, pickInput(input));
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("saveBrandKit failed:", error);
    return { ok: false, error: "Something went wrong saving your brand kit. Please try again." };
  }
}
