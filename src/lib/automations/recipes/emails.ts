// The emails used by the ready-made automation recipes.
//
// Each function returns a complete EmailDocument in the workspace's brand,
// built with the same helpers as the 22 starter templates, so a recipe's
// emails look just as good. Every email ends with the brand footer, which
// holds the address and the {{ unsubscribe_url }} link (required to send).
//
// No image blocks: an empty image would block sending until the user picks a
// picture, and a recipe should work in one click. Users can add pictures in
// the editor later.
//
// Safe to import from server AND client (no database, no Node-only code).
import { pad, type Block, type BrandTheme, type EmailDocument } from "@/lib/templates/document";
import {
  CURRENT_YEAR,
  FIRST_NAME,
  brandFooter,
  brandHeader,
  button,
  divider,
  emailDoc,
  heading,
  onColor,
  section,
  siteUrl,
  subheading,
  text,
  tint,
} from "@/lib/templates/starters/helpers";

/**
 * The company name, safe inside HTML AND inside Liquid: braces are dropped so
 * a name like "{{ Shop }}" can never turn into a merge tag.
 */
export function companyHtml(theme: BrandTheme): string {
  return theme.companyName
    .replace(/[{}%]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .trim() || "our team";
}

/** The company name for subject lines (plain text, no merge-tag characters). */
export function companyPlain(theme: BrandTheme): string {
  return theme.companyName.replace(/[{}%<>]/g, "").trim() || "us";
}

// ── Layout pieces ───────────────────────────────────────────────────────────

/** A coloured band with a big headline and a short intro (the "hero"). */
function hero(theme: BrandTheme, o: { eyebrow?: string; title: string; intro: string }): ReturnType<typeof section> {
  const bg = theme.primaryColor;
  const fg = onColor(bg);
  const blocks: Block[] = [];
  if (o.eyebrow) {
    blocks.push(text(`<p><strong>${o.eyebrow}</strong></p>`, { align: "center", color: fg, fontSize: 13, padding: pad(36, 32, 0, 32) }));
  }
  blocks.push(
    heading(o.title, { align: "center", fontSize: 32, color: fg, padding: pad(o.eyebrow ? 6 : 40, 32, 8, 32) }),
    text(`<p>${o.intro}</p>`, { align: "center", color: fg, fontSize: 17, padding: pad(0, 40, 36, 40) }),
  );
  return section([blocks], { backgroundColor: bg, padding: pad(0) });
}

/** A soft, light band: calmer than the hero, for follow-ups and reminders. */
function softHero(theme: BrandTheme, o: { eyebrow?: string; title: string; intro: string }): ReturnType<typeof section> {
  const blocks: Block[] = [];
  if (o.eyebrow) {
    blocks.push(text(`<p><strong>${o.eyebrow}</strong></p>`, { color: theme.primaryColor, fontSize: 13, padding: pad(32, 24, 0, 24) }));
  }
  blocks.push(
    heading(o.title, { fontSize: 28, padding: pad(o.eyebrow ? 4 : 32, 24, 8, 24) }),
    text(`<p>${o.intro}</p>`, { padding: pad(0, 24, 28, 24) }),
  );
  return section([blocks], { backgroundColor: tint(theme.primaryColor, 0.92), padding: pad(0) });
}

/** Plain paragraphs of body copy. */
function body(paragraphs: string[]): ReturnType<typeof section> {
  return section([paragraphs.map((p, i) => text(`<p>${p}</p>`, { padding: pad(i === 0 ? 24 : 4, 24, 8, 24) }))]);
}

/** Numbered tips: a small brand-coloured number, a title and a sentence each. */
function tips(theme: BrandTheme, items: { title: string; body: string }[]): ReturnType<typeof section> {
  const blocks: Block[] = [];
  items.forEach((item, i) => {
    blocks.push(
      subheading(`<span style="color: ${theme.primaryColor}">${i + 1}.</span> ${item.title}`, { fontSize: 18, padding: pad(16, 24, 2, 24) }),
      text(`<p>${item.body}</p>`, { fontSize: 15, padding: pad(0, 24, 8, 24) }),
    );
  });
  return section([blocks], { padding: pad(8, 0) });
}

/** A highlighted box for a discount code or a key detail (date, place…). */
function highlightBox(theme: BrandTheme, o: { label: string; big: string; small: string; cta?: { label: string; href: string } }) {
  const accent = theme.primaryColor;
  const blocks: Block[] = [
    text(`<p>${o.label}</p>`, { align: "center", fontSize: 13, color: "#71717a", padding: pad(24, 24, 0, 24) }),
    heading(o.big, { align: "center", fontSize: 36, color: accent, padding: pad(2, 24) }),
    text(`<p>${o.small}</p>`, { align: "center", fontSize: 15, padding: pad(0, 24, o.cta ? 4 : 24, 24) }),
  ];
  if (o.cta) blocks.push(button(o.cta.label, o.cta.href, theme, { padding: pad(12, 24, 28, 24), borderRadius: 30 }));
  return section([{ backgroundColor: "#ffffff", blocks }], { backgroundColor: tint(accent, 0.88), padding: pad(24, 32) });
}

/** A centred call-to-action button, with an optional small line under it. */
function cta(theme: BrandTheme, label: string, href: string, note?: string): ReturnType<typeof section> {
  const blocks: Block[] = [button(label, href, theme, { padding: pad(16, 24, note ? 4 : 16, 24) })];
  if (note) blocks.push(text(`<p>${note}</p>`, { align: "center", fontSize: 13, color: "#71717a", padding: pad(0, 24, 16, 24) }));
  return section([blocks]);
}

/** "Talk soon, The Acme team". */
function signoff(theme: BrandTheme, opener = "Talk soon,"): ReturnType<typeof section> {
  return section([[
    divider({ padding: pad(8, 24) }),
    text(`<p>${opener}<br><strong>The ${companyHtml(theme)} team</strong></p>`, { padding: pad(8, 24, 24, 24) }),
  ]]);
}

/** Header, content, sign-off and the legal footer (with the unsubscribe link). */
function wrap(theme: BrandTheme, content: ReturnType<typeof section>[], o: { note?: string; signoff?: string } = {}): EmailDocument {
  return emailDoc(theme, [brandHeader(theme), ...content, signoff(theme, o.signoff), brandFooter(theme, { note: o.note })]);
}

/** A ready-to-use email: what the "Send email" step needs besides its id and sender. */
export type RecipeEmail = { name: string; subject: string; preheader: string; document: EmailDocument };

const PREFERENCES = "{{ preferences_url }}";

// ── Welcome & onboarding ────────────────────────────────────────────────────

export function welcomeEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Welcome email",
    subject: `Welcome to ${companyPlain(theme)}, ${FIRST_NAME}!`,
    preheader: "Thanks for joining. Here's what to expect from us.",
    document: wrap(theme, [
      hero(theme, {
        eyebrow: "WELCOME ABOARD",
        title: `Hi ${FIRST_NAME}, we're so glad you're here`,
        intro: `Thanks for joining ${co}. You've just made our day.`,
      }),
      body([
        "Here's what you can expect from us: useful updates, the occasional special offer, and never a flood of email. If something isn't for you, you can change what you get at any time.",
        "The best place to start is our website. Have a look around, and if you have a question, just hit reply. A real person reads every message.",
      ]),
      cta(theme, "Take a look around", siteUrl(theme)),
    ]),
  };
}

/** Sent when the welcome email WAS opened: a step further, with tips. */
export function gettingTheMostEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Getting the most out of it",
    subject: `${FIRST_NAME}, 3 ways to get the most out of ${companyPlain(theme)}`,
    preheader: "A two-minute read with our best tips for new members.",
    document: wrap(theme, [
      softHero(theme, {
        eyebrow: "TIPS FOR NEW MEMBERS",
        title: "Make the most of your first week",
        intro: `You've had a couple of days to settle in, ${FIRST_NAME}. Here are three small things our happiest customers do first.`,
      }),
      tips(theme, [
        { title: "Start with our favourites", body: `New to ${co}? Our most-loved picks are the quickest way to see what we're about.` },
        { title: "Tell us what you like", body: "Choose the topics you care about, so every email we send is worth opening." },
        { title: "Say hello", body: "Got a question or an idea? Reply to this email. We answer every message ourselves." },
      ]),
      cta(theme, "Explore our favourites", siteUrl(theme), `<a href="${PREFERENCES}">Choose what you hear about</a>`),
    ]),
  };
}

/** Sent when the welcome email was NOT opened: the same welcome, a fresh subject. */
export function welcomeResendEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Welcome email (second try)",
    subject: `Did you miss this, ${FIRST_NAME}? A quick hello from ${companyPlain(theme)}`,
    preheader: "Our welcome may have slipped past you, so here it is again.",
    document: wrap(theme, [
      softHero(theme, {
        title: `Just in case you missed it, ${FIRST_NAME}`,
        intro: `Inboxes get busy, so here's our welcome once more. We're really happy you joined ${co}.`,
      }),
      body([
        "In short: we'll send you helpful updates and the occasional offer, nothing more. You're always in control of what you receive.",
        "Have a quick look at what's new on our website. And if you'd rather hear from us less often, that's fine too: just update your preferences.",
      ]),
      cta(theme, "See what's new", siteUrl(theme), `<a href="${PREFERENCES}">Update your preferences</a>`),
    ]),
  };
}

export function littleGiftEmail(theme: BrandTheme): RecipeEmail {
  return {
    name: "A little gift",
    subject: `A little welcome gift for you, ${FIRST_NAME} 🎁`,
    preheader: "To say thanks for joining: 10% off your first order.",
    document: wrap(
      theme,
      [
        hero(theme, {
          eyebrow: "A THANK-YOU FROM US",
          title: "A little gift to get you started",
          intro: `You've been with us almost a week, ${FIRST_NAME}. To say thank you, here's something just for you.`,
        }),
        highlightBox(theme, {
          label: "YOUR WELCOME GIFT",
          big: "10% off",
          small: "Use code <strong>WELCOME10</strong> on your first order.",
          cta: { label: "Use my gift", href: siteUrl(theme) },
        }),
        body(["No catch, no rush: the code is yours for the next 30 days. We hope you find something you love."]),
      ],
    ),
  };
}

export function singleWelcomeEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Welcome email",
    subject: `Welcome, ${FIRST_NAME}! You're in 🎉`,
    preheader: `Thanks for joining ${companyPlain(theme)}. Here's what happens next.`,
    document: wrap(theme, [
      hero(theme, {
        title: `Welcome, ${FIRST_NAME}!`,
        intro: `Thanks for joining ${co}. We're really glad to have you with us.`,
      }),
      tips(theme, [
        { title: "Look around", body: "Our website has everything in one place: what's new, what's popular and how we can help." },
        { title: "Watch your inbox", body: "We'll only send things worth your time: updates, tips and the occasional offer." },
        { title: "Write to us", body: "Questions or ideas? Just reply to this email. We read every message." },
      ]),
      cta(theme, "Get started", siteUrl(theme)),
    ]),
  };
}

export function onboardingTipEmail(theme: BrandTheme, n: 1 | 2 | 3): RecipeEmail {
  const co = companyHtml(theme);
  const all = {
    1: {
      name: "Tip 1: Get set up",
      subject: `Tip 1 of 3: get set up in 5 minutes, ${FIRST_NAME}`,
      preheader: "The quickest way to get started, step by step.",
      title: "Let's get you set up",
      intro: `Welcome to ${co}, ${FIRST_NAME}! Over the next week we'll send you three short tips. Here's the first one.`,
      items: [
        { title: "Complete your details", body: "A few details help us show you what's relevant to you." },
        { title: "Bookmark our website", body: "Everything you need is one click away when you want it." },
        { title: "Add us to your contacts", body: "It keeps our emails out of your spam folder, so you never miss a tip." },
      ],
      button: "Start now",
    },
    2: {
      name: "Tip 2: Find your favourites",
      subject: "Tip 2 of 3: find what you'll love",
      preheader: "How our regulars find the good stuff fast.",
      title: "Find what you'll love",
      intro: `Hi ${FIRST_NAME}, here's tip number two: how our regulars find the best of ${co} quickly.`,
      items: [
        { title: "Start with what's popular", body: "Our most-loved picks are a great shortcut when you're new." },
        { title: "Save things for later", body: "Keep a list of what catches your eye, so you can come back to it." },
        { title: "Choose your topics", body: `Tell us what you're into on your <a href="${PREFERENCES}">preferences page</a> and we'll send more of it.` },
      ],
      button: "See what's popular",
    },
    3: {
      name: "Tip 3: Get help any time",
      subject: `Last tip, ${FIRST_NAME}: we're here to help`,
      preheader: "Where to find answers, and how to reach a real person.",
      title: "You're all set, and we're here to help",
      intro: `That's a week with ${co}, ${FIRST_NAME}! Our last tip is the most important one: you're never on your own.`,
      items: [
        { title: "Answers in a minute", body: "Our website covers the most common questions, any time of day." },
        { title: "Talk to a person", body: "Reply to any of our emails and someone from the team will answer." },
        { title: "Share your ideas", body: "Something you wish we did? We'd genuinely love to hear it." },
      ],
      button: "Visit our help pages",
    },
  }[n];
  return {
    name: all.name,
    subject: all.subject,
    preheader: all.preheader,
    document: wrap(theme, [
      softHero(theme, { eyebrow: `TIP ${n} OF 3`, title: all.title, intro: all.intro }),
      tips(theme, all.items),
      cta(theme, all.button, siteUrl(theme)),
    ]),
  };
}

// ── Forms ───────────────────────────────────────────────────────────────────

export function formThankYouEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Thank-you email",
    subject: `Thanks for signing up, ${FIRST_NAME}!`,
    preheader: "You're on the list. Here's what happens next.",
    document: wrap(theme, [
      hero(theme, {
        eyebrow: "YOU'RE ON THE LIST",
        title: `Thank you, ${FIRST_NAME}!`,
        intro: `Your sign-up worked. Welcome to the ${co} community.`,
      }),
      body([
        "Thanks for filling in our form. Here's what happens next: in a few days we'll send you a short email with the things people like most about us. After that, you'll hear from us when there's something genuinely worth sharing.",
        "If you signed up for something specific, like a download, a quote or a callback, we're on it. Just reply to this email if you have any questions in the meantime.",
      ]),
      cta(theme, "Visit our website", siteUrl(theme)),
    ]),
  };
}

export function formNurtureEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "What people love most",
    subject: `${FIRST_NAME}, here's what people love most about ${companyPlain(theme)}`,
    preheader: "Three quick reasons people stay with us.",
    document: wrap(theme, [
      softHero(theme, {
        eyebrow: "A FEW DAYS IN",
        title: "Here's why people stay",
        intro: `A few days ago you signed up with ${co}. Here's a quick look at what our community values most.`,
      }),
      tips(theme, [
        { title: "Real people, real help", body: "Every question gets a real answer, from someone who knows their stuff." },
        { title: "Quality you can trust", body: "We'd rather do fewer things really well. That's a promise we keep." },
        { title: "Something new each month", body: "There's always something fresh to discover, and you'll hear about it first." },
      ]),
      cta(theme, "See for yourself", siteUrl(theme), `<a href="${PREFERENCES}">Choose what you hear about</a>`),
    ]),
  };
}

// ── Birthdays ───────────────────────────────────────────────────────────────

export function birthdayEmail(theme: BrandTheme): RecipeEmail {
  return {
    name: "Birthday email",
    subject: `Happy birthday, ${FIRST_NAME}! 🎂 A gift inside`,
    preheader: "We saved you something special to celebrate your day.",
    document: wrap(
      theme,
      [
        hero(theme, {
          eyebrow: "🎈 🎂 🎉",
          title: `Happy birthday, ${FIRST_NAME}!`,
          intro: "Another trip around the sun deserves a proper celebration. Here's a little gift from all of us.",
        }),
        highlightBox(theme, {
          label: "YOUR BIRTHDAY GIFT",
          big: "15% off",
          small: "Use code <strong>BIRTHDAY15</strong> any time in the next 14 days.",
          cta: { label: "Treat myself", href: siteUrl(theme) },
        }),
        body(["We hope your day is full of good food, good people and at least one lovely surprise. Thanks for being part of our story."]),
      ],
      { signoff: "Wishing you a wonderful year ahead,", note: `<p>© ${CURRENT_YEAR} ${companyHtml(theme)}. Gift codes can be used once per customer.</p>` },
    ),
  };
}

export function birthdayHeadsUpEmail(theme: BrandTheme): RecipeEmail {
  return {
    name: "Birthday heads-up",
    subject: `${FIRST_NAME}, your birthday gift is almost ready 🎁`,
    preheader: "Your special day is coming up, and so is a little surprise.",
    document: wrap(theme, [
      softHero(theme, {
        eyebrow: "A LITTLE BIRD TOLD US",
        title: `Your birthday is coming up, ${FIRST_NAME}!`,
        intro: "In just a few days it's your big day, and we've got a gift waiting for you.",
      }),
      body([
        "Keep an eye on your inbox on your birthday: your gift arrives that morning.",
        "Planning a celebration? Have a look at what's new on our website. Maybe there's something for the party, or a little treat for yourself.",
      ]),
      cta(theme, "Browse what's new", siteUrl(theme)),
    ]),
  };
}

// ── Re-engagement ───────────────────────────────────────────────────────────

export function weMissYouEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "We miss you",
    subject: `We miss you, ${FIRST_NAME}`,
    preheader: "It's been a while. Here's what you've missed.",
    document: wrap(theme, [
      hero(theme, {
        title: `It's been a while, ${FIRST_NAME}`,
        intro: `We noticed you haven't been around ${co} lately, and we miss you. Here's what's new since you last visited.`,
      }),
      tips(theme, [
        { title: "Fresh arrivals", body: "New things we think you'll like, added since your last visit." },
        { title: "Your old favourites", body: "Everything you liked before is still here, waiting for you." },
        { title: "A warmer welcome back", body: "Click below to catch up. It only takes a minute." },
      ]),
      cta(theme, "Catch up on what's new", siteUrl(theme)),
    ]),
  };
}

export function lastChanceEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Last chance: stay subscribed?",
    subject: `${FIRST_NAME}, should we stop emailing you?`,
    preheader: "One click to stay, or to hear from us less often.",
    document: wrap(theme, [
      softHero(theme, {
        eyebrow: "A QUICK QUESTION",
        title: "Do you still want to hear from us?",
        intro: `We haven't heard from you in a while, ${FIRST_NAME}, and we only want to send email to people who enjoy it.`,
      }),
      body([
        `If you'd like to keep getting emails from ${co}, there's nothing to do: you'll stay on the list.`,
        "Would you rather hear from us less often, or only about certain things? You can choose exactly what you get on your preferences page.",
        `And if it's time to say goodbye, no hard feelings. You can unsubscribe with the link at the bottom of this email.`,
      ]),
      cta(theme, "Choose what I receive", PREFERENCES, "Takes ten seconds. No password needed."),
    ]),
  };
}

// ── Events ──────────────────────────────────────────────────────────────────

export function eventInviteEmail(theme: BrandTheme): RecipeEmail {
  const co = companyHtml(theme);
  return {
    name: "Event invitation",
    subject: `You're invited, ${FIRST_NAME}!`,
    preheader: "Save the date: we'd love to see you there.",
    document: wrap(
      theme,
      [
        hero(theme, {
          eyebrow: "YOU'RE INVITED",
          title: "Join us for an evening to remember",
          intro: `${co} is hosting an event and we'd love you to be there, ${FIRST_NAME}.`,
        }),
        highlightBox(theme, {
          label: "SAVE THE DATE",
          big: "Saturday, 6 pm",
          small: "The address and all the details are on the event page. Places are limited, so save yours early.",
          cta: { label: "Save my spot", href: siteUrl(theme) },
        }),
        body(["Expect great conversation, a few surprises and plenty of time to meet the team. Bring a friend if you like!"]),
      ],
    ),
  };
}

export function eventReminderEmail(theme: BrandTheme): RecipeEmail {
  return {
    name: "Event reminder",
    subject: `Reminder: our event is coming up, ${FIRST_NAME}`,
    preheader: "Just a few days to go. Here are the details again.",
    document: wrap(theme, [
      softHero(theme, {
        eyebrow: "FRIENDLY REMINDER",
        title: "Just a few days to go!",
        intro: `A quick reminder about our event, ${FIRST_NAME}. Here are the details again, so you have them to hand.`,
      }),
      highlightBox(theme, {
        label: "WHEN AND WHERE",
        big: "Saturday, 6 pm",
        small: "The address and all the details are on the event page.",
      }),
      cta(theme, "Save my spot", siteUrl(theme), "Already saved your spot? Great, see you there!"),
    ]),
  };
}

export function eventLastCallEmail(theme: BrandTheme): RecipeEmail {
  return {
    name: "Last call",
    subject: `Last call, ${FIRST_NAME}: spots are almost gone`,
    preheader: "This is the final reminder before the doors open.",
    document: wrap(theme, [
      hero(theme, {
        eyebrow: "LAST CALL",
        title: "There's still time to join us",
        intro: `This is our final reminder, ${FIRST_NAME}. Places are filling up, and we'd hate for you to miss out.`,
      }),
      cta(theme, "Save my spot now", siteUrl(theme), "If you've already saved your spot, you're all set. See you there!"),
    ]),
  };
}
