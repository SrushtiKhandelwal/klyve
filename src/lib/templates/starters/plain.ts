// Starters: Plain & simple. Personal-looking emails often get more replies
// than heavily designed ones, so these stay deliberately quiet.
import { pad } from "@/lib/templates/document";
import {
  FIRST_NAME,
  brandHeader,
  divider,
  emailDoc,
  esc,
  footer,
  image,
  section,
  social,
  text,
  type StarterDefinition,
} from "./helpers";

export const plainLetter: StarterDefinition = {
  id: "plain-letter",
  name: "Personal letter",
  category: "Plain & simple",
  description: "Looks like a note from a real person: no pictures, no buttons, just friendly words and a signature.",
  subject: "A quick note from me",
  preheader: "No sales pitch, just a few thoughts I wanted to share with you.",
  build: (theme) =>
    emailDoc(
      theme,
      [
        section([[
          text(
            `<p>Hi ${FIRST_NAME},</p>` +
              "<p>I wanted to write to you personally, without the usual fancy design.</p>" +
              "<p>Over the past few months we've been listening closely to people like you, and it changed how we think about what we do. I'd love to share a few of the things we learned, and what we're planning next.</p>" +
              "<p>If anything here sparks a thought, just hit reply. It comes straight to my inbox, and I read every message.</p>" +
              `<p>Thanks for being here,</p><p><strong>Your Name</strong><br>Founder, ${esc(theme.companyName)}` +
              (theme.websiteUrl ? `<br><a href="${esc(theme.websiteUrl)}">${esc(theme.websiteUrl.replace(/^https?:\/\//, ""))}</a>` : "") +
              "</p>",
            { fontSize: 16, lineHeight: 1.7, padding: pad(32, 32, 16, 32) },
          ),
          // A small logo under the signature, like a real email signature.
          ...(theme.logoUrl
            ? [image(theme.companyName, { src: theme.logoUrl, href: theme.websiteUrl ?? "", width: 90, align: "left" as const, padding: pad(0, 32, 16, 32) })]
            : []),
          divider({ widthPercent: 100, padding: pad(8, 32) }),
          // Small social icons, only when the brand has any.
          ...[social(theme, { align: "left", iconSize: 20, padding: pad(8, 32, 0, 32) })].filter((b) => b !== null),
          footer(theme, { align: "left", padding: pad(8, 32, 32, 32) }),
        ]]),
      ],
      // White all around and a narrower column: reads like a normal email.
      { backgroundColor: "#ffffff", contentWidth: 560 },
    ),
};

export const minimalLogo: StarterDefinition = {
  id: "minimal-logo",
  name: "Minimal with logo",
  category: "Plain & simple",
  description: "A clean canvas: your logo, one block of text and the footer. Start here when you want to build your own.",
  subject: "",
  preheader: "",
  build: (theme) =>
    emailDoc(theme, [
      brandHeader(theme),
      section([[
        text(`<p>Hi ${FIRST_NAME},</p><p>Start writing your message here.</p>`, { padding: pad(16, 32, 24, 32) }),
      ]]),
      section([[
        divider({ padding: pad(0, 32) }),
        ...[social(theme, { iconSize: 24 })].filter((b) => b !== null),
        footer(theme),
      ]]),
    ]),
};
