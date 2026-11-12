// Starters: Promotions & sales.
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

export const flashSale: StarterDefinition = {
  id: "flash-sale",
  name: "Flash sale",
  category: "Promotions & sales",
  description: "Big, urgent and impossible to miss: a huge discount, a coupon code box and a countdown line.",
  subject: "⚡ 24 hours only: 30% off everything",
  preheader: "Use code FLASH30 at checkout. Ends at midnight!",
  build: (theme) => {
    const hero = theme.secondaryColor;
    const onHero = onColor(hero);
    const couponBg = tint(theme.primaryColor, 0.88);
    return emailDoc(theme, [
      brandHeader(theme, { backgroundColor: hero }),
      section(
        [[
          text("<p><strong>FLASH SALE · 24 HOURS ONLY</strong></p>", { align: "center", color: onHero, fontSize: 14, padding: pad(16, 24, 0, 24) }),
          heading("30% OFF", { align: "center", fontSize: 72, color: onHero, padding: pad(4, 24, 0, 24) }),
          heading("everything in store", { level: 2, align: "center", fontSize: 24, color: onHero, padding: pad(0, 24, 16, 24) }),
          button("Shop the sale", siteUrl(theme), theme, { fontSize: 18, borderRadius: 4, padding: pad(8, 24, 40, 24) }),
        ]],
        { backgroundColor: hero, padding: pad(0) },
      ),
      section(
        [{
          backgroundColor: couponBg,
          padding: pad(8, 0),
          blocks: [
            text("<p>Use this code at checkout</p>", { align: "center", fontSize: 14, color: shade(theme.primaryColor, 0.4), padding: pad(16, 24, 0, 24) }),
            divider({ style: "dashed", color: theme.primaryColor, widthPercent: 50, padding: pad(8, 24) }),
            heading("<strong>FLASH30</strong>", { align: "center", fontSize: 36, color: shade(theme.primaryColor, 0.3), padding: pad(0, 24) }),
            divider({ style: "dashed", color: theme.primaryColor, widthPercent: 50, padding: pad(8, 24, 16, 24) }),
          ],
        }],
        { padding: pad(32, 40) },
      ),
      section([[
        text(
          `<p>Hurry, ${FIRST_NAME}! The sale ends at <strong>midnight tonight</strong>. Once it's gone, it's gone.</p>`,
          { align: "center", padding: pad(0, 32, 8, 32) },
        ),
      ]]),
      section([
        [image("Bestseller 1", { borderRadius: 6, padding: pad(8, 8) }), text("<p><strong>Bestseller</strong><br>Now 30% off</p>", { align: "center", fontSize: 14, padding: pad(0, 8, 8, 8) })],
        [image("Bestseller 2", { borderRadius: 6, padding: pad(8, 8) }), text("<p><strong>Fan favourite</strong><br>Now 30% off</p>", { align: "center", fontSize: 14, padding: pad(0, 8, 8, 8) })],
        [image("Bestseller 3", { borderRadius: 6, padding: pad(8, 8) }), text("<p><strong>New in</strong><br>Now 30% off</p>", { align: "center", fontSize: 14, padding: pad(0, 8, 8, 8) })],
      ], { padding: pad(8, 16, 24, 16) }),
      brandFooter(theme, { note: "<p>Offer valid for 24 hours. Cannot be combined with other offers.</p>" }),
    ]);
  },
};

export const memberOffer: StarterDefinition = {
  id: "member-offer",
  name: "Exclusive member offer",
  category: "Promotions & sales",
  description: "A calm, premium split layout: picture on one side, a personal offer and button on the other.",
  subject: `${FIRST_NAME}, a little something just for you`,
  preheader: "An exclusive offer for our members. Free shipping included.",
  build: (theme) => {
    const soft = tint(theme.primaryColor, 0.92);
    return emailDoc(theme, [
      brandHeader(theme),
      section(
        [
          { blocks: [image("Offer picture", { padding: pad(0) })], verticalAlign: "middle" },
          {
            verticalAlign: "middle",
            backgroundColor: soft,
            blocks: [
              text("<p><strong>MEMBERS ONLY</strong></p>", { color: theme.primaryColor, fontSize: 12, padding: pad(32, 24, 0, 24) }),
              heading("Enjoy 15% off your next order", { fontSize: 28, padding: pad(4, 24) }),
              text("<p>Because you're part of the family. Plus free shipping on everything, this week only.</p>", { fontSize: 15, padding: pad(0, 24, 8, 24) }),
              button("Claim my offer", siteUrl(theme), theme, { align: "left", padding: pad(8, 24, 32, 24) }),
            ],
          },
        ],
        { padding: pad(0) },
      ),
      section([[
        subheading("Why members love us", { align: "center", fontSize: 18, padding: pad(32, 24, 8, 24) }),
      ]]),
      section([
        [subheading("🚚", { align: "center", fontSize: 28, padding: pad(4, 12, 0, 12) }), text("<p><strong>Free shipping</strong><br>On every order</p>", { align: "center", fontSize: 14, padding: pad(0, 12, 16, 12) })],
        [subheading("↩️", { align: "center", fontSize: 28, padding: pad(4, 12, 0, 12) }), text("<p><strong>Easy returns</strong><br>30 days, no questions</p>", { align: "center", fontSize: 14, padding: pad(0, 12, 16, 12) })],
        [subheading("💬", { align: "center", fontSize: 28, padding: pad(4, 12, 0, 12) }), text("<p><strong>Real support</strong><br>Humans, not bots</p>", { align: "center", fontSize: 14, padding: pad(0, 12, 16, 12) })],
      ], { padding: pad(0, 12, 16, 12) }),
      brandFooter(theme),
    ]);
  },
};
