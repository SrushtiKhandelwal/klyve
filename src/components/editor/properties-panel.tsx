"use client";

// Right panel: the settings of whatever is selected (block, column or row).
import { ArrowDown, ArrowUp, ChevronRight, Copy, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_COLUMNS,
  newId,
  SECTION_LAYOUTS,
  SOCIAL_NETWORKS,
  UNSUBSCRIBE_TAG,
  type Block,
  type Column,
  type EmailDocument,
  type Section,
  type SocialNetwork,
} from "@/lib/templates/document";
import { findBlock, findColumn, findSection, type BlockPatch } from "@/lib/templates/editor-state";
import { BLOCK_META, layoutIcon, RICH_TEXT_TYPES, SOCIAL_META } from "./block-meta";
import { AiImproveMenu, isImprovable } from "./ai-improve-menu";
import { imagePatchFromAsset } from "./block-content";
import {
  AlignField,
  ColorField,
  Field,
  ImageField,
  LinkField,
  MergeTagTextField,
  NumberField,
  PaddingField,
  PanelSection,
  Segmented,
} from "./controls";
import { useEditorApi, useStore, type BlockOf } from "./editor-store";
import { DocumentSettingsPanel } from "./left-panel";

export function PropertiesPanel({ doc, onClose }: { doc: EmailDocument; onClose?: () => void }) {
  const api = useEditorApi();
  const selection = useStore(api.selection, (s) => s);

  let content: React.ReactNode = null;
  let crumbs: { label: string; select?: () => void }[] = [];

  if (selection?.kind === "block") {
    const loc = findBlock(doc, selection.id);
    if (loc) {
      crumbs = [
        { label: `Row ${loc.sectionIndex + 1}`, select: () => api.select({ kind: "section", id: loc.section.id }) },
        ...(loc.section.columns.length > 1
          ? [{ label: `Column ${loc.columnIndex + 1}`, select: () => api.select({ kind: "column", id: loc.column.id }) }]
          : []),
        { label: BLOCK_META[loc.block.type].label },
      ];
      content = <BlockProperties key={loc.block.id} block={loc.block} doc={doc} />;
    }
  } else if (selection?.kind === "column") {
    const loc = findColumn(doc, selection.id);
    if (loc) {
      crumbs = [
        { label: `Row ${loc.sectionIndex + 1}`, select: () => api.select({ kind: "section", id: loc.section.id }) },
        { label: `Column ${loc.columnIndex + 1}` },
      ];
      content = <ColumnProperties key={loc.column.id} column={loc.column} section={loc.section} />;
    }
  } else if (selection?.kind === "section") {
    const loc = findSection(doc, selection.id);
    if (loc) {
      crumbs = [{ label: `Row ${loc.sectionIndex + 1}` }];
      content = <SectionProperties key={loc.section.id} section={loc.section} index={loc.sectionIndex} total={doc.sections.length} />;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        {content ? (
          <nav aria-label="Selected item" className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-0.5">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-zinc-400" aria-hidden />}
                {c.select ? (
                  <button type="button" onClick={c.select} className="truncate rounded px-1 text-zinc-500 hover:text-zinc-900 hover:underline">
                    {c.label}
                  </button>
                ) : (
                  <span className="truncate px-1 font-medium text-zinc-900" aria-current="true">
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        ) : (
          <h2 className="flex-1 text-sm font-medium">Email settings</h2>
        )}
        {onClose && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {content ?? (
          <>
            <p className="border-b px-4 py-3 text-xs text-zinc-500">
              Click a block, column or row on the email to change it. These settings apply to the whole email.
            </p>
            <DocumentSettingsPanel settings={doc.settings} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

function BlockProperties({ block, doc }: { block: Block; doc: EmailDocument }) {
  const api = useEditorApi();
  const update = (patch: BlockPatch, field: string) =>
    api.dispatch({ type: "updateBlock", blockId: block.id, patch }, `block:${block.id}:${field}`);
  const { settings } = doc;

  return (
    <div>
      {RICH_TEXT_TYPES.has(block.type) && (
        <p className="border-b bg-emerald-50/60 px-4 py-2.5 text-xs text-emerald-900">
          Type directly on the email. Use the toolbar above it for bold, links, colours and personalization.
        </p>
      )}
      {isImprovable(block) && <AiImproveMenu block={block} />}
      <TypeSpecific block={block} update={update} settings={settings} />
      <PanelSection title="Spacing">
        <PaddingField value={block.padding} onChange={(padding) => update({ padding }, "padding")} />
      </PanelSection>
      <PanelSection title="Block">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => api.dispatch({ type: "moveBlockBy", blockId: block.id, delta: -1 })}>
            <ArrowUp /> Up
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => api.dispatch({ type: "moveBlockBy", blockId: block.id, delta: 1 })}>
            <ArrowDown /> Down
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => api.duplicateBlock(block.id)}>
            <Copy /> Duplicate
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => api.deleteBlock(block.id)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </PanelSection>
    </div>
  );
}

type Update = (patch: BlockPatch, field: string) => void;

function TypeSpecific({ block, update, settings }: { block: Block; update: Update; settings: EmailDocument["settings"] }) {
  switch (block.type) {
    case "heading":
      return <HeadingProps block={block} update={update} inherited={settings.headingColor} />;
    case "text":
      return <TextProps block={block} update={update} inherited={settings.textColor} />;
    case "footer":
      return <FooterProps block={block} update={update} inherited={settings.textColor} />;
    case "image":
      return <ImageProps block={block} update={update} contentWidth={settings.contentWidth} />;
    case "button":
      return <ButtonProps block={block} update={update} />;
    case "divider":
      return <DividerProps block={block} update={update} />;
    case "spacer":
      return (
        <PanelSection title="Spacer">
          <NumberField label="Height" value={block.height} min={4} max={200} onChange={(height) => update({ height }, "height")} />
        </PanelSection>
      );
    case "social":
      return <SocialProps block={block} update={update} />;
    case "video":
      return <VideoProps block={block} update={update} />;
    case "html":
      return <HtmlProps block={block} update={update} />;
  }
}

function HeadingProps({ block, update, inherited }: { block: BlockOf<"heading">; update: Update; inherited: string }) {
  return (
    <PanelSection title="Heading">
      <Field label="Level">
        <Segmented
          label="Heading level"
          value={block.level}
          onChange={(level) => update({ level, fontSize: ({ 1: 28, 2: 22, 3: 18 } as const)[level] }, "level")}
          options={[
            { value: 1, label: "H1" },
            { value: 2, label: "H2" },
            { value: 3, label: "H3" },
          ]}
        />
      </Field>
      <NumberField label="Font size" value={block.fontSize} min={12} max={72} onChange={(fontSize) => update({ fontSize }, "fontSize")} />
      <ColorField label="Colour" value={block.color} nullable inheritedColor={inherited} inheritLabel="Email heading colour" onChange={(color) => update({ color }, "color")} />
      <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />
    </PanelSection>
  );
}

function TextProps({ block, update, inherited }: { block: BlockOf<"text">; update: Update; inherited: string }) {
  return (
    <PanelSection title="Text">
      <NumberField label="Font size" value={block.fontSize} min={10} max={40} onChange={(fontSize) => update({ fontSize }, "fontSize")} />
      <NumberField label="Line height" value={block.lineHeight} min={1} max={3} step={0.1} unit="×" onChange={(lineHeight) => update({ lineHeight }, "lineHeight")} />
      <ColorField label="Colour" value={block.color} nullable inheritedColor={inherited} inheritLabel="Email text colour" onChange={(color) => update({ color }, "color")} />
      <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />
    </PanelSection>
  );
}

function FooterProps({ block, update, inherited }: { block: BlockOf<"footer">; update: Update; inherited: string }) {
  const hasUnsubscribe = /\{\{\s*unsubscribe_url\s*\}\}/.test(block.html);
  return (
    <PanelSection title="Footer">
      {!hasUnsubscribe && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-start gap-1.5">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            The unsubscribe link is missing. Emails without one can&apos;t be sent.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start bg-white"
            onClick={() => update({ html: `${block.html}<p><a href="${UNSUBSCRIBE_TAG}">Unsubscribe</a></p>` }, "html")}
          >
            <Plus /> Add unsubscribe link
          </Button>
        </div>
      )}
      <NumberField label="Font size" value={block.fontSize} min={9} max={18} onChange={(fontSize) => update({ fontSize }, "fontSize")} />
      <ColorField label="Colour" value={block.color} nullable inheritedColor={inherited} inheritLabel="Email text colour" onChange={(color) => update({ color }, "color")} />
      <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />
    </PanelSection>
  );
}

function ImageProps({ block, update, contentWidth }: { block: BlockOf<"image">; update: Update; contentWidth: number }) {
  const api = useEditorApi();
  return (
    <>
      <PanelSection title="Image">
        <ImageField
          src={block.src}
          onChange={(src, mediaId) => update({ src, mediaId }, "src")}
          onPick={() => api.pickImage((asset) => update(imagePatchFromAsset(asset, block.alt, contentWidth), "src"))}
        />
        <Field
          label="Description (alt text)"
          htmlFor={`alt-${block.id}`}
          hint="Shown when images are blocked and read aloud by screen readers. Describe what's in the picture."
        >
          <textarea
            id={`alt-${block.id}`}
            value={block.alt}
            maxLength={300}
            rows={2}
            onChange={(e) => update({ alt: e.target.value }, "alt")}
            className="w-full rounded-lg border border-input px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
        <LinkField label="Link when clicked (optional)" value={block.href} onChange={(href) => update({ href }, "href")} mergeTags={api.mergeTags} />
      </PanelSection>
      <PanelSection title="Size">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-emerald-600"
            checked={block.width === null}
            onChange={(e) => update({ width: e.target.checked ? null : Math.min(contentWidth, 300) }, "width")}
          />
          Full column width
        </label>
        {block.width !== null && (
          <NumberField label="Width" value={block.width} min={20} max={800} onChange={(width) => update({ width }, "width")} />
        )}
        <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />
        <NumberField label="Rounded corners" value={block.borderRadius} min={0} max={50} onChange={(borderRadius) => update({ borderRadius }, "radius")} />
      </PanelSection>
    </>
  );
}

function ButtonProps({ block, update }: { block: BlockOf<"button">; update: Update }) {
  const api = useEditorApi();
  return (
    <>
      <PanelSection title="Button">
        <MergeTagTextField
          label="Label"
          value={block.label}
          maxLength={120}
          mergeTags={api.mergeTags}
          onChange={(label) => update({ label }, "label")}
          error={block.label.trim() === "" ? "Buttons need a label." : null}
        />
        <LinkField label="Link" value={block.href} allowEmpty={false} onChange={(href) => update({ href }, "href")} mergeTags={api.mergeTags} />
      </PanelSection>
      <PanelSection title="Style">
        <ColorField label="Button colour" value={block.backgroundColor} onChange={(v) => v && update({ backgroundColor: v }, "bg")} />
        <ColorField label="Text colour" value={block.textColor} onChange={(v) => v && update({ textColor: v }, "fg")} />
        <NumberField label="Font size" value={block.fontSize} min={10} max={32} onChange={(fontSize) => update({ fontSize }, "fontSize")} />
        <NumberField label="Rounded corners" value={block.borderRadius} min={0} max={50} onChange={(borderRadius) => update({ borderRadius }, "radius")} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-emerald-600" checked={block.fullWidth} onChange={(e) => update({ fullWidth: e.target.checked }, "full")} />
          Full width
        </label>
        {!block.fullWidth && <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />}
      </PanelSection>
    </>
  );
}

function DividerProps({ block, update }: { block: BlockOf<"divider">; update: Update }) {
  return (
    <PanelSection title="Divider">
      <ColorField label="Colour" value={block.color} onChange={(v) => v && update({ color: v }, "color")} />
      <NumberField label="Thickness" value={block.thickness} min={1} max={10} onChange={(thickness) => update({ thickness }, "thickness")} />
      <NumberField label="Width" unit="%" value={block.widthPercent} min={10} max={100} onChange={(widthPercent) => update({ widthPercent }, "width")} />
      <Field label="Style">
        <Segmented
          label="Line style"
          value={block.style}
          onChange={(style) => update({ style }, "style")}
          options={[
            { value: "solid", label: "Solid" },
            { value: "dashed", label: "Dashed" },
            { value: "dotted", label: "Dotted" },
          ]}
        />
      </Field>
    </PanelSection>
  );
}

function SocialProps({ block, update }: { block: BlockOf<"social">; update: Update }) {
  const api = useEditorApi();
  const unused = SOCIAL_NETWORKS.filter((n) => !block.links.some((l) => l.network === n));
  const setLinks = (links: BlockOf<"social">["links"]) => update({ links }, "links");
  const move = (i: number, delta: number) => {
    const links = block.links.slice();
    const [item] = links.splice(i, 1);
    links.splice(i + delta, 0, item);
    setLinks(links);
  };

  return (
    <>
      <PanelSection title="Social links">
        {block.links.length === 0 && <p className="text-xs text-zinc-500">No links yet. Add the networks you use.</p>}
        <ul className="flex flex-col gap-3">
          {block.links.map((link, i) => (
            <li key={link.network} className="flex flex-col gap-1.5 rounded-lg border p-2">
              <div className="flex items-center gap-1">
                <span className="size-3 rounded-full" style={{ background: SOCIAL_META[link.network].color }} aria-hidden />
                <span className="flex-1 text-xs font-medium">{SOCIAL_META[link.network].label}</span>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Move ${SOCIAL_META[link.network].label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Move ${SOCIAL_META[link.network].label} down`} disabled={i === block.links.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${SOCIAL_META[link.network].label}`} onClick={() => setLinks(block.links.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <LinkField
                label={`${SOCIAL_META[link.network].label} address`}
                value={link.url}
                mergeTags={api.mergeTags}
                placeholder={link.network === "whatsapp" ? "https://wa.me/…" : "https://…"}
                onChange={(url) => setLinks(block.links.map((l, j) => (j === i ? { ...l, url } : l)))}
              />
            </li>
          ))}
        </ul>
        {unused.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" className="self-start" />}>
              <Plus /> Add network
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {unused.map((network: SocialNetwork) => (
                <DropdownMenuItem
                  key={network}
                  onClick={() => setLinks([...block.links, { network, url: api.theme.socialLinks[network] ?? "https://" }])}
                >
                  <span className="size-3 rounded-full" style={{ background: SOCIAL_META[network].color }} aria-hidden />
                  {SOCIAL_META[network].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PanelSection>
      <PanelSection title="Style">
        <NumberField label="Icon size" value={block.iconSize} min={16} max={48} onChange={(iconSize) => update({ iconSize }, "iconSize")} />
        <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />
      </PanelSection>
    </>
  );
}

function VideoProps({ block, update }: { block: BlockOf<"video">; update: Update }) {
  const api = useEditorApi();
  return (
    <PanelSection title="Video">
      <p className="text-xs text-zinc-500">
        Email apps can&apos;t play videos, so readers see this picture with a play button. Clicking it opens the video.
      </p>
      <LinkField label="Video address" value={block.href} allowEmpty={false} placeholder="https://youtube.com/watch?v=…" onChange={(href) => update({ href }, "href")} mergeTags={api.mergeTags} />
      <ImageField
        label="Thumbnail"
        src={block.thumbnailSrc}
        onChange={(thumbnailSrc) => update({ thumbnailSrc }, "thumb")}
        onPick={() => api.pickImage((asset) => update({ thumbnailSrc: asset.url }, "thumb"))}
      />
      <Field label="Description (alt text)" htmlFor={`valt-${block.id}`}>
        <Input id={`valt-${block.id}`} value={block.alt} maxLength={300} onChange={(e) => update({ alt: e.target.value }, "alt")} className="h-8" />
      </Field>
      <AlignField value={block.align} onChange={(align) => update({ align }, "align")} />
    </PanelSection>
  );
}

function HtmlProps({ block, update }: { block: BlockOf<"html">; update: Update }) {
  return (
    <PanelSection title="Custom HTML">
      <Field
        label="HTML code"
        htmlFor={`html-${block.id}`}
        hint="For advanced users. Scripts, forms and event handlers are removed when the email is built."
      >
        <textarea
          id={`html-${block.id}`}
          value={block.html}
          maxLength={50_000}
          rows={12}
          spellCheck={false}
          onChange={(e) => update({ html: e.target.value }, "html")}
          className="w-full rounded-lg border border-input bg-zinc-50 px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </Field>
    </PanelSection>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function sameWidths(a: number[], b: number[]) {
  return a.length === b.length && a.every((w, i) => Math.abs(w - b[i]) < 0.5);
}

function SectionProperties({ section, index, total }: { section: Section; index: number; total: number }) {
  const api = useEditorApi();
  const update = (patch: Partial<Section>, field: string) =>
    api.dispatch({ type: "updateSection", sectionId: section.id, patch }, `section:${section.id}:${field}`);
  const widths = section.columns.map((c) => c.widthPercent);

  return (
    <div>
      <PanelSection title="Layout">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Column layout">
          {SECTION_LAYOUTS.map((l) => {
            const active = sameWidths(l.widths, widths);
            const Icon = layoutIcon(l.widths.length);
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={active}
                title={l.label}
                onClick={() =>
                  api.dispatch({ type: "setSectionLayout", sectionId: section.id, widths: l.widths, newIds: l.widths.map(() => newId("c")) })
                }
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] outline-none hover:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-500",
                  active && "border-emerald-600 bg-emerald-50 text-emerald-800",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {l.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">Fewer columns? Their blocks move into the last column, nothing is lost.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-emerald-600" checked={section.stackOnMobile} onChange={(e) => update({ stackOnMobile: e.target.checked }, "stack")} />
          Stack columns on phones
        </label>
      </PanelSection>
      <PanelSection title="Background">
        <ColorField label="Colour" value={section.backgroundColor} nullable inheritLabel="Transparent" inheritedColor="#ffffff" onChange={(backgroundColor) => update({ backgroundColor }, "bg")} />
        <ImageField
          label="Background image"
          src={section.backgroundImage ?? ""}
          onChange={(src) => update({ backgroundImage: src || null }, "bgimg")}
          onPick={() => api.pickImage((asset) => update({ backgroundImage: asset.url }, "bgimg"))}
        />
        {section.backgroundImage && (
          <p className="text-xs text-zinc-500">Some email apps (like Outlook) don&apos;t show background images, so also pick a colour.</p>
        )}
      </PanelSection>
      <PanelSection title="Spacing">
        <PaddingField value={section.padding} onChange={(padding) => update({ padding }, "padding")} />
      </PanelSection>
      <PanelSection title="Row">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => api.dispatch({ type: "moveSectionBy", sectionId: section.id, delta: -1 })}>
            <ArrowUp /> Up
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={index === total - 1} onClick={() => api.dispatch({ type: "moveSectionBy", sectionId: section.id, delta: 1 })}>
            <ArrowDown /> Down
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => api.duplicateSection(section.id)}>
            <Copy /> Duplicate
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={() => api.deleteSection(section.id)}>
            <Trash2 /> Delete row
          </Button>
        </div>
      </PanelSection>
    </div>
  );
}

// ── Columns ──────────────────────────────────────────────────────────────────

function ColumnProperties({ column, section }: { column: Column; section: Section }) {
  const api = useEditorApi();
  const update = (patch: Partial<Column>, field: string) =>
    api.dispatch({ type: "updateColumn", columnId: column.id, patch }, `column:${column.id}:${field}`);
  const count = section.columns.length;
  return (
    <div>
      <PanelSection title="Column">
        <p className="text-xs text-zinc-500">
          Takes {Math.round(column.widthPercent)}% of the row. Change the split in the row&apos;s layout.
        </p>
        <Field label="Vertical alignment">
          <Segmented
            label="Vertical alignment"
            value={column.verticalAlign}
            onChange={(verticalAlign) => update({ verticalAlign }, "valign")}
            options={[
              { value: "top", label: "Top" },
              { value: "middle", label: "Middle" },
              { value: "bottom", label: "Bottom" },
            ]}
          />
        </Field>
        <ColorField label="Background" value={column.backgroundColor} nullable inheritLabel="Transparent" inheritedColor="#ffffff" onChange={(backgroundColor) => update({ backgroundColor }, "bg")} />
      </PanelSection>
      <PanelSection title="Spacing">
        <PaddingField value={column.padding} onChange={(padding) => update({ padding }, "padding")} />
      </PanelSection>
      <PanelSection title="Actions">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={count >= MAX_COLUMNS}
            onClick={() => api.dispatch({ type: "duplicateColumn", columnId: column.id, newId: newId("c") })}
          >
            <Copy /> Duplicate column
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={count <= 1}
            onClick={() => {
              api.dispatch({ type: "deleteColumn", columnId: column.id });
              api.select({ kind: "section", id: section.id });
            }}
          >
            <Trash2 /> Delete column
          </Button>
        </div>
        {count <= 1 && <p className="text-xs text-zinc-500">A row needs at least one column. Delete the row instead.</p>}
      </PanelSection>
    </div>
  );
}

