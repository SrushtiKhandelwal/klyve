// Starters: Feedback (surveys and reviews).
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
  section,
  shade,
  siteUrl,
  subheading,
  text,
  tint,
  type StarterDefinition,
} from "./helpers";

export const surveyRequest: StarterDefinition = {
  id: "survey-request",
  name: "Quick survey",
  category: "Feedback",
  description: "One-question survey: four answer buttons side by side, so readers can reply in a single tap.",
  subject: `${FIRST_NAME}, how are we doing? (1 quick question)`,
  preheader: "Tap an answer. It takes five seconds and really helps us.",
  build: (theme) => {
    const soft = tint(theme.primaryColor, 0.92);
    // Four answers, from best to worst. Each button links to your survey tool or a page that records the answer.
    const answer = (label: string, amount: number) =>
      [button(label, siteUrl(theme), theme, {
        backgroundColor: amount === 0 ? theme.primaryColor : tint(theme.primaryColor, amount),
        fullWidth: true,
        fontSize: 14,
        padding: pad(6, 6),
      })];
    return emailDoc(theme, [
      brandHeader(theme),
      section(
        [[
          heading("We'd love your opinion", { align: "center", fontSize: 30, padding: pad(32, 32, 8, 32) }),
          text(`<p>Hi ${FIRST_NAME}, we're always trying to get better, and your answer shapes what we do next.</p>`, {
            align: "center", padding: pad(0, 40, 24, 40),
          }),
        ]],
        { backgroundColor: soft, padding: pad(0) },
      ),
      section([[
        subheading(`How happy are you with ${esc(theme.companyName)}?`, { align: "center", fontSize: 19, padding: pad(28, 24, 12, 24) }),
      ]]),
      section(
        [answer("😍 Love it", 0), answer("🙂 Good", 0.25), answer("😐 Okay", 0.5), answer("🙁 Poor", 0.7)],
        { padding: pad(0, 18) },
      ),
      section([[
        text("<p>Tap the answer that fits best. Want to tell us more? Just reply to this email: a real person reads every one.</p>", {
          align: "center", fontSize: 14, color: "#71717a", padding: pad(20, 40, 32, 40),
        }),
      ]]),
      brandFooter(theme),
    ]);
  },
};

export const reviewRequest: StarterDefinition = {
  id: "review-request",
  name: "Leave a review",
  category: "Feedback",
  description: "Ask happy customers for a review after their purchase, with a star rating line and a product reminder.",
  subject: "How did we do? ⭐⭐⭐⭐⭐",
  preheader: "Your review helps other people choose with confidence.",
  build: (theme) =>
    emailDoc(theme, [
      brandHeader(theme, { align: "left" }),
      section([[
        heading(`How's everything, ${FIRST_NAME}?`, { fontSize: 30, padding: pad(16, 32, 8, 32) }),
        text("<p>It's been a few days since your order arrived, and we'd love to know what you think. Reviews help other shoppers, and they make our day.</p>", {
          padding: pad(0, 32, 16, 32),
        }),
      ]]),
      section(
        [
          { verticalAlign: "middle", blocks: [image("Product picture", { borderRadius: 8, padding: pad(20, 12, 20, 32) })] },
          {
            verticalAlign: "middle",
            blocks: [
              subheading("Product name", { fontSize: 18, padding: pad(20, 32, 4, 12) }),
              heading("★★★★★", { level: 3, fontSize: 30, color: shade("#f59e0b", 0.05), padding: pad(0, 32, 4, 12) }),
              text("<p>Tap the stars to rate it</p>", { fontSize: 13, color: "#71717a", padding: pad(0, 32, 20, 12) }),
            ],
          },
        ],
        { widths: [33.34, 66.66], backgroundColor: tint(theme.backgroundColor, 0.5), padding: pad(0) },
      ),
      section([[
        button("Write a review", siteUrl(theme), theme, { align: "left", padding: pad(24, 32, 8, 32) }),
        text("<p>It only takes a minute. Thank you for helping us grow!</p>", { fontSize: 14, color: "#71717a", padding: pad(0, 32, 32, 32) }),
      ]]),
      brandFooter(theme),
    ]),
};
