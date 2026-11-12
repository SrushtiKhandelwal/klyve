import "server-only";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DEFAULT_THEME,
  FONT_STACKS,
  SOCIAL_NETWORKS,
  colorSchema,
  fontFamilySchema,
  imageSrcSchema,
  linkSchema,
  type BrandTheme,
  type SocialNetwork,
} from "@/lib/templates/document";

// The workspace's brand kit: logo, colours, font, address and social links.
// New templates and starter templates read it (via getBrandTheme) so they
// start in the workspace's own look. Existing templates never change when the
// brand kit changes: they keep the values they were created with.

/** A workspace object (from requireActiveWorkspace) or just its id. */
type WorkspaceRef = string | { id: string; name?: string };
const wsId = (ws: WorkspaceRef) => (typeof ws === "string" ? ws : ws.id);

export const BRAND_LIMITS = {
  companyName: 100,
  address: 300,
  url: 500,
} as const;

export type SocialLinks = Partial<Record<SocialNetwork, string>>;

/** The brand kit as the settings page shows it (empty strings = not filled in). */
export type BrandKitData = {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  address: string;
  websiteUrl: string | null;
  socialLinks: SocialLinks;
};

/** What a workspace has before it ever saves a brand kit (matches the DB defaults). */
export const DEFAULT_BRAND_KIT: BrandKitData = {
  companyName: "",
  logoUrl: null,
  primaryColor: DEFAULT_THEME.primaryColor,
  secondaryColor: DEFAULT_THEME.secondaryColor,
  backgroundColor: DEFAULT_THEME.backgroundColor,
  textColor: DEFAULT_THEME.textColor,
  fontFamily: DEFAULT_THEME.fontFamily,
  address: "",
  websiteUrl: null,
  socialLinks: {},
};

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Website and social links must be real web addresses (no mailto:, no merge
 * tags). Our stricter check runs first for a clear message, then the editor's
 * shared linkSchema has the final say.
 */
const webUrlSchema = z
  .string()
  .trim()
  .max(BRAND_LIMITS.url, `Keep links under ${BRAND_LIMITS.url} characters.`)
  .refine((v) => v === "" || isWebUrl(v), "Use a full web address starting with https://.")
  .pipe(linkSchema);

/** One of our web-safe font stacks (same list as the editor's fontFamilySchema). */
const fontSchema = z
  .string()
  .refine((v) => fontFamilySchema.safeParse(v).success, "Choose one of the listed fonts.");

function isWebUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname;
  } catch {
    return false;
  }
}

export const brandKitInputSchema = z.object({
  companyName: z.string().trim().max(BRAND_LIMITS.companyName, `Keep it under ${BRAND_LIMITS.companyName} characters.`),
  /** "" = no logo. Usually "/media/<id>" from the media library. */
  logoUrl: imageSrcSchema,
  primaryColor: colorSchema,
  secondaryColor: colorSchema,
  backgroundColor: colorSchema,
  textColor: colorSchema,
  fontFamily: fontSchema,
  // Multi-line is fine. We just tidy line endings and trailing spaces.
  address: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).join("\n").trim())
    .pipe(z.string().max(BRAND_LIMITS.address, `Keep the address under ${BRAND_LIMITS.address} characters.`)),
  websiteUrl: webUrlSchema,
  socialLinks: z.partialRecord(z.enum(SOCIAL_NETWORKS), webUrlSchema),
});
export type BrandKitInput = z.input<typeof brandKitInputSchema>;
export type BrandKitFieldErrors = Partial<Record<string, string[]>>;

// ── Reading ─────────────────────────────────────────────────────────────────

/** Keeps only known networks with valid web addresses (old/bad data is dropped). */
function cleanSocialLinks(raw: unknown): SocialLinks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const links: SocialLinks = {};
  for (const network of SOCIAL_NETWORKS) {
    const url = (raw as Record<string, unknown>)[network];
    if (typeof url === "string" && isWebUrl(url.trim())) links[network] = url.trim();
  }
  return links;
}

/** One database read per request, however many components ask. */
const loadBrandKit = cache(async (workspaceId: string) =>
  db.brandKit.findUnique({ where: { workspaceId } }),
);

/** The saved brand kit, or the defaults if this workspace never saved one. */
export async function getBrandKit(ws: WorkspaceRef): Promise<BrandKitData> {
  const row = await loadBrandKit(wsId(ws));
  if (!row) return { ...DEFAULT_BRAND_KIT };
  return {
    companyName: row.companyName,
    logoUrl: row.logoUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    backgroundColor: row.backgroundColor,
    textColor: row.textColor,
    fontFamily: row.fontFamily,
    address: row.address,
    websiteUrl: row.websiteUrl,
    socialLinks: cleanSocialLinks(row.socialLinks),
  };
}

/** Turns any stored font into one of our web-safe stacks ("Georgia" → "Georgia, 'Times New Roman', serif"). */
export function coerceFont(value: string): string {
  const v = value.trim().toLowerCase();
  const match =
    FONT_STACKS.find((f) => f.value.toLowerCase() === v) ??
    FONT_STACKS.find((f) => f.label.toLowerCase() === v) ??
    FONT_STACKS.find((f) => v.startsWith(f.label.toLowerCase()));
  return match ? match.value : DEFAULT_THEME.fontFamily;
}

const validColor = (value: string, fallback: string) => (colorSchema.safeParse(value).success ? value : fallback);

/**
 * The brand kit in the shape templates use. Empty or invalid values fall back
 * to DEFAULT_THEME, so callers always get something they can render.
 * If no company name was set, the workspace's name is used (when given).
 */
export async function getBrandTheme(ws: WorkspaceRef): Promise<BrandTheme> {
  const kit = await getBrandKit(ws);
  const workspaceName = typeof ws === "string" ? "" : (ws.name ?? "").trim();
  const logo = kit.logoUrl?.trim() ?? "";
  const website = kit.websiteUrl?.trim() ?? "";
  return {
    primaryColor: validColor(kit.primaryColor, DEFAULT_THEME.primaryColor),
    secondaryColor: validColor(kit.secondaryColor, DEFAULT_THEME.secondaryColor),
    backgroundColor: validColor(kit.backgroundColor, DEFAULT_THEME.backgroundColor),
    textColor: validColor(kit.textColor, DEFAULT_THEME.textColor),
    fontFamily: coerceFont(kit.fontFamily),
    companyName: kit.companyName.trim() || workspaceName || DEFAULT_THEME.companyName,
    address: kit.address.trim() || DEFAULT_THEME.address,
    logoUrl: logo && imageSrcSchema.safeParse(logo).success ? logo : DEFAULT_THEME.logoUrl,
    websiteUrl: website && isWebUrl(website) ? website : DEFAULT_THEME.websiteUrl,
    socialLinks: kit.socialLinks,
  };
}

// ── Writing ─────────────────────────────────────────────────────────────────

export type SaveBrandKitResult =
  | { ok: true; brandKit: BrandKitData }
  | { ok: false; error: string; fieldErrors?: BrandKitFieldErrors };

/** Validates and saves (creates the row the first time). Role checks are the caller's job. */
export async function saveBrandKit(ws: WorkspaceRef, input: unknown): Promise<SaveBrandKitResult> {
  const parsed = brandKitInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: BrandKitFieldErrors = {};
    for (const issue of parsed.error.issues) {
      // "socialLinks.instagram" style keys, so the form can show the error by its field.
      const key = issue.path.join(".");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const v = parsed.data;
  const socialLinks: SocialLinks = {};
  for (const network of SOCIAL_NETWORKS) {
    const url = v.socialLinks[network];
    if (url) socialLinks[network] = url;
  }
  const data = {
    companyName: v.companyName,
    logoUrl: v.logoUrl || null,
    primaryColor: v.primaryColor.toLowerCase(),
    secondaryColor: v.secondaryColor.toLowerCase(),
    backgroundColor: v.backgroundColor.toLowerCase(),
    textColor: v.textColor.toLowerCase(),
    fontFamily: v.fontFamily,
    address: v.address,
    websiteUrl: v.websiteUrl || null,
    socialLinks,
  };

  const workspaceId = wsId(ws);
  const row = await db.brandKit.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data,
  });
  return {
    ok: true,
    brandKit: { ...data, companyName: row.companyName, socialLinks: cleanSocialLinks(row.socialLinks) },
  };
}

/** Called when an image is deleted: if it was the logo, remove the logo. */
export async function clearLogoIfMatches(workspaceId: string, url: string): Promise<void> {
  await db.brandKit.updateMany({ where: { workspaceId, logoUrl: url }, data: { logoUrl: null } });
}
