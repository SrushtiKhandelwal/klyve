"use client";

// How each block LOOKS on the canvas: a close React approximation of the
// final email, using the block's own settings. The real email HTML comes
// from the renderer (see the Preview tab); this is only for editing.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ImagePlus, Share2 } from "lucide-react";
import type { Align, Block, DocumentSettings } from "@/lib/templates/document";
import type { RichTextMode } from "@/lib/templates/editor-html";
import { SOCIAL_META, WebsiteIcon } from "./block-meta";
import { useEditorApi, type BlockOf } from "./editor-store";
import { RichTextEditor, RichTextStatic } from "./rich-text";

const justify: Record<Align, CSSProperties["justifyContent"]> = { left: "flex-start", center: "center", right: "flex-end" };

export function BlockContent({ block, settings, editing }: { block: Block; settings: DocumentSettings; editing: boolean }) {
  switch (block.type) {
    case "heading":
      return <HeadingContent block={block} settings={settings} editing={editing} />;
    case "text":
      return <TextContent block={block} settings={settings} editing={editing} />;
    case "footer":
      return <FooterContent block={block} settings={settings} editing={editing} />;
    case "image":
      return <ImageContent block={block} />;
    case "button":
      return <ButtonContent block={block} />;
    case "divider":
      return <DividerContent block={block} />;
    case "spacer":
      return <div aria-hidden style={{ height: block.height }} className="bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(16_185_129/0.06)_6px,rgb(16_185_129/0.06)_12px)]" />;
    case "social":
      return <SocialContent block={block} />;
    case "video":
      return <VideoContent block={block} settings={settings} />;
    case "html":
      return <HtmlContent html={block.html} settings={settings} />;
  }
}

// ── Rich text blocks ─────────────────────────────────────────────────────────

/** Shows static text, or the live editor while the block is selected. */
function RichText({
  blockId,
  html,
  mode,
  label,
  editing,
  style,
}: {
  blockId: string;
  html: string;
  mode: RichTextMode;
  label: string;
  editing: boolean;
  style: CSSProperties;
}) {
  const api = useEditorApi();
  const onChange = useCallback(
    (next: string) => api.dispatch({ type: "updateBlock", blockId, patch: { html: next } }, `html:${blockId}`),
    [api, blockId],
  );
  return editing ? (
    <RichTextEditor blockId={blockId} html={html} mode={mode} label={label} onChange={onChange} style={style} />
  ) : (
    <RichTextStatic html={html} mode={mode} style={style} />
  );
}

function HeadingContent({ block, settings, editing }: { block: BlockOf<"heading">; settings: DocumentSettings; editing: boolean }) {
  return (
    <div role="heading" aria-level={block.level}>
      <RichText
        blockId={block.id}
        html={block.html}
        mode="inline"
        label="Heading text"
        editing={editing}
        style={{
          fontSize: block.fontSize,
          color: block.color ?? settings.headingColor,
          textAlign: block.align,
          lineHeight: 1.25,
          fontWeight: 700,
        }}
      />
    </div>
  );
}

function TextContent({ block, settings, editing }: { block: BlockOf<"text">; settings: DocumentSettings; editing: boolean }) {
  return (
    <RichText
      blockId={block.id}
      html={block.html}
      mode="full"
      label="Text"
      editing={editing}
      style={{ fontSize: block.fontSize, lineHeight: block.lineHeight, color: block.color ?? settings.textColor, textAlign: block.align }}
    />
  );
}

function FooterContent({ block, settings, editing }: { block: BlockOf<"footer">; settings: DocumentSettings; editing: boolean }) {
  return (
    <RichText
      blockId={block.id}
      html={block.html}
      mode="noLists"
      label="Footer text"
      editing={editing}
      // Footer links (like "Unsubscribe") use the footer's own quiet colour, as in the real email.
      style={
        {
          fontSize: block.fontSize,
          lineHeight: 1.5,
          color: block.color ?? settings.textColor,
          textAlign: block.align,
          "--email-link": block.color ?? settings.textColor,
        } as CSSProperties
      }
    />
  );
}

// ── Media ────────────────────────────────────────────────────────────────────

function Placeholder({ label, onPick }: { label: string; onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-zinc-500">
      <ImagePlus className="size-6" aria-hidden />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPick();
        }}
        className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none"
      >
        {label}
      </button>
    </div>
  );
}

function ImageContent({ block }: { block: BlockOf<"image"> }) {
  const api = useEditorApi();
  if (!block.src) {
    return (
      <Placeholder
        label="Choose an image"
        onPick={() =>
          api.pickImage((asset) =>
            api.dispatch({
              type: "updateBlock",
              blockId: block.id,
              patch: imagePatchFromAsset(asset, block.alt, api.getDocument().settings.contentWidth),
            }),
          )
        }
      />
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: justify[block.align] }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user images from any host */}
      <img
        src={block.src}
        alt={block.alt}
        draggable={false}
        style={{
          width: block.width ? `${block.width}px` : "100%",
          maxWidth: "100%",
          height: "auto",
          borderRadius: block.borderRadius,
          display: "block",
        }}
      />
    </div>
  );
}

/** Image block fields for a picked media asset (small images keep their size). */
export function imagePatchFromAsset(
  asset: { id: string | null; url: string; width: number | null; alt?: string },
  currentAlt: string,
  contentWidth: number,
) {
  const width = asset.width && asset.width < contentWidth ? Math.max(20, Math.min(800, Math.round(asset.width))) : null;
  return { src: asset.url, mediaId: asset.id, alt: currentAlt || asset.alt || "", width };
}

function ButtonContent({ block }: { block: BlockOf<"button"> }) {
  return (
    <div style={{ display: "flex", justifyContent: justify[block.align] }}>
      <span
        style={{
          display: block.fullWidth ? "block" : "inline-block",
          width: block.fullWidth ? "100%" : undefined,
          textAlign: "center",
          backgroundColor: block.backgroundColor,
          color: block.textColor,
          borderRadius: block.borderRadius,
          fontSize: block.fontSize,
          fontWeight: 600,
          lineHeight: 1.2,
          padding: "12px 24px",
          wordBreak: "break-word",
        }}
      >
        {block.label || "Button"}
      </span>
    </div>
  );
}

function DividerContent({ block }: { block: BlockOf<"divider"> }) {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ width: `${block.widthPercent}%`, borderTop: `${block.thickness}px ${block.style} ${block.color}` }} />
    </div>
  );
}

function SocialContent({ block }: { block: BlockOf<"social"> }) {
  if (block.links.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 py-4 text-sm text-zinc-500">
        <Share2 className="size-4" aria-hidden /> Add social links in the panel
      </div>
    );
  }
  const size = block.iconSize;
  return (
    <div style={{ display: "flex", justifyContent: justify[block.align], gap: 8, flexWrap: "wrap" }}>
      {block.links.map((link, i) => {
        const meta = SOCIAL_META[link.network];
        return (
          <span
            key={`${link.network}-${i}`}
            title={meta.label}
            aria-label={meta.label}
            style={{
              width: size,
              height: size,
              borderRadius: 4,
              background: meta.color,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: Math.max(8, Math.round(size * 0.38)),
              fontWeight: 700,
              fontFamily: "Arial, sans-serif",
              opacity: link.url ? 1 : 0.4,
            }}
          >
            {link.network === "website" ? <WebsiteIcon style={{ width: size * 0.55, height: size * 0.55 }} /> : meta.short}
          </span>
        );
      })}
    </div>
  );
}

function VideoContent({ block, settings }: { block: BlockOf<"video">; settings: DocumentSettings }) {
  const api = useEditorApi();
  // Like the real email: the thumbnail, then a "▶ Watch" caption under it.
  const caption = (
    <p style={{ margin: "8px 0 0", textAlign: block.align, fontSize: 14, fontWeight: 700, color: settings.linkColor }}>
      &#9654;&#xFE0E; {block.alt.trim() || "Watch the video"}
    </p>
  );
  if (!block.thumbnailSrc) {
    return (
      <>
        <Placeholder
          label="Choose a thumbnail"
          onPick={() => api.pickImage((asset) => api.dispatch({ type: "updateBlock", blockId: block.id, patch: { thumbnailSrc: asset.url } }))}
        />
        {caption}
      </>
    );
  }
  return (
    <>
      <div style={{ display: "flex", justifyContent: justify[block.align] }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- user images from any host */}
        <img src={block.thumbnailSrc} alt={block.alt} draggable={false} style={{ display: "block", maxWidth: "100%", height: "auto" }} />
      </div>
      {caption}
    </>
  );
}

// ── Custom HTML ──────────────────────────────────────────────────────────────

/**
 * Custom HTML is shown in a sandboxed frame: no scripts can run (no
 * "allow-scripts"), and it can't touch the editor page. "allow-same-origin"
 * only lets US measure its height so the frame fits its content.
 */
function HtmlContent({ html, settings }: { html: string; settings: DocumentSettings }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(40);
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;padding:0;font-family:${settings.fontFamily};color:${settings.textColor};font-size:16px;line-height:1.5}img{max-width:100%;height:auto}a{color:${settings.linkColor}}</style></head><body>${html}</body></html>`;

  const measure = useCallback(() => {
    const body = ref.current?.contentDocument?.body;
    if (body) setHeight(Math.max(20, Math.min(4000, body.scrollHeight)));
  }, []);

  useEffect(() => {
    // Images inside may load later and change the height.
    const t = setTimeout(measure, 300);
    return () => clearTimeout(t);
  }, [srcDoc, measure]);

  return (
    <iframe
      ref={ref}
      title="Custom HTML block"
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={measure}
      tabIndex={-1}
      // Clicks go to the block (to select it), not into the frame.
      className="pointer-events-none block w-full border-0"
      style={{ height }}
    />
  );
}
