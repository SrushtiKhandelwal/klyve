import { OG_ALT, OG_SIZE, renderOgImage } from "@/lib/og-image";

// Same share preview for X (Twitter) cards.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderOgImage();
}
