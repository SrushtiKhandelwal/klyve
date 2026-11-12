// Starters: Seasonal & special occasions.
import { pad } from "@/lib/templates/document";
import {
  CURRENT_YEAR,
  FIRST_NAME,
  brandFooter,
  brandHeader,
  button,
  divider,
  emailDoc,
  esc,
  heading,
  image,
  mix,
  onColor,
  section,
  shade,
  siteUrl,
  subheading,
  text,
  tint,
  type StarterDefinition,
} from "./helpers";

export const holidayGreeting: StarterDefinition = {
  id: "holiday-greeting",
  name: "Holiday greeting",
  category: "Seasonal",
  description: "A warm, centred season's greetings card with a festive picture and a heartfelt thank-you.",
  subject: `Season's greetings from all of us 🎄`,
  preheader: "Thank you for being part of our year. Wishing you a joyful season.",
  build: (theme) => {
    const deep = shade(theme.secondaryColor, 0.1);
    const onDeep = onColor(deep);
    return emailDoc(theme, [
      brandHeader(theme, { backgroundColor: deep }),
      section(
        [[
          text("<p>✦ ✦ ✦</p>", { align: "center", color: onDeep, fontSize: 16, padding: pad(8, 24, 0, 24) }),
          heading("Happy Holidays", { align: "center", fontSize: 44, color: onDeep, padding: pad(8, 24, 4, 24) }),
          text(`<p>and a wonderful new year, ${FIRST_NAME}</p>`, { align: "center", color: onDeep, fontSize: 18, padding: pad(0, 24, 24, 24) }),
          image("Festive picture", { borderRadius: 10, padding: pad(0, 32, 36, 32) }),
        ]],
        { backgroundColor: deep, padding: pad(0) },
      ),
      section([[
        text(
          `<p>As the year comes to a close, we wanted to say a simple thank you. Every message, every order and every kind word made this year special for our whole team.</p><p>Wishing you rest, warmth and plenty of good moments with the people you love.</p><p>With gratitude,<br><strong>Everyone at ${esc(theme.companyName)}</strong></p>`,
          { align: "center", padding: pad(32, 48, 16, 48), lineHeight: 1.7 },
        ),
        divider({ widthPercent: 20, color: theme.primaryColor, thickness: 2, padding: pad(8, 24) }),
        text("<p>Our team is taking a short break from 24 December to 2 January. Replies may be a little slower.</p>", {
          align: "center", fontSize: 13, color: "#71717a", padding: pad(8, 48, 32, 48),
        }),
      ]]),
      brandFooter(theme),
    ]);
  },
};

export const festivalOffer: StarterDefinition = {
  id: "festival-offer",
  name: "Diwali festival offer",
  category: "Seasonal",
  description: "Festive warmth in gold and your brand colour: greetings, a festival discount and gift ideas. Easy to adapt for Eid, Holi or Lunar New Year.",
  subject: "✨ Happy Diwali! Celebrate with 25% off",
  preheader: "Light up the festival with gifts for everyone you love.",
  build: (theme) => {
    // A festive gold, warmed slightly towards the brand colour so it still feels "theirs".
    const gold = mix("#f59e0b", theme.primaryColor, 0.15);
    const night = shade(theme.secondaryColor, 0.2);
    const onNight = onColor(night);
    const gift = (name: string, price: string) => [
      image(name, { borderRadius: 8, padding: pad(8) }),
      text(`<p><strong>${name}</strong><br>${price}</p>`, { align: "center", fontSize: 14, padding: pad(0, 8, 12, 8) }),
    ];
    return emailDoc(theme, [
      brandHeader(theme, { backgroundColor: night }),
      section(
        [[
          text("<p>🪔 🪔 🪔</p>", { align: "center", fontSize: 22, padding: pad(8, 24, 0, 24) }),
          heading("Happy Diwali", { align: "center", fontSize: 44, color: gold, padding: pad(8, 24, 4, 24) }),
          text(`<p>May the festival of lights fill your home with joy, ${FIRST_NAME}.</p>`, { align: "center", color: onNight, fontSize: 17, padding: pad(0, 40, 24, 40) }),
        ]],
        { backgroundColor: night, padding: pad(0) },
      ),
      section(
        [{
          backgroundColor: tint(gold, 0.85),
          blocks: [
            text("<p><strong>FESTIVE OFFER</strong></p>", { align: "center", fontSize: 13, color: shade(gold, 0.5), padding: pad(24, 24, 0, 24) }),
            heading("25% off sitewide", { align: "center", fontSize: 34, color: shade(gold, 0.55), padding: pad(4, 24) }),
            text("<p>Use code <strong>DIWALI25</strong> at checkout</p>", { align: "center", fontSize: 16, padding: pad(0, 24, 8, 24) }),
            button("Shop festive gifts", siteUrl(theme), theme, { padding: pad(8, 24, 28, 24), borderRadius: 30 }),
          ],
        }],
        { backgroundColor: night, padding: pad(0, 32, 36, 32) },
      ),
      section([[subheading("Gifts they'll love", { align: "center", fontSize: 19, padding: pad(28, 24, 4, 24) })]]),
      section([gift("Sweets box", "From $19"), gift("Diya set", "From $24"), gift("Gift hamper", "From $49")], { padding: pad(0, 16, 16, 16) }),
      brandFooter(theme, { note: "<p>Offer valid until the end of the festival week. Shipping times may be longer during the holidays.</p>" }),
    ]);
  },
};

export const birthdayWish: StarterDefinition = {
  id: "birthday-wish",
  name: "Birthday wish",
  category: "Seasonal",
  description: "A cheerful, personalized birthday email with a gift code. Pair it with a birthday field on your contacts.",
  subject: `Happy birthday, ${FIRST_NAME}! 🎂 A gift inside`,
  preheader: "We saved you something special to celebrate your day.",
  build: (theme) => {
    const bright = theme.primaryColor;
    const onBright = onColor(bright);
    return emailDoc(theme, [
      brandHeader(theme),
      section(
        [[
          heading("🎈 🎂 🎉", { align: "center", fontSize: 40, padding: pad(36, 24, 0, 24) }),
          heading(`Happy birthday, ${FIRST_NAME}!`, { align: "center", fontSize: 36, color: onBright, padding: pad(12, 24, 4, 24) }),
          text("<p>Another trip around the sun deserves a proper celebration. Here's a little gift from us.</p>", {
            align: "center", color: onBright, padding: pad(0, 48, 32, 48),
          }),
        ]],
        { backgroundColor: bright, padding: pad(0) },
      ),
      section(
        [{
          backgroundColor: "#ffffff",
          blocks: [
            text("<p>YOUR BIRTHDAY GIFT</p>", { align: "center", fontSize: 13, color: "#71717a", padding: pad(24, 24, 0, 24) }),
            heading("$10 off", { align: "center", fontSize: 44, color: bright, padding: pad(0, 24) }),
            text("<p>Use code <strong>HAPPYBDAY</strong> any time this month.</p>", { align: "center", fontSize: 15, padding: pad(0, 24, 4, 24) }),
            button("Treat myself", siteUrl(theme), theme, { padding: pad(12, 24, 28, 24), borderRadius: 30 }),
          ],
        }],
        { backgroundColor: tint(bright, 0.88), padding: pad(32, 48) },
      ),
      section([[
        text(`<p>Wishing you a fantastic year ahead,<br><strong>The ${esc(theme.companyName)} team</strong></p>`, {
          align: "center", padding: pad(28, 24, 28, 24),
        }),
      ]]),
      brandFooter(theme, { note: `<p>© ${CURRENT_YEAR} ${esc(theme.companyName)}. Gift codes can be used once per customer.</p>` }),
    ]);
  },
};
