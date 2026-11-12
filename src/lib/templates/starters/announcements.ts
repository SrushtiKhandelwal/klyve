// Starters: Announcements.
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
  siteUrl,
  subheading,
  text,
  tint,
  type StarterDefinition,
} from "./helpers";

export const productLaunch: StarterDefinition = {
  id: "product-launch",
  name: "Product launch",
  category: "Announcements",
  description: "Make a splash: a dark hero, a big product picture, three feature highlights and a launch-day call to action.",
  subject: "Introducing something new ✨",
  preheader: "It's finally here. Be one of the first to try it.",
  build: (theme) => {
    const dark = theme.secondaryColor;
    const onDark = onColor(dark);
    const feature = (icon: string, title: string, body: string) => [
      heading(icon, { align: "center", fontSize: 30, padding: pad(16, 12, 0, 12) }),
      subheading(title, { align: "center", fontSize: 17, padding: pad(4, 12, 0, 12) }),
      text(`<p>${body}</p>`, { align: "center", fontSize: 14, padding: pad(0, 12, 16, 12) }),
    ];
    return emailDoc(theme, [
      brandHeader(theme, { backgroundColor: dark }),
      section(
        [[
          text("<p><strong>NEW · AVAILABLE TODAY</strong></p>", { align: "center", color: onDark, fontSize: 13, padding: pad(16, 24, 0, 24) }),
          heading("Meet the all-new Product", { align: "center", fontSize: 40, color: onDark, padding: pad(8, 32) }),
          text("<p>Faster, simpler and designed around the way you actually work.</p>", { align: "center", color: onDark, fontSize: 18, padding: pad(0, 40, 16, 40) }),
          image("Product picture", { borderRadius: 10, padding: pad(8, 32, 32, 32) }),
        ]],
        { backgroundColor: dark, padding: pad(0) },
      ),
      section([
        feature("⚡", "Lightning fast", "Everything loads in a blink, even on a slow connection."),
        feature("🎯", "Simple by design", "No manual needed. You'll feel at home in minutes."),
        feature("🔒", "Private & secure", "Your data stays yours. Always encrypted."),
      ], { padding: pad(24, 12, 8, 12) }),
      section([[
        button("Try it now", siteUrl(theme), theme, { fontSize: 18, padding: pad(8, 24, 8, 24), borderRadius: 8 }),
        text(`<p>${FIRST_NAME}, as a subscriber you get early access before everyone else.</p>`, {
          align: "center", fontSize: 14, color: "#71717a", padding: pad(0, 32, 32, 32),
        }),
      ]]),
      brandFooter(theme),
    ]);
  },
};

export const companyUpdate: StarterDefinition = {
  id: "company-update",
  name: "News & updates",
  category: "Announcements",
  description: "A clean 'what's new' update with a short intro, a bulleted list of changes and a link to learn more.",
  subject: "What's new this month",
  preheader: "A quick round-up of improvements we've made for you.",
  build: (theme) => {
    const update = (badge: string, title: string, body: string) =>
      section([[
        text(`<p><strong>${badge}</strong></p>`, { color: theme.primaryColor, fontSize: 12, padding: pad(12, 32, 0, 32) }),
        subheading(title, { fontSize: 19, padding: pad(2, 32, 2, 32) }),
        // A body that is already HTML (like a list) is used as-is.
        text(body.startsWith("<") ? body : `<p>${body}</p>`, { fontSize: 15, padding: pad(0, 32, 8, 32) }),
      ]]);
    return emailDoc(theme, [
      brandHeader(theme, { align: "left" }),
      section(
        [[
          heading("Here's what's new", { fontSize: 32, padding: pad(32, 32, 4, 32) }),
          text(`<p>Hi ${FIRST_NAME}, we've been busy. Here are the changes you'll notice, and why we made them.</p>`, {
            padding: pad(0, 32, 28, 32),
          }),
        ]],
        { backgroundColor: tint(theme.primaryColor, 0.93), padding: pad(0) },
      ),
      update("NEW", "A brand-new dashboard", "See everything that matters on one screen, with less clicking around."),
      section([[divider({ padding: pad(4, 32) })]]),
      update("IMPROVED", "Faster everywhere", "Pages now load up to twice as fast, especially on phones."),
      section([[divider({ padding: pad(4, 32) })]]),
      update("FIXED", "The little things", "<ul><li>Smoother sign-in on all devices</li><li>Clearer notifications</li><li>Dozens of small fixes you asked for</li></ul>"),
      section([[button("See all updates", siteUrl(theme), theme, { align: "left", padding: pad(16, 32, 32, 32) })]]),
      brandFooter(theme, { note: "<p>Have an idea for us? Reply to this email. We read every one.</p>" }),
    ]);
  },
};
