// Starters: Re-engagement (win back people who've gone quiet).
import { pad } from "@/lib/templates/document";
import {
  FIRST_NAME,
  brandFooter,
  brandHeader,
  button,
  divider,
  emailDoc,
  heading,
  image,
  onColor,
  section,
  shade,
  siteUrl,
  subheading,
  text,
  tint,
  type StarterDefinition,
} from "./helpers";

export const weMissYou: StarterDefinition = {
  id: "we-miss-you",
  name: "We miss you",
  category: "Re-engagement",
  description: "A heartfelt win-back email with a welcome-back gift code and a reminder of what's new.",
  subject: `We miss you, ${FIRST_NAME} 💌`,
  preheader: "It's been a while. Here's 20% off to welcome you back.",
  build: (theme) => {
    const soft = tint(theme.primaryColor, 0.9);
    const deep = shade(theme.primaryColor, 0.35);
    return emailDoc(theme, [
      brandHeader(theme),
      section(
        [[
          heading("👋", { align: "center", fontSize: 48, padding: pad(36, 24, 0, 24) }),
          heading(`It's been a while, ${FIRST_NAME}`, { align: "center", fontSize: 32, color: deep, padding: pad(8, 24) }),
          text(
            "<p>We noticed you haven't stopped by lately, and honestly, it's not the same without you. A lot has changed, and we think you'll love it.</p>",
            { align: "center", padding: pad(0, 40, 20, 40) },
          ),
        ]],
        { backgroundColor: soft, padding: pad(0) },
      ),
      section(
        [{
          backgroundColor: theme.primaryColor,
          blocks: [
            text("<p>A welcome-back gift, just for you</p>", { align: "center", color: onColor(theme.primaryColor), fontSize: 15, padding: pad(20, 24, 0, 24) }),
            heading("20% OFF · COMEBACK20", { align: "center", fontSize: 26, color: onColor(theme.primaryColor), padding: pad(4, 24, 20, 24) }),
          ],
        }],
        { backgroundColor: soft, padding: pad(0, 40, 36, 40) },
      ),
      section([[
        subheading("What you've missed", { align: "center", fontSize: 18, padding: pad(28, 24, 4, 24) }),
      ]]),
      section([
        [image("What's new 1", { borderRadius: 8, padding: pad(8, 12) }), text("<p><strong>Fresh new look</strong><br>Easier and faster than ever.</p>", { align: "center", fontSize: 14, padding: pad(0, 12, 8, 12) })],
        [image("What's new 2", { borderRadius: 8, padding: pad(8, 12) }), text("<p><strong>Your old favourites</strong><br>Back in stock and better.</p>", { align: "center", fontSize: 14, padding: pad(0, 12, 8, 12) })],
      ], { padding: pad(0, 12) }),
      section([[button("Come back and see", siteUrl(theme), theme, { padding: pad(16, 24, 32, 24), borderRadius: 30 })]]),
      brandFooter(theme, { note: "<p>Not interested anymore? No hard feelings: you can unsubscribe below.</p>" }),
    ]);
  },
};

export const stillInterested: StarterDefinition = {
  id: "still-interested",
  name: "Still want to hear from us?",
  category: "Re-engagement",
  description: "A respectful list clean-up email: one tap to stay subscribed, or an easy way out.",
  subject: "Should we keep in touch?",
  preheader: "One click to stay on the list. No action needed if you'd rather go.",
  build: (theme) =>
    emailDoc(theme, [
      brandHeader(theme),
      section([[
        heading("Still want to hear from us?", { align: "center", fontSize: 30, padding: pad(24, 32, 8, 32) }),
        text(
          `<p>Hi ${FIRST_NAME}, we only want to send emails you actually enjoy. It's been a while since you opened one, so we wanted to check in.</p>`,
          { align: "center", padding: pad(0, 40, 8, 40) },
        ),
        button("Yes, keep me subscribed", siteUrl(theme), theme, { fontSize: 17, padding: pad(16, 24, 8, 24) }),
        text('<p>Not for you anymore? <a href="{{ unsubscribe_url }}">Unsubscribe here</a>, no hard feelings.</p>', {
          align: "center", fontSize: 14, color: "#71717a", padding: pad(4, 24, 24, 24),
        }),
        divider({ widthPercent: 30, padding: pad(8, 24) }),
        text(
          "<p>If we don't hear from you, we'll stop sending these emails soon, so your inbox stays tidy.</p>",
          { align: "center", fontSize: 13, color: "#71717a", padding: pad(8, 48, 24, 48) },
        ),
      ]]),
      brandFooter(theme),
    ]),
};
