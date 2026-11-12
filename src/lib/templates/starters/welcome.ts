// Starters: Welcome & onboarding.
import { pad } from "@/lib/templates/document";
import {
  FIRST_NAME,
  brandFooter,
  brandHeader,
  button,
  emailDoc,
  esc,
  heading,
  image,
  onColor,
  section,
  siteUrl,
  spacer,
  subheading,
  text,
  tint,
  type StarterDefinition,
} from "./helpers";

export const welcome: StarterDefinition = {
  id: "welcome",
  name: "Welcome aboard",
  category: "Welcome & onboarding",
  description: "A warm first hello with a bold brand-coloured hero and three quick next steps.",
  subject: `Welcome, ${FIRST_NAME}! You're in 🎉`,
  preheader: "Here's what happens next, and three easy ways to get started.",
  build: (theme) => {
    const hero = theme.primaryColor;
    const onHero = onColor(hero);
    const step = (n: string, title: string, body: string) => [
      heading(n, { level: 2, fontSize: 30, align: "center", color: theme.primaryColor, padding: pad(16, 16, 0, 16) }),
      subheading(title, { fontSize: 17, align: "center", padding: pad(4, 16) }),
      text(`<p>${body}</p>`, { align: "center", fontSize: 14, padding: pad(0, 16, 16, 16) }),
    ];
    return emailDoc(theme, [
      brandHeader(theme),
      section(
        [[
          heading(`Welcome, ${FIRST_NAME}!`, { align: "center", fontSize: 36, color: onHero, padding: pad(40, 32, 8, 32) }),
          text(
            `<p>We're so glad you joined ${esc(theme.companyName)}. You'll hear from us when there's something genuinely worth your time: no clutter, promise.</p>`,
            { align: "center", color: onHero, fontSize: 17, padding: pad(0, 40, 16, 40) },
          ),
          button("Get started", siteUrl(theme), theme, {
            backgroundColor: onHero, textColor: hero, padding: pad(8, 24, 40, 24), borderRadius: 30,
          }),
        ]],
        { backgroundColor: hero, padding: pad(0) },
      ),
      section([[subheading("Three ways to get going", { align: "center", padding: pad(32, 24, 0, 24) })]]),
      section([
        step("1", "Complete your profile", "Tell us a little about yourself so we can send what you care about."),
        step("2", "Explore the essentials", "Our most-loved picks, hand-chosen for new members like you."),
        step("3", "Say hello", "Questions? Just hit reply. A real person reads every message."),
      ]),
      section([[spacer(16)]]),
      brandFooter(theme),
    ]);
  },
};

export const onboardingTips: StarterDefinition = {
  id: "onboarding-tips",
  name: "Getting started tips",
  category: "Welcome & onboarding",
  description: "Onboarding email #2: alternating picture-and-text rows that walk new users through the basics.",
  subject: "3 tips to get the most out of your first week",
  preheader: `A quick guide, ${FIRST_NAME}, takes less than two minutes to read.`,
  build: (theme) => {
    const soft = tint(theme.primaryColor, 0.92);
    const row = (title: string, body: string, imageFirst: boolean) => {
      const pic = image(title, { borderRadius: 8, padding: pad(16, 24) });
      const words = [
        subheading(title, { padding: pad(16, 24, 4, 24) }),
        text(`<p>${body}</p>`, { fontSize: 15, padding: pad(0, 24, 16, 24) }),
      ];
      const cols = imageFirst
        ? [{ blocks: [pic], verticalAlign: "middle" as const }, { blocks: words, verticalAlign: "middle" as const }]
        : [{ blocks: words, verticalAlign: "middle" as const }, { blocks: [pic], verticalAlign: "middle" as const }];
      return section(cols, { padding: pad(8, 0) });
    };
    return emailDoc(theme, [
      brandHeader(theme, { align: "left" }),
      section(
        [[
          text("<p><strong>YOUR FIRST WEEK</strong></p>", { color: theme.primaryColor, fontSize: 13, padding: pad(32, 24, 0, 24) }),
          heading(`Hi ${FIRST_NAME}, let's set you up for success`, { fontSize: 30, padding: pad(4, 24, 8, 24) }),
          text("<p>These three small steps make the biggest difference. Most people finish them in under ten minutes.</p>", {
            padding: pad(0, 24, 32, 24),
          }),
        ]],
        { backgroundColor: soft, padding: pad(0) },
      ),
      row("Tip 1: Make it yours", "Add your details and preferences so everything you see is tailored to you.", true),
      row("Tip 2: Save your favourites", "Tap the heart on anything you like. We'll keep it safe for later.", false),
      row("Tip 3: Turn on reminders", "Never miss what matters. Choose how and when you'd like a nudge.", true),
      section([[
        button("Open my account", siteUrl(theme), theme, { padding: pad(16, 24, 8, 24) }),
        text("<p>Stuck? Reply to this email and we'll help you out.</p>", { align: "center", fontSize: 14, color: "#71717a", padding: pad(0, 24, 24, 24) }),
      ]]),
      brandFooter(theme),
    ]);
  },
};
