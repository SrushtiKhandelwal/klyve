// The email design format. EVERYTHING about templates speaks this:
//   - the drag-and-drop editor edits an EmailDocument,
//   - the renderer (render.ts) turns it into email-safe HTML,
//   - starter templates are written as EmailDocuments,
//   - the database stores it as JSON (EmailTemplate.document).
//
// Shape:  document → sections (rows) → columns (1–4 side by side) → blocks
//
// Safe to import from server AND client. Validate anything that came from
// the browser with `emailDocumentSchema` before saving or rendering.
import { z } from "zod";

export const DOCUMENT_VERSION = 1 as const;

// ── Small building blocks ────────────────────────────────────────────────────

/** "#rrggbb" or "#rgb". We keep colours simple so every email client agrees. */
export const colorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a colour like #059669.");

/**
 * A link a reader can click. Allowed: https://, http://, mailto:, tel:, and
 * a whole merge tag such as {{ unsubscribe_url }}. Never javascript: / data:.
 */
export const linkSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) => v === "" || /^(https?:\/\/|mailto:|tel:)/i.test(v) || /^\{\{\s*[a-z_][a-z0-9_.]*\s*\}\}$/i.test(v),
    "Links must start with https://, http://, mailto: or tel:.",
  );

/** Image source: an https/http URL (usually our /media/<id> URL). */
export const imageSrcSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https?:\/\//i.test(v) || v.startsWith("/media/"), "Images must be a web address.");

export const alignSchema = z.enum(["left", "center", "right"]);
export type Align = z.infer<typeof alignSchema>;

const px = (min: number, max: number) => z.number().int().min(min).max(max);

export const paddingSchema = z.object({
  top: px(0, 120),
  right: px(0, 120),
  bottom: px(0, 120),
  left: px(0, 120),
});
export type Padding = z.infer<typeof paddingSchema>;

/**
 * Rich text is stored as a SMALL subset of HTML produced by the editor:
 * <p> <br> <strong> <b> <em> <i> <u> <s> <a href> <ul> <ol> <li> <span style="color">.
 * The renderer sanitizes it again before output, so stored HTML is never trusted.
 */
const richHtml = z.string().max(20_000);

/** Web-safe font stacks: custom web fonts don't load in many email apps. */
export const FONT_STACKS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
] as const;
export const fontFamilySchema = z.enum(FONT_STACKS.map((f) => f.value) as [string, ...string[]]);

export const SOCIAL_NETWORKS = [
  "facebook", "instagram", "x", "linkedin", "youtube", "tiktok", "pinterest", "whatsapp", "website",
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

// ── Blocks (the things you drag in) ─────────────────────────────────────────

const blockBase = { id: z.string().min(1).max(40), padding: paddingSchema };

export const headingBlockSchema = z.object({
  ...blockBase,
  type: z.literal("heading"),
  /** Inline rich text only (bold/italic/underline/link/colour), no paragraphs. */
  html: richHtml,
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  align: alignSchema,
  /** null = use the document's heading colour. */
  color: colorSchema.nullable(),
  fontSize: px(12, 72),
});

export const textBlockSchema = z.object({
  ...blockBase,
  type: z.literal("text"),
  html: richHtml,
  align: alignSchema,
  color: colorSchema.nullable(),
  fontSize: px(10, 40),
  lineHeight: z.number().min(1).max(3),
});

export const imageBlockSchema = z.object({
  ...blockBase,
  type: z.literal("image"),
  src: imageSrcSchema,
  /** Describe the picture: shown when images are blocked, read by screen readers. */
  alt: z.string().max(300),
  href: linkSchema,
  /** null = full column width. */
  width: px(20, 800).nullable(),
  align: alignSchema,
  borderRadius: px(0, 50),
  /** Set when the image came from the workspace's media library. */
  mediaId: z.string().max(40).nullable(),
});

export const buttonBlockSchema = z.object({
  ...blockBase,
  type: z.literal("button"),
  label: z.string().min(1, "Buttons need a label.").max(120),
  href: linkSchema,
  align: alignSchema,
  backgroundColor: colorSchema,
  textColor: colorSchema,
  borderRadius: px(0, 50),
  fontSize: px(10, 32),
  fullWidth: z.boolean(),
});

export const dividerBlockSchema = z.object({
  ...blockBase,
  type: z.literal("divider"),
  color: colorSchema,
  thickness: px(1, 10),
  /** Percentage of the column width. */
  widthPercent: px(10, 100),
  style: z.enum(["solid", "dashed", "dotted"]),
});

export const spacerBlockSchema = z.object({
  ...blockBase,
  type: z.literal("spacer"),
  height: px(4, 200),
});

export const socialBlockSchema = z.object({
  ...blockBase,
  type: z.literal("social"),
  align: alignSchema,
  iconSize: px(16, 48),
  links: z
    .array(z.object({ network: z.enum(SOCIAL_NETWORKS), url: linkSchema }))
    .max(SOCIAL_NETWORKS.length),
});

export const videoBlockSchema = z.object({
  ...blockBase,
  type: z.literal("video"),
  /** Email apps can't play video, so we show a thumbnail that links to it. */
  thumbnailSrc: imageSrcSchema,
  href: linkSchema,
  alt: z.string().max(300),
  align: alignSchema,
});

export const htmlBlockSchema = z.object({
  ...blockBase,
  type: z.literal("html"),
  /** For advanced users. Scripts, forms and event handlers are stripped when rendering. */
  html: z.string().max(50_000),
});

/** The legal footer: company, postal address and the unsubscribe link. */
export const footerBlockSchema = z.object({
  ...blockBase,
  type: z.literal("footer"),
  html: richHtml,
  align: alignSchema,
  color: colorSchema.nullable(),
  fontSize: px(9, 18),
});

export const blockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  buttonBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  socialBlockSchema,
  videoBlockSchema,
  htmlBlockSchema,
  footerBlockSchema,
]);

export type HeadingBlock = z.infer<typeof headingBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type ButtonBlock = z.infer<typeof buttonBlockSchema>;
export type DividerBlock = z.infer<typeof dividerBlockSchema>;
export type SpacerBlock = z.infer<typeof spacerBlockSchema>;
export type SocialBlock = z.infer<typeof socialBlockSchema>;
export type VideoBlock = z.infer<typeof videoBlockSchema>;
export type HtmlBlock = z.infer<typeof htmlBlockSchema>;
export type FooterBlock = z.infer<typeof footerBlockSchema>;
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

// ── Layout ───────────────────────────────────────────────────────────────────

export const MAX_SECTIONS = 60;
export const MAX_COLUMNS = 4;
export const MAX_BLOCKS_PER_COLUMN = 40;

export const columnSchema = z.object({
  id: z.string().min(1).max(40),
  /** Percentage of the row; a section's columns add up to 100. */
  widthPercent: z.number().min(10).max(100),
  backgroundColor: colorSchema.nullable(),
  padding: paddingSchema,
  verticalAlign: z.enum(["top", "middle", "bottom"]),
  blocks: z.array(blockSchema).max(MAX_BLOCKS_PER_COLUMN),
});
export type Column = z.infer<typeof columnSchema>;

export const sectionSchema = z
  .object({
    id: z.string().min(1).max(40),
    /** null = transparent (shows the content background). */
    backgroundColor: colorSchema.nullable(),
    backgroundImage: imageSrcSchema.nullable(),
    padding: paddingSchema,
    /** On phones, put columns under each other (almost always what you want). */
    stackOnMobile: z.boolean(),
    columns: z.array(columnSchema).min(1).max(MAX_COLUMNS),
  })
  .refine(
    (s) => Math.abs(s.columns.reduce((sum, c) => sum + c.widthPercent, 0) - 100) < 0.5,
    "Column widths in a row must add up to 100%.",
  );
export type Section = z.infer<typeof sectionSchema>;

export const documentSettingsSchema = z.object({
  /** Email width in pixels. 600 is the classic safe width. */
  contentWidth: px(480, 800),
  /** Colour around the email. */
  backgroundColor: colorSchema,
  /** Colour behind the content. */
  contentBackgroundColor: colorSchema,
  fontFamily: fontFamilySchema,
  textColor: colorSchema,
  headingColor: colorSchema,
  linkColor: colorSchema,
});
export type DocumentSettings = z.infer<typeof documentSettingsSchema>;

export const emailDocumentSchema = z.object({
  version: z.literal(DOCUMENT_VERSION),
  settings: documentSettingsSchema,
  sections: z.array(sectionSchema).max(MAX_SECTIONS),
});
export type EmailDocument = z.infer<typeof emailDocumentSchema>;

// ── Merge tags (personalization) ─────────────────────────────────────────────
// Syntax is Liquid, like Brevo: {{ contact.FIRSTNAME | default: "there" }}

export type MergeTag = { tag: string; label: string; example: string };

/** Always-available tags. Custom contact fields are added from the workspace's ContactAttribute rows. */
export const BUILTIN_MERGE_TAGS: MergeTag[] = [
  { tag: '{{ contact.FIRSTNAME | default: "there" }}', label: "First name", example: "Priya" },
  { tag: "{{ contact.LASTNAME }}", label: "Last name", example: "Sharma" },
  { tag: "{{ contact.EMAIL }}", label: "Email", example: "priya@example.com" },
  { tag: "{{ unsubscribe_url }}", label: "Unsubscribe link", example: "https://…/unsubscribe/…" },
  { tag: "{{ view_in_browser_url }}", label: "View in browser link", example: "https://…/v/…" },
  { tag: "{{ preferences_url }}", label: "Manage preferences link", example: "https://…/p/…" },
  { tag: "{{ current_year }}", label: "Current year", example: String(new Date().getFullYear()) },
];

/** Tag for a custom field key, e.g. CITY → {{ contact.CITY }}. */
export function attributeMergeTag(key: string): string {
  return `{{ contact.${key} }}`;
}

/** Every finished email MUST contain this, so readers can always unsubscribe. */
export const UNSUBSCRIBE_TAG = "{{ unsubscribe_url }}";

// ── Factories: new, valid objects for the editor and starter templates ──────

/** Short random id, unique enough within one document. */
export function newId(prefix = "b"): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${random}`;
}

export const pad = (top: number, right = top, bottom = top, left = right): Padding => ({ top, right, bottom, left });

/** Brand values used when creating blocks. Comes from the workspace's BrandKit. */
export type BrandTheme = {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  companyName: string;
  address: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  socialLinks: Partial<Record<SocialNetwork, string>>;
};

export const DEFAULT_THEME: BrandTheme = {
  primaryColor: "#059669",
  secondaryColor: "#0f172a",
  backgroundColor: "#f4f4f5",
  textColor: "#27272a",
  fontFamily: "Arial, Helvetica, sans-serif",
  companyName: "Your company",
  address: "Your street, City, Country",
  logoUrl: null,
  websiteUrl: null,
  socialLinks: {},
};

export function defaultSettings(theme: BrandTheme = DEFAULT_THEME): DocumentSettings {
  const font = FONT_STACKS.some((f) => f.value === theme.fontFamily) ? theme.fontFamily : FONT_STACKS[0].value;
  return {
    contentWidth: 600,
    backgroundColor: theme.backgroundColor,
    contentBackgroundColor: "#ffffff",
    fontFamily: font,
    textColor: theme.textColor,
    headingColor: theme.secondaryColor,
    linkColor: theme.primaryColor,
  };
}

/** The default footer text, with the unsubscribe link already in place. */
export function defaultFooterHtml(theme: BrandTheme = DEFAULT_THEME): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<p>${esc(theme.companyName)} · ${esc(theme.address)}</p>` +
    `<p>You received this email because you signed up with us. ` +
    `<a href="${UNSUBSCRIBE_TAG}">Unsubscribe</a></p>`
  );
}

/** A new block of the given type with sensible defaults. */
export function createBlock(type: BlockType, theme: BrandTheme = DEFAULT_THEME): Block {
  const id = newId("b");
  switch (type) {
    case "heading":
      return { id, type, padding: pad(10, 24), html: "Your headline here", level: 1, align: "left", color: null, fontSize: 28 };
    case "text":
      return {
        id, type, padding: pad(10, 24),
        html: "<p>Write something your readers will love. Use the toolbar to make text <strong>bold</strong> or add a link.</p>",
        align: "left", color: null, fontSize: 16, lineHeight: 1.6,
      };
    case "image":
      return { id, type, padding: pad(10, 24), src: "", alt: "", href: "", width: null, align: "center", borderRadius: 0, mediaId: null };
    case "button":
      return {
        id, type, padding: pad(12, 24), label: "Learn more", href: "https://", align: "center",
        backgroundColor: theme.primaryColor, textColor: "#ffffff", borderRadius: 6, fontSize: 16, fullWidth: false,
      };
    case "divider":
      return { id, type, padding: pad(12, 24), color: "#e4e4e7", thickness: 1, widthPercent: 100, style: "solid" };
    case "spacer":
      return { id, type, padding: pad(0), height: 24 };
    case "social":
      return {
        id, type, padding: pad(12, 24), align: "center", iconSize: 28,
        links: (Object.entries(theme.socialLinks) as [SocialNetwork, string][])
          .filter(([, url]) => !!url)
          .map(([network, url]) => ({ network, url })),
      };
    case "video":
      return { id, type, padding: pad(10, 24), thumbnailSrc: "", href: "https://", alt: "Watch the video", align: "center" };
    case "html":
      return { id, type, padding: pad(10, 24), html: "<p>Custom HTML</p>" };
    case "footer":
      return { id, type, padding: pad(24, 24), html: defaultFooterHtml(theme), align: "center", color: "#71717a", fontSize: 12 };
  }
}

/** A new column. */
export function createColumn(widthPercent: number, blocks: Block[] = []): Column {
  return { id: newId("c"), widthPercent, backgroundColor: null, padding: pad(0), verticalAlign: "top", blocks };
}

/** Common row layouts offered in the editor (column widths in %). */
export const SECTION_LAYOUTS: { id: string; label: string; widths: number[] }[] = [
  { id: "1", label: "1 column", widths: [100] },
  { id: "2", label: "2 columns", widths: [50, 50] },
  { id: "3", label: "3 columns", widths: [33.34, 33.33, 33.33] },
  { id: "4", label: "4 columns", widths: [25, 25, 25, 25] },
  { id: "1-2", label: "1/3 + 2/3", widths: [33.34, 66.66] },
  { id: "2-1", label: "2/3 + 1/3", widths: [66.66, 33.34] },
];

export function createSection(widths: number[] = [100], blocksPerColumn: Block[][] = []): Section {
  return {
    id: newId("s"),
    backgroundColor: null,
    backgroundImage: null,
    padding: pad(8, 0),
    stackOnMobile: true,
    columns: widths.map((w, i) => createColumn(w, blocksPerColumn[i] ?? [])),
  };
}

/** A blank email: a heading, some text and the required footer. */
export function emptyDocument(theme: BrandTheme = DEFAULT_THEME): EmailDocument {
  return {
    version: DOCUMENT_VERSION,
    settings: defaultSettings(theme),
    sections: [
      createSection([100], [[createBlock("heading", theme), createBlock("text", theme)]]),
      createSection([100], [[createBlock("footer", theme)]]),
    ],
  };
}

/** Gives every section/column/block a fresh id (used when copying a starter template). */
export function withFreshIds(doc: EmailDocument): EmailDocument {
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      id: newId("s"),
      columns: s.columns.map((c) => ({ ...c, id: newId("c"), blocks: c.blocks.map((b) => ({ ...b, id: newId("b") })) })),
    })),
  };
}

/** Problems that don't stop saving but should be shown (and block sending in Phase 4). */
export function documentWarnings(doc: EmailDocument): string[] {
  const warnings: string[] = [];
  const blocks = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  const allHtml = blocks
    .map((b) => ("html" in b ? b.html : "") + ("href" in b ? b.href : ""))
    .join(" ");
  if (!/\{\{\s*unsubscribe_url\s*\}\}/.test(allHtml)) {
    warnings.push("Add an unsubscribe link (the Footer block has one). Emails without one can't be sent.");
  }
  for (const b of blocks) {
    if (b.type === "image" && !b.src) warnings.push("An image block has no picture yet.");
    if (b.type === "image" && b.src && !b.alt.trim()) warnings.push("An image is missing its description (alt text).");
    if ((b.type === "button" || b.type === "video") && (b.href === "" || b.href === "https://")) {
      warnings.push(`A ${b.type} has no link yet.`);
    }
  }
  return [...new Set(warnings)];
}
