// Starters: Events.
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

export const eventInvitation: StarterDefinition = {
  id: "event-invitation",
  name: "Event invitation",
  category: "Events",
  description: "An elegant invite with a full-width picture, date and location side by side, an agenda and an RSVP button.",
  subject: "You're invited: join us on Saturday, 14 March",
  preheader: "An evening of ideas, good food and great company. Save your seat.",
  build: (theme) => {
    const band = theme.primaryColor;
    const onBand = onColor(band);
    const soft = tint(theme.primaryColor, 0.92);
    const detail = (label: string, value: string, extra: string) => [
      text(`<p><strong>${label}</strong></p>`, { align: "center", fontSize: 12, color: theme.primaryColor, padding: pad(20, 16, 0, 16) }),
      subheading(value, { align: "center", fontSize: 18, padding: pad(4, 16, 0, 16) }),
      text(`<p>${extra}</p>`, { align: "center", fontSize: 14, color: "#52525b", padding: pad(0, 16, 20, 16) }),
    ];
    const agenda = (time: string, what: string) =>
      section(
        [
          [text(`<p><strong>${time}</strong></p>`, { color: theme.primaryColor, fontSize: 15, padding: pad(6, 8, 6, 24) })],
          [text(`<p>${what}</p>`, { fontSize: 15, padding: pad(6, 24, 6, 8) })],
        ],
        { widths: [33.34, 66.66], padding: pad(0), stackOnMobile: false },
      );
    return emailDoc(theme, [
      brandHeader(theme),
      section([[image("Event picture", { padding: pad(0) })]], { padding: pad(0) }),
      section(
        [[
          text("<p>YOU'RE INVITED</p>", { align: "center", color: onBand, fontSize: 13, padding: pad(32, 24, 0, 24) }),
          heading("An Evening of Ideas", { align: "center", fontSize: 38, color: onBand, padding: pad(4, 24, 8, 24) }),
          text(`<p>${FIRST_NAME}, we'd love for you to join us for talks, conversation and a few surprises.</p>`, {
            align: "center", color: onBand, padding: pad(0, 40, 32, 40),
          }),
        ]],
        { backgroundColor: band, padding: pad(0) },
      ),
      section(
        [
          { backgroundColor: soft, blocks: detail("WHEN", "Saturday, 14 March", "6:00 pm to 9:30 pm") },
          { backgroundColor: soft, blocks: detail("WHERE", "The Grand Hall", "12 Example Street, Your City") },
        ],
        { padding: pad(24, 24, 8, 24) },
      ),
      section([[subheading("The plan", { padding: pad(24, 24, 8, 24) })]]),
      agenda("6:00 pm", "Doors open, welcome drinks"),
      agenda("6:45 pm", "Keynote and panel conversation"),
      agenda("8:00 pm", "Dinner and networking"),
      section([[
        button("RSVP now", siteUrl(theme), theme, { fontSize: 18, padding: pad(24, 24, 8, 24), borderRadius: 30 }),
        text("<p>Spaces are limited, so please reply by 7 March.</p>", { align: "center", fontSize: 14, color: "#71717a", padding: pad(0, 24, 24, 24) }),
      ]]),
      brandFooter(theme),
    ]);
  },
};

export const webinarReminder: StarterDefinition = {
  id: "webinar-reminder",
  name: "Webinar reminder",
  category: "Events",
  description: "A clear 'starting soon' reminder with the time, a speaker card and a big Join button.",
  subject: "Starting in 1 hour: your webinar link is inside",
  preheader: "Grab a coffee, we'll see you live. Here's how to join.",
  build: (theme) => {
    const dark = theme.secondaryColor;
    const onDark = onColor(dark);
    return emailDoc(theme, [
      brandHeader(theme, { align: "left" }),
      section(
        [[
          text("<p><strong>● LIVE IN 1 HOUR</strong></p>", { color: onDark, fontSize: 13, padding: pad(32, 32, 0, 32) }),
          heading("Growing your audience this year", { fontSize: 32, color: onDark, padding: pad(8, 32) }),
          text("<p>Thursday · 4:00 pm (your time) · 45 minutes + live Q&amp;A</p>", { color: onDark, fontSize: 15, padding: pad(0, 32, 8, 32) }),
          button("Join the webinar", siteUrl(theme), theme, { align: "left", fontSize: 17, padding: pad(16, 32, 36, 32) }),
        ]],
        { backgroundColor: dark, padding: pad(0) },
      ),
      section([[
        text(`<p>Hi ${FIRST_NAME},</p><p>Just a quick reminder that we're going live soon. Bring your questions: we'll save plenty of time to answer them.</p>`, {
          padding: pad(28, 32, 8, 32),
        }),
      ]]),
      section(
        [
          { verticalAlign: "middle", blocks: [image("Speaker photo", { width: 120, borderRadius: 50, padding: pad(16, 16, 16, 32) })] },
          {
            verticalAlign: "middle",
            blocks: [
              text("<p><strong>YOUR HOST</strong></p>", { color: theme.primaryColor, fontSize: 12, padding: pad(16, 32, 0, 8) }),
              subheading("Speaker Name", { fontSize: 19, padding: pad(2, 32, 0, 8) }),
              text("<p>Head of Growth. Ten years of helping small teams find their first thousand customers.</p>", { fontSize: 14, padding: pad(0, 32, 16, 8) }),
            ],
          },
        ],
        { widths: [33.34, 66.66], backgroundColor: tint(theme.primaryColor, 0.93), padding: pad(0) },
      ),
      section([[
        subheading("You'll learn", { fontSize: 18, padding: pad(24, 32, 4, 32) }),
        text("<ul><li>Where your next customers are hiding</li><li>Three campaigns you can copy this week</li><li>How to measure what actually works</li></ul>", {
          fontSize: 15, padding: pad(0, 32, 8, 32),
        }),
        divider({ padding: pad(8, 32) }),
        text(`<p>Can't make it? No problem: everyone who registered gets the recording. <a href="${siteUrl(theme)}">Add to calendar</a></p>`, {
          fontSize: 14, padding: pad(8, 32, 24, 32),
        }),
      ]]),
      brandFooter(theme),
    ]);
  },
};
