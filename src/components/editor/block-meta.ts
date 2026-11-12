// Names, icons and short descriptions for each block type and social network,
// shared by the block palette, the canvas and the properties panel.
import {
  Code,
  Columns2,
  Columns3,
  Columns4,
  Globe,
  Heading,
  Image,
  MousePointerClick,
  MoveVertical,
  PanelBottom,
  SeparatorHorizontal,
  Share2,
  Square,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { BlockType, SocialNetwork } from "@/lib/templates/document";

export const BLOCK_META: Record<BlockType, { label: string; icon: LucideIcon; hint: string }> = {
  heading: { label: "Heading", icon: Heading, hint: "A big title" },
  text: { label: "Text", icon: Type, hint: "Paragraphs and lists" },
  image: { label: "Image", icon: Image, hint: "A picture or logo" },
  button: { label: "Button", icon: MousePointerClick, hint: "A call to action" },
  divider: { label: "Divider", icon: SeparatorHorizontal, hint: "A line between parts" },
  spacer: { label: "Spacer", icon: MoveVertical, hint: "Empty space" },
  social: { label: "Social", icon: Share2, hint: "Links to your profiles" },
  video: { label: "Video", icon: Video, hint: "Thumbnail that links to a video" },
  html: { label: "HTML", icon: Code, hint: "Custom code (advanced)" },
  footer: { label: "Footer", icon: PanelBottom, hint: "Address and unsubscribe link" },
};

/** Palette order. */
export const BLOCK_ORDER: BlockType[] = ["heading", "text", "image", "button", "divider", "spacer", "social", "video", "footer", "html"];

export const RICH_TEXT_TYPES = new Set<BlockType>(["heading", "text", "footer"]);

export const SOCIAL_META: Record<SocialNetwork, { label: string; short: string; color: string }> = {
  facebook: { label: "Facebook", short: "f", color: "#1877f2" },
  instagram: { label: "Instagram", short: "ig", color: "#e4405f" },
  x: { label: "X (Twitter)", short: "X", color: "#000000" },
  linkedin: { label: "LinkedIn", short: "in", color: "#0a66c2" },
  youtube: { label: "YouTube", short: "▶", color: "#ff0000" },
  tiktok: { label: "TikTok", short: "tt", color: "#010101" },
  pinterest: { label: "Pinterest", short: "P", color: "#e60023" },
  whatsapp: { label: "WhatsApp", short: "wa", color: "#25d366" },
  website: { label: "Website", short: "www", color: "#52525b" },
};

export const WebsiteIcon = Globe;

/** Icon for a row layout tile, by number of columns. */
export function layoutIcon(columns: number): LucideIcon {
  if (columns === 2) return Columns2;
  if (columns === 3) return Columns3;
  if (columns >= 4) return Columns4;
  return Square;
}
