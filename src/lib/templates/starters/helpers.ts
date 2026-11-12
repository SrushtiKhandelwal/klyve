// Small building helpers for the starter templates.
//
// Every starter is written as plain code that builds an EmailDocument from
// the workspace's BrandTheme. These helpers keep the starters short and make
// sure they all share the same good habits:
//   - colours come from the brand (with readable text on top of them),
//   - the header shows the logo (or the company name when there's no logo),
//   - the footer always has the address and the unsubscribe link.
//
// Safe to import from server AND client (no database, no Node-only code).
import {
  BUILTIN_MERGE_TAGS,
  DOCUMENT_VERSION,
  defaultFooterHtml,
  defaultSettings,
  newId,
  pad,
  type Align,
  type Block,
  type BrandTheme,
  type ButtonBlock,
  type Column,
  type DividerBlock,
  type DocumentSettings,
  type EmailDocument,
  type FooterBlock,
  type HeadingBlock,
  type ImageBlock,
  type Padding,
  type Section,
  type SocialBlock,
  type SocialNetwork,
  type SpacerBlock,
  type TextBlock,
} from "@/lib/templates/document";

// ── Metadata ────────────────────────────────────────────────────────────────

/** The gallery's category chips, in the order they are shown. */
export const STARTER_CATEGORIES = [
  "Welcome & onboarding",
  "Newsletter",
  "Promotions & sales",
  "Events",
  "E-commerce",
  "Announcements",
  "Re-engagement",
  "Seasonal",
  "Feedback",
  "Plain & simple",
] as const;
export type StarterCategory = (typeof STARTER_CATEGORIES)[number];

/** What the gallery shows about a starter (no document, so it's tiny). */
export type StarterMeta = {
  id: string;
  name: string;
  category: StarterCategory;
  description: string;
  /** Suggested subject line and preview text, copied into the new template. */
  subject: string;
  preheader: string;
};

export type StarterDefinition = StarterMeta & {
  build: (theme: BrandTheme) => EmailDocument;
};

// ── Merge tags used in starter copy ─────────────────────────────────────────

/** {{ contact.FIRSTNAME | default: "there" }}: "Hi Priya" or "Hi there". */
export const FIRST_NAME = BUILTIN_MERGE_TAGS[0].tag;
export const CURRENT_YEAR = "{{ current_year }}";

// ── Colours ─────────────────────────────────────────────────────────────────
// Brand colours can be anything, so we compute tints and pick a readable
// text colour instead of hard-coding "white text on green".

function toRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Blends `color` towards `other`. amount 0 = color, 1 = other. */
export function mix(color: string, other: string, amount: number): string {
  const a = toRgb(color);
  const b = toRgb(other);
  return toHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
}

/** A very light version of a colour, for soft backgrounds. */
export const tint = (color: string, amount = 0.9) => mix(color, "#ffffff", amount);
/** A darker version of a colour. */
export const shade = (color: string, amount = 0.25) => mix(color, "#000000", amount);

/** Black-ish or white text, whichever is easier to read on `background`. */
export function onColor(background: string): string {
  const [r, g, b] = toRgb(background).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#18181b" : "#ffffff";
}

// ── Text ────────────────────────────────────────────────────────────────────

/** Makes brand text (company name, address) safe to put inside HTML. */
export function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Where "Visit our website"-style buttons point. "https://" = "add a link" reminder. */
export const siteUrl = (theme: BrandTheme) => theme.websiteUrl || "https://";

// ── Blocks ──────────────────────────────────────────────────────────────────
// Each helper returns a complete, valid block. Pass only what differs.

type Opts<T> = Partial<Omit<T, "id" | "type">>;

export function heading(html: string, o: Opts<HeadingBlock> = {}): HeadingBlock {
  return { id: newId("b"), type: "heading", padding: pad(8, 24), html, level: 1, align: "left", color: null, fontSize: 28, ...o };
}

/** A smaller heading (level 2), e.g. for article titles. */
export function subheading(html: string, o: Opts<HeadingBlock> = {}): HeadingBlock {
  return heading(html, { level: 2, fontSize: 20, ...o });
}

export function text(html: string, o: Opts<TextBlock> = {}): TextBlock {
  return { id: newId("b"), type: "text", padding: pad(8, 24), html, align: "left", color: null, fontSize: 16, lineHeight: 1.6, ...o };
}

/** Image placeholder (src "") unless a source is given: the editor asks the user to pick one. */
export function image(alt: string, o: Opts<ImageBlock> = {}): ImageBlock {
  return {
    id: newId("b"), type: "image", padding: pad(8, 24), src: "", alt, href: "", width: null,
    align: "center", borderRadius: 0, mediaId: null, ...o,
  };
}

export function button(label: string, href: string, theme: BrandTheme, o: Opts<ButtonBlock> = {}): ButtonBlock {
  const backgroundColor = o.backgroundColor ?? theme.primaryColor;
  return {
    id: newId("b"), type: "button", padding: pad(12, 24), label, href, align: "center",
    backgroundColor, textColor: onColor(backgroundColor), borderRadius: 6, fontSize: 16, fullWidth: false, ...o,
  };
}

export function divider(o: Opts<DividerBlock> = {}): DividerBlock {
  return { id: newId("b"), type: "divider", padding: pad(12, 24), color: "#e4e4e7", thickness: 1, widthPercent: 100, style: "solid", ...o };
}

export function spacer(height = 24): SpacerBlock {
  return { id: newId("b"), type: "spacer", padding: pad(0), height };
}

/** The brand's social links. Returns null when the brand has none, so callers can skip the row. */
export function social(theme: BrandTheme, o: Opts<SocialBlock> = {}): SocialBlock | null {
  const links = (Object.entries(theme.socialLinks) as [SocialNetwork, string | undefined][])
    .filter((entry): entry is [SocialNetwork, string] => !!entry[1])
    .map(([network, url]) => ({ network, url }));
  if (links.length === 0) return null;
  return { id: newId("b"), type: "social", padding: pad(12, 24), align: "center", iconSize: 28, links, ...o };
}

/** The legal footer: company, address and the unsubscribe link (required in every email). */
export function footer(theme: BrandTheme, o: Opts<FooterBlock> = {}): FooterBlock {
  return {
    id: newId("b"), type: "footer", padding: pad(16, 24, 24, 24), html: defaultFooterHtml(theme),
    align: "center", color: "#71717a", fontSize: 12, ...o,
  };
}

// ── Layout ──────────────────────────────────────────────────────────────────

type ColumnInput = Block[] | { blocks: Block[]; backgroundColor?: string | null; padding?: Padding; verticalAlign?: Column["verticalAlign"] };

type SectionOpts = { backgroundColor?: string | null; padding?: Padding; stackOnMobile?: boolean };

/** Column widths (in %) that add up to exactly 100. */
const WIDTHS: Record<number, number[]> = {
  1: [100],
  2: [50, 50],
  3: [33.34, 33.33, 33.33],
  4: [25, 25, 25, 25],
};

/**
 * One row of the email. `columns` is a list of block lists (or column
 * objects for a background colour). Widths default to equal columns.
 */
export function section(columns: ColumnInput[], o: SectionOpts & { widths?: number[] } = {}): Section {
  const widths = o.widths ?? WIDTHS[columns.length] ?? WIDTHS[1];
  return {
    id: newId("s"),
    backgroundColor: o.backgroundColor ?? null,
    backgroundImage: null,
    padding: o.padding ?? pad(8, 0),
    stackOnMobile: o.stackOnMobile ?? true,
    columns: columns.map((col, i) => {
      const c = Array.isArray(col) ? { blocks: col } : col;
      return {
        id: newId("c"),
        widthPercent: widths[i] ?? 100,
        backgroundColor: c.backgroundColor ?? null,
        padding: c.padding ?? pad(0),
        verticalAlign: c.verticalAlign ?? "top",
        blocks: c.blocks,
      };
    }),
  };
}

/** Logo (or company name) at the top of the email. */
export function brandHeader(
  theme: BrandTheme,
  o: { align?: Align; backgroundColor?: string | null; logoWidth?: number } = {},
): Section {
  const align = o.align ?? "center";
  const onBg = o.backgroundColor ? onColor(o.backgroundColor) : null;
  const block: Block = theme.logoUrl
    ? image(theme.companyName, {
        src: theme.logoUrl,
        href: theme.websiteUrl ?? "",
        width: o.logoWidth ?? 140,
        align,
        padding: pad(24, 24, 16, 24),
      })
    : heading(`<strong>${esc(theme.companyName)}</strong>`, {
        level: 3,
        fontSize: 22,
        align,
        color: onBg ?? theme.primaryColor,
        padding: pad(24, 24, 16, 24),
      });
  return section([[block]], { backgroundColor: o.backgroundColor ?? null, padding: pad(0) });
}

/** Social icons (if the brand has any) and the legal footer, on a soft background. */
export function brandFooter(theme: BrandTheme, o: { backgroundColor?: string; note?: string } = {}): Section {
  const backgroundColor = o.backgroundColor ?? tint(theme.backgroundColor, 0.4);
  const blocks: Block[] = [];
  if (o.note) blocks.push(text(o.note, { align: "center", fontSize: 13, color: "#52525b", padding: pad(20, 24, 0, 24) }));
  const icons = social(theme, { padding: pad(20, 24, 4, 24), iconSize: 24 });
  if (icons) blocks.push(icons);
  blocks.push(footer(theme));
  return section([blocks], { backgroundColor, padding: pad(8, 0) });
}

/** Wraps sections into a full document using the brand's base settings. */
export function emailDoc(theme: BrandTheme, sections: Section[], settings: Partial<DocumentSettings> = {}): EmailDocument {
  return { version: DOCUMENT_VERSION, settings: { ...defaultSettings(theme), ...settings }, sections };
}
