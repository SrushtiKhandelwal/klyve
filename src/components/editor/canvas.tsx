"use client";

// The centre of the editor: the email drawn as editable rows, columns and
// blocks.
//
// PERFORMANCE: rows, columns and blocks are memoized. The reducer reuses
// unchanged objects, so typing in one text block only re-renders that block
// (and its column/row wrappers), never the whole canvas. Selection and drop
// lines come from small stores, so only the affected items re-render.
import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Rows3, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SECTION_LAYOUTS, type Block, type Column, type DocumentSettings, type EmailDocument, type Section } from "@/lib/templates/document";
import { BLOCK_META, BLOCK_ORDER, layoutIcon, RICH_TEXT_TYPES } from "./block-meta";
import { BlockContent } from "./block-content";
import { dndId, type DragData, type DropData } from "./dnd";
import { useEditorApi, useIsSelected, useStore } from "./editor-store";

export type CanvasDevice = "desktop" | "mobile";

/** Below this email width, rows with "stack on mobile" show columns under each other. */
const STACK_BELOW = 480;

export function Canvas({ doc, device }: { doc: EmailDocument; device: CanvasDevice }) {
  const api = useEditorApi();
  const { settings, sections } = doc;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const { setNodeRef } = useDroppable({ id: dndId.canvas, data: { accepts: "canvas" } satisfies DropData });
  const dropAtEnd = useStore(api.dropTarget, (t) => t?.kind === "section" && t.index === sections.length && sections.length === 0);

  // Watch the email's real width (phone preview, small screens).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < STACK_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bodyStyle = {
    width: device === "mobile" ? 375 : settings.contentWidth,
    maxWidth: "100%",
    backgroundColor: settings.contentBackgroundColor,
    fontFamily: settings.fontFamily,
    color: settings.textColor,
    // A fixed base size, so the editor's own small UI text never leaks into the email.
    fontSize: 16,
    lineHeight: 1.5,
    "--email-link": settings.linkColor,
  } as CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className="min-h-full px-3 py-6 sm:px-8 sm:py-10"
      style={{ backgroundColor: settings.backgroundColor }}
      onClick={(e) => {
        // A click on the background (outside the email) clears the selection.
        if (e.target === e.currentTarget) api.select(null);
      }}
    >
      <div
        ref={bodyRef}
        data-canvas-sections
        className="relative mx-auto shadow-sm transition-[width] duration-200"
        style={bodyStyle}
        aria-label="Email content"
        role="region"
      >
        {sections.map((section, i) => (
          <SectionView
            key={section.id}
            section={section}
            index={i}
            total={sections.length}
            settings={settings}
            stacked={narrow && section.stackOnMobile}
          />
        ))}
        {sections.length === 0 && <EmptyCanvas showDrop={dropAtEnd} />}
      </div>
      <div className="mx-auto mt-4 flex justify-center" style={{ width: bodyStyle.width, maxWidth: "100%" }}>
        <AddRowMenu label="Add row" />
      </div>
    </div>
  );
}

// ── Pieces shared by rows/columns/blocks ─────────────────────────────────────

function DropLine({ position = "top" }: { position?: "top" | "bottom" }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-40 h-1 rounded-full bg-emerald-500 shadow-[0_0_0_2px_white]",
        position === "top" ? "-top-0.5" : "-bottom-0.5",
      )}
    >
      <span className="absolute top-1/2 -left-1 size-2.5 -translate-y-1/2 rounded-full bg-emerald-500" />
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
  disabled,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded text-white/90 outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40 [&_svg]:size-3.5",
        destructive && "hover:bg-red-500",
      )}
    >
      {children}
    </button>
  );
}

const pad = (p: { top: number; right: number; bottom: number; left: number }) => `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;

// ── Rows (sections) ──────────────────────────────────────────────────────────

const SectionView = memo(function SectionView({
  section,
  index,
  total,
  settings,
  stacked,
}: {
  section: Section;
  index: number;
  total: number;
  settings: DocumentSettings;
  stacked: boolean;
}) {
  const api = useEditorApi();
  const selected = useIsSelected("section", section.id);
  const dropBefore = useStore(api.dropTarget, (t) => t?.kind === "section" && t.index === index);
  const dropAfter = useStore(api.dropTarget, (t) => t?.kind === "section" && t.index === total && index === total - 1);
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dndId.row(section.id),
    data: { kind: "row", sectionId: section.id } satisfies DragData,
  });

  return (
    <div ref={setNodeRef} data-section-wrapper data-section-id={section.id} className={cn("group/section relative", isDragging && "opacity-40")}>
      {dropBefore && <DropLine />}
      <div
        className={cn(
          "relative",
          selected
            ? "outline-2 -outline-offset-2 outline-emerald-600"
            : "hover:outline-1 hover:-outline-offset-1 hover:outline-emerald-400 hover:outline-dashed",
        )}
        style={{
          backgroundColor: section.backgroundColor ?? undefined,
          backgroundImage: section.backgroundImage ? `url("${section.backgroundImage.replace(/"/g, "%22")}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          padding: pad(section.padding),
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-column-id]")) return;
          e.stopPropagation();
          api.select({ kind: "section", id: section.id });
        }}
      >
        {/* Row toolbar: visible on hover, keyboard focus or when selected. */}
        <div
          className={cn(
            "absolute top-0 left-0 z-30 flex -translate-y-full items-center gap-0.5 rounded-t-md bg-emerald-600 px-1 py-0.5 text-white shadow-sm transition-opacity",
            selected ? "opacity-100" : "opacity-0 group-hover/section:opacity-100 focus-within:opacity-100",
            index === 0 && "translate-y-0 rounded-t-none rounded-br-md",
          )}
        >
          <button
            type="button"
            ref={setActivatorNodeRef}
            data-row-handle
            {...attributes}
            {...listeners}
            aria-label={`Drag row ${index + 1}`}
            className="inline-flex size-6 cursor-grab touch-none items-center justify-center rounded outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              api.select({ kind: "section", id: section.id });
            }}
            className="rounded px-1 text-[11px] font-medium outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`Select row ${index + 1}`}
          >
            Row {index + 1}
          </button>
          {selected && (
            <>
              <IconAction label="Move row up" disabled={index === 0} onClick={() => api.dispatch({ type: "moveSectionBy", sectionId: section.id, delta: -1 })}>
                <ArrowUp />
              </IconAction>
              <IconAction label="Move row down" disabled={index === total - 1} onClick={() => api.dispatch({ type: "moveSectionBy", sectionId: section.id, delta: 1 })}>
                <ArrowDown />
              </IconAction>
              <IconAction label="Duplicate row" onClick={() => api.duplicateSection(section.id)}>
                <Copy />
              </IconAction>
              <IconAction label="Delete row" destructive onClick={() => api.deleteSection(section.id)}>
                <Trash2 />
              </IconAction>
            </>
          )}
        </div>

        <div className={cn("flex", stacked ? "flex-col" : "flex-row")}>
          {section.columns.map((column, i) => (
            <ColumnView
              key={column.id}
              column={column}
              index={i}
              count={section.columns.length}
              stacked={stacked}
              settings={settings}
            />
          ))}
        </div>
      </div>
      {dropAfter && <DropLine position="bottom" />}
    </div>
  );
});

// ── Columns ──────────────────────────────────────────────────────────────────

const verticalJustify = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

const ColumnView = memo(function ColumnView({
  column,
  index,
  count,
  stacked,
  settings,
}: {
  column: Column;
  index: number;
  count: number;
  stacked: boolean;
  settings: DocumentSettings;
}) {
  const api = useEditorApi();
  const selected = useIsSelected("column", column.id);
  const { setNodeRef } = useDroppable({ id: dndId.column(column.id), data: { accepts: "column", columnId: column.id } satisfies DropData });
  const dropIndex = useStore(api.dropTarget, (t) => (t?.kind === "block" && t.columnId === column.id ? t.index : -1));
  const n = column.blocks.length;

  return (
    <div
      ref={setNodeRef}
      data-column-id={column.id}
      aria-label={count > 1 ? `Column ${index + 1} of ${count}` : undefined}
      className={cn(
        "relative flex min-w-0 flex-col",
        selected && "outline-2 -outline-offset-2 outline-sky-500",
        !selected && count > 1 && "hover:outline-1 hover:-outline-offset-1 hover:outline-sky-300 hover:outline-dashed",
      )}
      style={{
        width: stacked ? "100%" : `${column.widthPercent}%`,
        backgroundColor: column.backgroundColor ?? undefined,
        padding: pad(column.padding),
        justifyContent: verticalJustify[column.verticalAlign],
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-block-wrapper]")) return;
        e.stopPropagation();
        api.select({ kind: "column", id: column.id });
      }}
    >
      <div data-column-blocks={column.id} className="flex flex-col">
        {column.blocks.map((block, i) => (
          <BlockView
            key={block.id}
            block={block}
            settings={settings}
            dropBefore={dropIndex === i}
            isFirst={i === 0}
          />
        ))}
      </div>
      {n === 0 && <EmptyColumn columnId={column.id} showDrop={dropIndex === 0} />}
      {n > 0 && dropIndex === n && (
        <div className="relative h-0">
          <DropLine position="bottom" />
        </div>
      )}
    </div>
  );
});

function EmptyColumn({ columnId, showDrop }: { columnId: string; showDrop: boolean }) {
  return (
    <div
      className={cn(
        "m-2 flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-3 text-center text-xs transition-colors",
        showDrop ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-300 text-zinc-500",
      )}
    >
      <span>Drop a block here</span>
      <AddBlockMenu at={{ columnId, index: 0 }} />
    </div>
  );
}

function AddBlockMenu({ at }: { at: { columnId: string; index: number } }) {
  const api = useEditorApi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="xs" variant="outline" onClick={(e) => e.stopPropagation()} />}>
        <Plus /> Add block
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Add a block</DropdownMenuLabel>
        {BLOCK_ORDER.map((type) => {
          const Icon = BLOCK_META[type].icon;
          return (
            <DropdownMenuItem key={type} onClick={() => api.insertBlock(type, at)}>
              <Icon /> {BLOCK_META[type].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddRowMenu({ label, index }: { label: string; index?: number }) {
  const api = useEditorApi();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="sm" variant="outline" className="bg-white" />}>
        <Rows3 /> {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Choose a layout</DropdownMenuLabel>
        {SECTION_LAYOUTS.map((l) => {
          const Icon = layoutIcon(l.widths.length);
          return (
            <DropdownMenuItem key={l.id} onClick={() => api.insertRow(l.widths, index)}>
              <Icon /> {l.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyCanvas({ showDrop }: { showDrop: boolean }) {
  return (
    <div
      className={cn(
        "m-4 flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center text-sm",
        showDrop ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-300 text-zinc-500",
      )}
    >
      <p className="font-medium text-zinc-700">This email is empty</p>
      <p>Drag a row or a block here, or start with a row.</p>
      <AddRowMenu label="Add a row" index={0} />
    </div>
  );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

/** All block frames on the canvas, in reading order (for arrow-key navigation). */
function allBlockFrames(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-sections] [data-block-wrapper]"));
}

const BlockView = memo(function BlockView({
  block,
  settings,
  dropBefore,
  isFirst,
}: {
  block: Block;
  settings: DocumentSettings;
  dropBefore: boolean;
  isFirst: boolean;
}) {
  const api = useEditorApi();
  const selected = useIsSelected("block", block.id);
  const meta = BLOCK_META[block.type];
  const rich = RICH_TEXT_TYPES.has(block.type);
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dndId.block(block.id),
    data: { kind: "block", blockId: block.id, blockType: block.type } satisfies DragData,
  });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // keys typed inside the text editor etc.
    const frames = allBlockFrames();
    const i = frames.indexOf(e.currentTarget);
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!selected) {
        if (rich && e.key === "Enter") api.pendingCaret.set({ blockId: block.id, x: NaN, y: NaN });
        api.select({ kind: "block", id: block.id });
      } else if (rich) {
        api.activeTextEditor.get()?.commands.focus("end");
      }
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.altKey) {
      e.preventDefault();
      api.dispatch({ type: "moveBlockBy", blockId: block.id, delta: e.key === "ArrowUp" ? -1 : 1 });
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)?.focus());
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      frames[i + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const neighbour = frames[i + 1] ?? frames[i - 1];
      api.deleteBlock(block.id);
      requestAnimationFrame(() => neighbour?.focus());
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      api.duplicateBlock(block.id);
    } else if (e.key === "Escape") {
      api.select(null);
    }
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      // Only reachable with Tab while the block is selected (fewer tab stops).
      tabIndex={selected ? 0 : -1}
      aria-label={`Drag ${meta.label} block`}
      onClick={(e) => e.stopPropagation()}
      // Grabbing the handle isn't "click to type here" (see the frame's onPointerDown).
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex size-6 cursor-grab touch-none items-center justify-center rounded text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      data-block-wrapper
      data-block-id={block.id}
      tabIndex={0}
      role="group"
      aria-roledescription="block"
      aria-label={`${meta.label}${selected ? ", selected" : ""}. Press Enter to edit, Delete to remove.`}
      className={cn(
        "group/block relative outline-none",
        selected ? "z-10 ring-2 ring-emerald-500 ring-inset" : "hover:ring-1 hover:ring-emerald-400 hover:ring-inset",
        "focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset",
        isDragging && "opacity-40",
      )}
      onClick={(e) => {
        e.stopPropagation();
        if (!selected) api.select({ kind: "block", id: block.id });
      }}
      onPointerDown={(e) => {
        // Remember the click spot so the text cursor appears right there.
        if (!selected && rich) api.pendingCaret.set({ blockId: block.id, x: e.clientX, y: e.clientY });
      }}
      onKeyDown={onKeyDown}
    >
      {dropBefore && <DropLine />}

      {selected ? (
        <div
          className={cn(
            "absolute right-0 z-30 flex items-center gap-0.5 rounded-md bg-emerald-600 px-1 py-0.5 text-white shadow-md",
            isFirst ? "top-0.5" : "top-0 -translate-y-1/2",
          )}
          role="toolbar"
          aria-label={`${meta.label} block actions`}
        >
          {handle}
          <span className="px-1 text-[11px] font-medium">{meta.label}</span>
          <IconAction label="Move up (Alt+↑)" onClick={() => api.dispatch({ type: "moveBlockBy", blockId: block.id, delta: -1 })}>
            <ArrowUp />
          </IconAction>
          <IconAction label="Move down (Alt+↓)" onClick={() => api.dispatch({ type: "moveBlockBy", blockId: block.id, delta: 1 })}>
            <ArrowDown />
          </IconAction>
          <IconAction label="Duplicate (Ctrl+D)" onClick={() => api.duplicateBlock(block.id)}>
            <Copy />
          </IconAction>
          <IconAction label="Delete (Delete key)" destructive onClick={() => api.deleteBlock(block.id)}>
            <Trash2 />
          </IconAction>
        </div>
      ) : (
        <div className="absolute top-0.5 left-0.5 z-20 rounded bg-emerald-600 opacity-0 shadow-sm transition-opacity group-hover/block:opacity-100">
          {handle}
        </div>
      )}

      <div style={{ padding: pad(block.padding) }}>
        <BlockContent block={block} settings={settings} editing={selected} />
      </div>
    </div>
  );
});
