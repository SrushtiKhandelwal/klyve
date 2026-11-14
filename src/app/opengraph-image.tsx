import { OG_ALT, OG_SIZE, renderOgImage } from "@/lib/og-image";

// Share preview image for every page (Facebook, LinkedIn, WhatsApp, Slack...).
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgImage();
}
