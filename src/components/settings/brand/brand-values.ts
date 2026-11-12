import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/templates/document";

// Shared by the brand form and its preview (safe in the browser).

/** The form's values: every text field is a plain string ("" = empty). */
export type BrandFormValues = {
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  address: string;
  websiteUrl: string;
  socialLinks: Record<SocialNetwork, string>;
};

export const SOCIAL_NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
  website: "Website",
};

export const SOCIAL_PLACEHOLDERS: Record<SocialNetwork, string> = {
  facebook: "https://facebook.com/yourpage",
  instagram: "https://instagram.com/yourname",
  x: "https://x.com/yourname",
  linkedin: "https://linkedin.com/company/yourcompany",
  youtube: "https://youtube.com/@yourchannel",
  tiktok: "https://tiktok.com/@yourname",
  pinterest: "https://pinterest.com/yourname",
  whatsapp: "https://wa.me/15551234567",
  website: "https://yourcompany.com",
};

export function emptySocialLinks(): Record<SocialNetwork, string> {
  return Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, ""])) as Record<SocialNetwork, string>;
}
