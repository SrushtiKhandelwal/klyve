// Starters: Newsletter.
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

export const monthlyNewsletter: StarterDefinition = {
  id: "monthly-newsletter",
  name: "Monthly newsletter",
  category: "Newsletter",
  description: "A featured story up top, then a two-column grid of articles and a short editor's note.",
  subject: "This month: the stories worth your coffee break ☕",
  preheader: "Our top story, four quick reads and what's coming next month.",
  build: (theme) => {
    const band = theme.secondaryColor;
    const onBand = onColor(band);
    const card = (title: string, body: string) => [
      image(title, { borderRadius: 6, padding: pad(8, 12) }),
      subheading(title, { fontSize: 18, padding: pad(4, 12) }),
      text(`<p>${body}</p>`, { fontSize: 14, padding: pad(0, 12, 4, 12) }),
      text(`<p><a href="${siteUrl(theme)}"><strong>Read more →</strong></a></p>`, { fontSize: 14, padding: pad(0, 12, 12, 12) }),
    ];
    return emailDoc(theme, [
      brandHeader(theme, { backgroundColor: band }),
      section(
        [[text("<p>THE MONTHLY · ISSUE #1</p>", { align: "center", color: onBand, fontSize: 12, padding: pad(0, 24, 16, 24) })]],
        { backgroundColor: band, padding: pad(0) },
      ),
      section([[
        image("Featured story", { padding: pad(24, 24, 8, 24), borderRadius: 8 }),
        text("<p><strong>FEATURED</strong></p>", { color: theme.primaryColor, fontSize: 12, padding: pad(8, 24, 0, 24) }),
        heading("The big story of the month goes right here", { fontSize: 28, padding: pad(4, 24) }),
        text(
          "<p>Open with the one thing you most want readers to know. Keep it to two or three sentences and let the button do the rest.</p>",
          { padding: pad(0, 24, 4, 24) },
        ),
        button("Read the full story", siteUrl(theme), theme, { align: "left", padding: pad(8, 24, 24, 24) }),
      ]]),
      section([[divider({ padding: pad(0, 24) })]]),
      section([[subheading("More from this month", { padding: pad(20, 24, 4, 24) })]]),
      section([
        card("Behind the scenes", "Meet the people who make it all happen, and what they're working on."),
        card("Tips & tricks", "Three small changes that make a big difference this season."),
      ], { padding: pad(0, 12) }),
      section([
        card("Community spotlight", "A reader story that made our whole team smile this month."),
        card("What's next", "A sneak peek at what we're launching in the coming weeks."),
      ], { padding: pad(0, 12) }),
      section(
        [[
          subheading("A note from the editor", { fontSize: 18, padding: pad(24, 24, 4, 24) }),
          text(
            `<p>Thanks for reading, ${FIRST_NAME}. If something here sparked an idea, hit reply: we read every message and love hearing from you.</p>`,
            { fontSize: 15, padding: pad(0, 24, 24, 24) },
          ),
        ]],
        { backgroundColor: tint(theme.primaryColor, 0.93), padding: pad(0) },
      ),
      brandFooter(theme),
    ]);
  },
};

export const blogDigest: StarterDefinition = {
  id: "blog-digest",
  name: "Blog digest",
  category: "Newsletter",
  description: "Three recent articles, each with a thumbnail beside the title, summary and link.",
  subject: "3 new reads from the blog",
  preheader: "Fresh articles picked for you this week.",
  build: (theme) => {
    const article = (tag: string, title: string, body: string) =>
      section(
        [
          { blocks: [image(title, { borderRadius: 8, padding: pad(12, 12, 12, 24) })], verticalAlign: "middle" },
          {
            verticalAlign: "middle",
            blocks: [
              text(`<p><strong>${tag}</strong></p>`, { color: theme.primaryColor, fontSize: 12, padding: pad(12, 24, 0, 12) }),
              subheading(title, { fontSize: 19, padding: pad(2, 24, 2, 12) }),
              text(`<p>${body} <a href="${siteUrl(theme)}">Read article</a></p>`, { fontSize: 14, padding: pad(0, 24, 12, 12) }),
            ],
          },
        ],
        { widths: [33.34, 66.66] },
      );
    return emailDoc(theme, [
      brandHeader(theme, { align: "left" }),
      section([[
        heading("Fresh from the blog", { fontSize: 30, padding: pad(16, 24, 4, 24) }),
        text(`<p>Hi ${FIRST_NAME}, here's what we've been writing about lately.</p>`, { color: "#52525b", padding: pad(0, 24, 8, 24) }),
        divider({ color: theme.primaryColor, thickness: 3, widthPercent: 15, padding: pad(4, 24, 12, 24) }),
      ]]),
      article("GUIDE", "How to get started in five minutes", "Everything you need to know, without the jargon."),
      section([[divider({ padding: pad(0, 24) })]]),
      article("STORY", "What we learned this year", "The surprises, the lessons and what we'd do differently."),
      section([[divider({ padding: pad(0, 24) })]]),
      article("HOW-TO", "Seven small habits that save hours", "Quick wins you can try today, no special tools needed."),
      section([[button("Visit the blog", siteUrl(theme), theme, { padding: pad(24, 24, 32, 24) })]]),
      brandFooter(theme),
    ]);
  },
};
