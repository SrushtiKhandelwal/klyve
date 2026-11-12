"use client";

// Drag & drop for the editor (dnd-kit).
//
// What can be dragged:
//   - a block tile from the palette   → into any column, at any position
//   - a row layout tile               → between rows
//   - an existing block (its handle)  → within or across columns
//   - an existing row (its handle)    → up or down
//
// How "where will it land?" is worked out:
//   - collision detection only finds WHICH column (or the canvas, for rows)
//     the pointer is over;
//   - the exact slot is then measured from the real DOM (how many blocks /
//     rows sit above the pointer), and shown as a line on the canvas.
//
// Keyboard: focus a tile or handle, press Space to pick it up, arrow keys
// step through every possible slot (the canvas scrolls along), Space drops,
// Escape cancels. A live region reads out where it would land.
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { Rows3 } from "lucide-react";
import type { BlockType, EmailDocument } from "@/lib/templates/document";
import { findBlock, findSection } from "@/lib/templates/editor-state";
import { BLOCK_META } from "./block-meta";
import type { DropTarget, EditorApi } from "./editor-store";

// ── Data attached to draggables and droppables ───────────────────────────────

export type DragData =
  | { kind: "new-block"; blockType: BlockType }
  | { kind: "block"; blockId: string; blockType: BlockType }
  | { kind: "new-row"; widths: number[]; label: string }
  | { kind: "row"; sectionId: string };

export type DropData = { accepts: "column"; columnId: string } | { accepts: "canvas" };

export const dndId = {
  paletteBlock: (t: BlockType) => `palette:block:${t}`,
  paletteRow: (id: string) => `palette:row:${id}`,
  block: (id: string) => `block:${id}`,
  row: (id: string) => `row:${id}`,
  column: (id: string) => `col:${id}`,
  canvas: "canvas",
};

const isRowDrag = (d: DragData | undefined) => d?.kind === "new-row" || d?.kind === "row";

function dragLabel(d: DragData | undefined): string {
  if (!d) return "item";
  if (d.kind === "new-block") return `new ${BLOCK_META[d.blockType].label} block`;
  if (d.kind === "block") return `${BLOCK_META[d.blockType].label} block`;
  if (d.kind === "new-row") return `new ${d.label} row`;
  return "row";
}

// ── Measuring slots in the DOM ───────────────────────────────────────────────

const q = (sel: string) => document.querySelector<HTMLElement>(sel);

function blockWrappers(columnId: string): HTMLElement[] {
  const list = q(`[data-column-blocks="${CSS.escape(columnId)}"]`);
  return list ? Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-block-wrapper]")) : [];
}

function sectionWrappers(): HTMLElement[] {
  const list = q("[data-canvas-sections]");
  return list ? Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-section-wrapper]")) : [];
}

/** Number of elements whose middle is above y = the slot index at y. */
function slotAt(elements: HTMLElement[], y: number): number {
  let index = 0;
  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (y > r.top + r.height / 2) index++;
  }
  return index;
}

/** Dropping here wouldn't change anything (right where the item already is). */
function isNoop(doc: EmailDocument, data: DragData, target: NonNullable<DropTarget>): boolean {
  if (data.kind === "block" && target.kind === "block") {
    const loc = findBlock(doc, data.blockId);
    return !!loc && loc.column.id === target.columnId && (target.index === loc.blockIndex || target.index === loc.blockIndex + 1);
  }
  if (data.kind === "row" && target.kind === "section") {
    const loc = findSection(doc, data.sectionId);
    return !!loc && (target.index === loc.sectionIndex || target.index === loc.sectionIndex + 1);
  }
  return false;
}

/** Every slot, in reading order (for keyboard dragging). */
function allSlots(doc: EmailDocument, rows: boolean): NonNullable<DropTarget>[] {
  if (rows) return Array.from({ length: doc.sections.length + 1 }, (_, index) => ({ kind: "section" as const, index }));
  return doc.sections.flatMap((s) =>
    s.columns.flatMap((c) =>
      Array.from({ length: c.blocks.length + 1 }, (_, index) => ({ kind: "block" as const, columnId: c.id, index })),
    ),
  );
}

const sameSlot = (a: DropTarget, b: DropTarget) =>
  a === b ||
  (!!a && !!b && a.kind === b.kind && a.index === b.index && (a.kind !== "block" || (b.kind === "block" && a.columnId === b.columnId)));

/** Where a slot is on screen (scrolling it into view first). */
function slotPoint(target: NonNullable<DropTarget>): { x: number; y: number } | null {
  if (target.kind === "section") {
    const rows = sectionWrappers();
    const el = rows[Math.min(target.index, rows.length - 1)];
    const canvas = q("[data-canvas-sections]");
    if (!el) {
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + 8, y: r.top + 8 };
    }
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.left + 8, y: target.index < rows.length ? r.top : r.bottom };
  }
  const blocks = blockWrappers(target.columnId);
  const column = q(`[data-column-id="${CSS.escape(target.columnId)}"]`);
  const el = blocks[Math.min(target.index, blocks.length - 1)] ?? column;
  if (!el) return null;
  el.scrollIntoView({ block: "nearest" });
  const r = el.getBoundingClientRect();
  if (!blocks.length) return { x: r.left + 8, y: r.top + 8 };
  return { x: r.left + 8, y: target.index < blocks.length ? r.top : r.bottom };
}

function describeSlot(doc: EmailDocument, target: DropTarget): string {
  if (!target) return "Not over a drop spot.";
  if (target.kind === "section") return `Row position ${target.index + 1} of ${doc.sections.length + 1}.`;
  for (let s = 0; s < doc.sections.length; s++) {
    const c = doc.sections[s].columns.findIndex((col) => col.id === target.columnId);
    if (c === -1) continue;
    const n = doc.sections[s].columns[c].blocks.length;
    const cols = doc.sections[s].columns.length;
    return `Row ${s + 1}${cols > 1 ? `, column ${c + 1}` : ""}, position ${target.index + 1} of ${n + 1}.`;
  }
  return "";
}

// ── The provider ─────────────────────────────────────────────────────────────

export function EditorDnd({ api, children }: { api: EditorApi; children: ReactNode }) {
  const [active, setActive] = useState<DragData | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dataRef = useRef<DragData | null>(null);
  const keyboardRef = useRef(false);
  const kbIndexRef = useRef(-1);

  const setTarget = useCallback(
    (target: DropTarget) => {
      const data = dataRef.current;
      const next = target && data && isNoop(api.getDocument(), data, target) ? null : target;
      if (!sameSlot(api.dropTarget.get(), next)) api.dropTarget.set(next);
    },
    [api],
  );

  // Keyboard dragging: arrow keys jump from slot to slot.
  const coordinateGetter: KeyboardCoordinateGetter = useCallback(
    (event, { currentCoordinates }) => {
      const data = dataRef.current;
      if (!data) return undefined;
      const forward = event.code === "ArrowDown" || event.code === "ArrowRight";
      const backward = event.code === "ArrowUp" || event.code === "ArrowLeft";
      if (!forward && !backward) return undefined;
      event.preventDefault();
      const doc = api.getDocument();
      const slots = allSlots(doc, isRowDrag(data));
      let i = kbIndexRef.current;
      // Step, skipping spots where dropping wouldn't move anything.
      do {
        i += forward ? 1 : -1;
      } while (i >= 0 && i < slots.length && isNoop(doc, data, slots[i]));
      if (i < 0 || i >= slots.length) return currentCoordinates;
      kbIndexRef.current = i;
      setTarget(slots[i]);
      setAnnouncement(describeSlot(doc, slots[i]));
      const point = slotPoint(slots[i]);
      return point ? { x: point.x, y: point.y - 12 } : currentCoordinates;
    },
    [api, setTarget],
  );

  const sensors = useSensors(
    // A small move before a drag starts, so clicks still select things.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On touch screens: press and hold, so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Space picks up and drops. Enter is left free (it "clicks" a tile to add it).
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  // Rows can only land on the canvas, blocks only in columns.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const data = args.active.data.current as DragData | undefined;
    const accepts = isRowDrag(data) ? "canvas" : "column";
    const containers = args.droppableContainers.filter((c) => (c.data.current as DropData | undefined)?.accepts === accepts);
    const within = pointerWithin({ ...args, droppableContainers: containers });
    if (within.length) return within;
    // Pointer between columns (row padding, gaps): use the nearest column,
    // but only while the pointer is over the canvas itself.
    const canvasRect = args.droppableRects.get(dndId.canvas);
    const p = args.pointerCoordinates;
    if (accepts === "column" && canvasRect && p && p.x >= canvasRect.left && p.x <= canvasRect.right && p.y >= canvasRect.top && p.y <= canvasRect.bottom) {
      return closestCenter({ ...args, droppableContainers: containers });
    }
    return [];
  }, []);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as DragData;
      dataRef.current = data;
      setActive(data);
      keyboardRef.current = event.activatorEvent instanceof KeyboardEvent;
      kbIndexRef.current = -1;
      if (!keyboardRef.current) return;

      // Keyboard: start at a sensible slot so a quick Space-Space works.
      const doc = api.getDocument();
      const slots = allSlots(doc, isRowDrag(data));
      let start = -1;
      if (data.kind === "block") {
        const loc = findBlock(doc, data.blockId);
        start = loc ? slots.findIndex((s) => s.kind === "block" && s.columnId === loc.column.id && s.index === loc.blockIndex) : -1;
        kbIndexRef.current = start; // a no-op slot: first arrow moves away from it
        setAnnouncement("Use the arrow keys to choose where it goes, then Space to drop.");
        return;
      }
      if (data.kind === "row") {
        const loc = findSection(doc, data.sectionId);
        kbIndexRef.current = loc ? loc.sectionIndex : -1;
        setAnnouncement("Use the arrow keys to choose where it goes, then Space to drop.");
        return;
      }
      const sel = api.selection.get();
      if (data.kind === "new-block" && sel?.kind === "block") {
        const loc = findBlock(doc, sel.id);
        if (loc) start = slots.findIndex((s) => s.kind === "block" && s.columnId === loc.column.id && s.index === loc.blockIndex + 1);
      }
      if (start === -1 && data.kind === "new-block") {
        // Otherwise: the end of the last column that isn't the footer.
        const columns = doc.sections.flatMap((s) => s.columns);
        const column = [...columns].reverse().find((c) => !c.blocks.some((b) => b.type === "footer"));
        if (column) start = slots.findIndex((s) => s.kind === "block" && s.columnId === column.id && s.index === column.blocks.length);
      }
      // Rows: just above the last row (usually the footer).
      if (start === -1) start = Math.max(0, slots.length - (data.kind === "new-row" ? 2 : 1));
      kbIndexRef.current = start;
      if (slots[start]) {
        setTarget(slots[start]);
        slotPoint(slots[start]);
        setAnnouncement(`${describeSlot(doc, slots[start])} Use the arrow keys to move, Space to drop.`);
      }
    },
    [api, setTarget],
  );

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (keyboardRef.current) return; // keyboard targets are set by the coordinate getter
      const start = getEventCoordinates(event.activatorEvent);
      const over = event.over?.data.current as DropData | undefined;
      if (!start || !over) return setTarget(null);
      const y = start.y + event.delta.y;
      if (over.accepts === "column") {
        setTarget({ kind: "block", columnId: over.columnId, index: slotAt(blockWrappers(over.columnId), y) });
      } else {
        setTarget({ kind: "section", index: slotAt(sectionWrappers(), y) });
      }
    },
    [setTarget],
  );

  const finish = useCallback(() => {
    dataRef.current = null;
    setActive(null);
    api.dropTarget.set(null);
  }, [api]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const data = event.active.data.current as DragData;
      const target = api.dropTarget.get();
      finish();
      if (!target) return;
      if (data.kind === "new-block" && target.kind === "block") {
        api.insertBlock(data.blockType, { columnId: target.columnId, index: target.index });
      } else if (data.kind === "block" && target.kind === "block") {
        api.dispatch({ type: "moveBlock", blockId: data.blockId, toColumnId: target.columnId, toIndex: target.index });
        api.select({ kind: "block", id: data.blockId });
      } else if (data.kind === "new-row" && target.kind === "section") {
        api.insertRow(data.widths, target.index);
      } else if (data.kind === "row" && target.kind === "section") {
        api.dispatch({ type: "moveSection", sectionId: data.sectionId, toIndex: target.index });
      }
      // Keyboard users keep their place: focus the moved block / row handle.
      if (keyboardRef.current && (data.kind === "block" || data.kind === "row")) {
        const sel = data.kind === "block" ? `[data-block-id="${data.blockId}"]` : `[data-section-id="${data.sectionId}"] [data-row-handle]`;
        requestAnimationFrame(() => q(sel)?.focus());
      }
    },
    [api, finish],
  );

  const accessibility = useMemo(
    () => ({
      screenReaderInstructions: {
        draggable:
          "To move this, press Space. Then use the arrow keys to choose where it goes, Space to drop it, or Escape to cancel.",
      },
      announcements: {
        onDragStart: ({ active: a }: { active: { data: { current?: unknown } } }) =>
          `Picked up ${dragLabel(a.data.current as DragData)}.`,
        onDragOver: () => undefined,
        onDragEnd: ({ active: a }: { active: { data: { current?: unknown } } }) =>
          `Dropped ${dragLabel(a.data.current as DragData)}.`,
        onDragCancel: () => "Cancelled. Nothing was moved.",
      },
    }),
    [],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
      accessibility={accessibility}
    >
      {children}
      <DragOverlay dropAnimation={null}>{active ? <DragChip data={active} /> : null}</DragOverlay>
      <div aria-live="polite" className="sr-only">
        {active ? announcement : ""}
      </div>
    </DndContext>
  );
}

/** The little label that follows the pointer while dragging. */
function DragChip({ data }: { data: DragData }) {
  const Icon = data.kind === "new-block" || data.kind === "block" ? BLOCK_META[data.blockType].icon : Rows3;
  const text =
    data.kind === "new-block" || data.kind === "block"
      ? BLOCK_META[data.blockType].label
      : data.kind === "new-row"
        ? data.label
        : "Row";
  return (
    <div className="inline-flex cursor-grabbing items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-lg">
      <Icon className="size-4 text-emerald-600" />
      {text}
    </div>
  );
}
