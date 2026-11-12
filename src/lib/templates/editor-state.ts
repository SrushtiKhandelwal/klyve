// Editor state for the drag-and-drop email editor.
//
// Two layers, both PURE functions (same input → same output, no side effects):
//   1. documentReducer(doc, action): one edit to an EmailDocument
//      (add / move / update / delete / duplicate blocks, columns and sections).
//   2. historyReducer(state, action): wraps (1) with undo / redo.
//
// Every update is IMMUTABLE: we copy only the objects on the path to the change
// and reuse everything else. That keeps React fast: an unchanged section is the
// very same object as before, so its memoized component can skip re-rendering.
//
// Safe to import from server and client (no React, no browser APIs).
import {
  MAX_BLOCKS_PER_COLUMN,
  MAX_COLUMNS,
  MAX_SECTIONS,
  type Block,
  type Column,
  type DocumentSettings,
  type EmailDocument,
  type Section,
} from "@/lib/templates/document";

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Fields of a block that can be edited (everything except its id and type).
 * Written so it works per block type: a patch for a Button may contain `label`.
 */
export type BlockPatch<T extends Block = Block> = T extends unknown ? Partial<Omit<T, "id" | "type">> : never;
export type SectionPatch = Partial<Omit<Section, "id" | "columns">>;
export type ColumnPatch = Partial<Omit<Column, "id" | "blocks" | "widthPercent">>;

/**
 * Index rule used by every "move/insert at" action: `index` is a SLOT in the
 * list as you see it right now (0 = before the first item, length = at the end).
 * That's exactly what a drop indicator shows, so the UI never needs to adjust.
 */
export type EditorAction =
  | { type: "addBlock"; columnId: string; index: number; block: Block }
  | { type: "moveBlock"; blockId: string; toColumnId: string; toIndex: number }
  | { type: "moveBlockBy"; blockId: string; delta: -1 | 1 }
  | { type: "updateBlock"; blockId: string; patch: BlockPatch }
  | { type: "deleteBlock"; blockId: string }
  /** `newId` is created by the caller so this reducer stays pure. */
  | { type: "duplicateBlock"; blockId: string; newId: string }
  | { type: "addSection"; index: number; section: Section }
  | { type: "moveSection"; sectionId: string; toIndex: number }
  | { type: "moveSectionBy"; sectionId: string; delta: -1 | 1 }
  | { type: "updateSection"; sectionId: string; patch: SectionPatch }
  | { type: "deleteSection"; sectionId: string }
  | { type: "duplicateSection"; sectionId: string; newId: string }
  /** Change the column layout of a row. Blocks are kept (extra columns merge into the last one). */
  | {
      type: "setSectionLayout";
      sectionId: string;
      widths: number[];
      /** Ids for any NEW columns (one per width is simplest), made by the caller. */
      newIds: string[];
    }
  | { type: "updateColumn"; columnId: string; patch: ColumnPatch }
  | { type: "deleteColumn"; columnId: string }
  | { type: "duplicateColumn"; columnId: string; newId: string }
  | { type: "updateSettings"; patch: Partial<DocumentSettings> }
  | { type: "replaceDocument"; document: EmailDocument };

// ── Finding things ───────────────────────────────────────────────────────────

export type BlockLocation = {
  block: Block;
  section: Section;
  column: Column;
  sectionIndex: number;
  columnIndex: number;
  blockIndex: number;
};

export function findBlock(doc: EmailDocument, blockId: string): BlockLocation | null {
  for (let s = 0; s < doc.sections.length; s++) {
    const section = doc.sections[s];
    for (let c = 0; c < section.columns.length; c++) {
      const column = section.columns[c];
      const b = column.blocks.findIndex((x) => x.id === blockId);
      if (b !== -1) {
        return { block: column.blocks[b], section, column, sectionIndex: s, columnIndex: c, blockIndex: b };
      }
    }
  }
  return null;
}

export type ColumnLocation = { column: Column; section: Section; sectionIndex: number; columnIndex: number };

export function findColumn(doc: EmailDocument, columnId: string): ColumnLocation | null {
  for (let s = 0; s < doc.sections.length; s++) {
    const section = doc.sections[s];
    const c = section.columns.findIndex((x) => x.id === columnId);
    if (c !== -1) return { column: section.columns[c], section, sectionIndex: s, columnIndex: c };
  }
  return null;
}

export function findSection(doc: EmailDocument, sectionId: string): { section: Section; sectionIndex: number } | null {
  const i = doc.sections.findIndex((s) => s.id === sectionId);
  return i === -1 ? null : { section: doc.sections[i], sectionIndex: i };
}

/** True when another block can be added to this column. */
export function columnHasRoom(doc: EmailDocument, columnId: string): boolean {
  const loc = findColumn(doc, columnId);
  return !!loc && loc.column.blocks.length < MAX_BLOCKS_PER_COLUMN;
}

// ── Widths ───────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** n equal widths that add up to exactly 100 (e.g. 3 → 33.34, 33.33, 33.33). */
export function equalWidths(n: number): number[] {
  const base = Math.floor((100 / n) * 100) / 100;
  const widths = Array.from({ length: n }, () => base);
  widths[0] = round2(100 - base * (n - 1));
  return widths;
}

/** Scales widths so they add up to 100 again (after a column was removed). */
function normalizeWidths(widths: number[]): number[] {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= 0) return equalWidths(widths.length);
  const scaled = widths.map((w) => round2((w / total) * 100));
  const rest = scaled.slice(1).reduce((a, b) => a + b, 0);
  scaled[0] = round2(100 - rest);
  return scaled;
}

/** A layout is usable if it has 1–4 columns, each ≥ 10%, adding up to 100. */
export function isValidLayout(widths: number[]): boolean {
  return (
    widths.length >= 1 &&
    widths.length <= MAX_COLUMNS &&
    widths.every((w) => Number.isFinite(w) && w >= 10 && w <= 100) &&
    Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.5
  );
}

// ── Small immutable helpers ──────────────────────────────────────────────────

function clampIndex(i: number, length: number): number {
  if (!Number.isFinite(i)) return length;
  return Math.max(0, Math.min(Math.trunc(i), length));
}

function insertAt<T>(list: T[], index: number, item: T): T[] {
  const i = clampIndex(index, list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/** Returns a new document with one section replaced. */
function withSection(doc: EmailDocument, sectionIndex: number, section: Section): EmailDocument {
  const sections = doc.sections.slice();
  sections[sectionIndex] = section;
  return { ...doc, sections };
}

/** Returns a new document with one column replaced. */
function withColumn(doc: EmailDocument, sectionIndex: number, columnIndex: number, column: Column): EmailDocument {
  const section = doc.sections[sectionIndex];
  const columns = section.columns.slice();
  columns[columnIndex] = column;
  return withSection(doc, sectionIndex, { ...section, columns });
}

/** Copy of a section where the section, its columns and its blocks all get new ids. */
export function cloneSectionWithIds(section: Section, newId: string): Section {
  return {
    ...section,
    id: newId,
    columns: section.columns.map((c, ci) => cloneColumnWithIds(c, `${newId}c${ci}`)),
  };
}

function cloneColumnWithIds(column: Column, newId: string): Column {
  return { ...column, id: newId, blocks: column.blocks.map((b, bi) => ({ ...b, id: `${newId}b${bi}` })) };
}

// ── The document reducer ─────────────────────────────────────────────────────

/**
 * Applies one edit. If the edit is impossible (unknown id, a limit reached,
 * an invalid layout) it returns the SAME document object, so callers can
 * check `next === doc` to know nothing happened.
 */
export function documentReducer(doc: EmailDocument, action: EditorAction): EmailDocument {
  switch (action.type) {
    case "addBlock": {
      const loc = findColumn(doc, action.columnId);
      if (!loc || loc.column.blocks.length >= MAX_BLOCKS_PER_COLUMN) return doc;
      const column = { ...loc.column, blocks: insertAt(loc.column.blocks, action.index, action.block) };
      return withColumn(doc, loc.sectionIndex, loc.columnIndex, column);
    }

    case "moveBlock": {
      const from = findBlock(doc, action.blockId);
      const to = findColumn(doc, action.toColumnId);
      if (!from || !to) return doc;
      const sameColumn = from.column.id === to.column.id;
      if (!sameColumn && to.column.blocks.length >= MAX_BLOCKS_PER_COLUMN) return doc;

      let toIndex = clampIndex(action.toIndex, to.column.blocks.length);
      // Slot rule: removing the block first shifts later slots up by one.
      if (sameColumn && toIndex > from.blockIndex) toIndex -= 1;
      if (sameColumn && toIndex === from.blockIndex) return doc;

      // 1. take it out
      const fromBlocks = from.column.blocks.filter((b) => b.id !== action.blockId);
      let next = withColumn(doc, from.sectionIndex, from.columnIndex, { ...from.column, blocks: fromBlocks });
      // 2. put it in (re-read the target column: it may be the one we just changed)
      const target = next.sections[to.sectionIndex].columns[to.columnIndex];
      next = withColumn(next, to.sectionIndex, to.columnIndex, {
        ...target,
        blocks: insertAt(target.blocks, toIndex, from.block),
      });
      return next;
    }

    case "moveBlockBy": {
      const from = findBlock(doc, action.blockId);
      if (!from) return doc;
      const { column, blockIndex, sectionIndex, columnIndex } = from;
      // Inside the column: a simple swap with the neighbour.
      if (action.delta === -1 && blockIndex > 0) {
        return documentReducer(doc, { type: "moveBlock", blockId: action.blockId, toColumnId: column.id, toIndex: blockIndex - 1 });
      }
      if (action.delta === 1 && blockIndex < column.blocks.length - 1) {
        return documentReducer(doc, { type: "moveBlock", blockId: action.blockId, toColumnId: column.id, toIndex: blockIndex + 2 });
      }
      // At the edge: hop into the matching column of the previous / next row,
      // so "move up" keeps working past the top of a row.
      const neighbour = doc.sections[sectionIndex + action.delta];
      if (!neighbour) return doc;
      const targetColumn = neighbour.columns[Math.min(columnIndex, neighbour.columns.length - 1)];
      return documentReducer(doc, {
        type: "moveBlock",
        blockId: action.blockId,
        toColumnId: targetColumn.id,
        toIndex: action.delta === -1 ? targetColumn.blocks.length : 0,
      });
    }

    case "updateBlock": {
      const loc = findBlock(doc, action.blockId);
      if (!loc) return doc;
      // id and type can never change through a patch.
      const block = { ...loc.block, ...action.patch, id: loc.block.id, type: loc.block.type } as Block;
      const blocks = loc.column.blocks.slice();
      blocks[loc.blockIndex] = block;
      return withColumn(doc, loc.sectionIndex, loc.columnIndex, { ...loc.column, blocks });
    }

    case "deleteBlock": {
      const loc = findBlock(doc, action.blockId);
      if (!loc) return doc;
      const blocks = loc.column.blocks.filter((b) => b.id !== action.blockId);
      return withColumn(doc, loc.sectionIndex, loc.columnIndex, { ...loc.column, blocks });
    }

    case "duplicateBlock": {
      const loc = findBlock(doc, action.blockId);
      if (!loc || loc.column.blocks.length >= MAX_BLOCKS_PER_COLUMN) return doc;
      const copy = { ...loc.block, id: action.newId } as Block;
      const blocks = insertAt(loc.column.blocks, loc.blockIndex + 1, copy);
      return withColumn(doc, loc.sectionIndex, loc.columnIndex, { ...loc.column, blocks });
    }

    case "addSection": {
      if (doc.sections.length >= MAX_SECTIONS) return doc;
      return { ...doc, sections: insertAt(doc.sections, action.index, action.section) };
    }

    case "moveSection": {
      const loc = findSection(doc, action.sectionId);
      if (!loc) return doc;
      let toIndex = clampIndex(action.toIndex, doc.sections.length);
      if (toIndex > loc.sectionIndex) toIndex -= 1;
      if (toIndex === loc.sectionIndex) return doc;
      const rest = doc.sections.filter((s) => s.id !== action.sectionId);
      return { ...doc, sections: insertAt(rest, toIndex, loc.section) };
    }

    case "moveSectionBy": {
      const loc = findSection(doc, action.sectionId);
      if (!loc) return doc;
      const toIndex = action.delta === -1 ? loc.sectionIndex - 1 : loc.sectionIndex + 2;
      if (toIndex < 0 || toIndex > doc.sections.length) return doc;
      return documentReducer(doc, { type: "moveSection", sectionId: action.sectionId, toIndex });
    }

    case "updateSection": {
      const loc = findSection(doc, action.sectionId);
      if (!loc) return doc;
      const { section } = loc;
      return withSection(doc, loc.sectionIndex, { ...section, ...action.patch, id: section.id, columns: section.columns });
    }

    case "deleteSection": {
      if (!findSection(doc, action.sectionId)) return doc;
      return { ...doc, sections: doc.sections.filter((s) => s.id !== action.sectionId) };
    }

    case "duplicateSection": {
      const loc = findSection(doc, action.sectionId);
      if (!loc || doc.sections.length >= MAX_SECTIONS) return doc;
      const copy = cloneSectionWithIds(loc.section, action.newId);
      return { ...doc, sections: insertAt(doc.sections, loc.sectionIndex + 1, copy) };
    }

    case "setSectionLayout": {
      const loc = findSection(doc, action.sectionId);
      if (!loc || !isValidLayout(action.widths)) return doc;
      const old = loc.section.columns;
      const n = action.widths.length;
      const columns: Column[] = action.widths.map((widthPercent, i) => {
        if (i < old.length) return { ...old[i], widthPercent };
        // New, empty column: copy the look of the last existing one.
        const last = old[old.length - 1];
        return { ...last, id: action.newIds[i] ?? `${loc.section.id.slice(0, 30)}n${i}`, widthPercent, blocks: [] };
      });
      // Fewer columns than before: move the leftover blocks into the last column.
      if (old.length > n) {
        const leftovers = old.slice(n).flatMap((c) => c.blocks);
        const last = columns[n - 1];
        if (last.blocks.length + leftovers.length > MAX_BLOCKS_PER_COLUMN) return doc;
        columns[n - 1] = { ...last, blocks: [...last.blocks, ...leftovers] };
      }
      // New columns need ids that are unique in the document.
      const usedIds = new Set(doc.sections.flatMap((s) => s.columns.map((c) => c.id)));
      for (let i = old.length; i < n; i++) {
        let id = columns[i].id;
        while (usedIds.has(id)) id += "x";
        usedIds.add(id);
        columns[i] = { ...columns[i], id };
      }
      return withSection(doc, loc.sectionIndex, { ...loc.section, columns });
    }

    case "updateColumn": {
      const loc = findColumn(doc, action.columnId);
      if (!loc) return doc;
      const { column } = loc;
      return withColumn(doc, loc.sectionIndex, loc.columnIndex, {
        ...column,
        ...action.patch,
        id: column.id,
        blocks: column.blocks,
        widthPercent: column.widthPercent,
      });
    }

    case "deleteColumn": {
      const loc = findColumn(doc, action.columnId);
      // A row always keeps at least one column (delete the row instead).
      if (!loc || loc.section.columns.length <= 1) return doc;
      const kept = loc.section.columns.filter((c) => c.id !== action.columnId);
      const widths = normalizeWidths(kept.map((c) => c.widthPercent));
      const columns = kept.map((c, i) => ({ ...c, widthPercent: widths[i] }));
      return withSection(doc, loc.sectionIndex, { ...loc.section, columns });
    }

    case "duplicateColumn": {
      const loc = findColumn(doc, action.columnId);
      if (!loc || loc.section.columns.length >= MAX_COLUMNS) return doc;
      const copy = cloneColumnWithIds(loc.column, action.newId);
      const all = insertAt(loc.section.columns, loc.columnIndex + 1, copy);
      const widths = equalWidths(all.length);
      const columns = all.map((c, i) => ({ ...c, widthPercent: widths[i] }));
      return withSection(doc, loc.sectionIndex, { ...loc.section, columns });
    }

    case "updateSettings":
      return { ...doc, settings: { ...doc.settings, ...action.patch } };

    case "replaceDocument":
      return action.document;
  }
}

// ── Undo / redo ──────────────────────────────────────────────────────────────

/** How many steps you can undo. Older steps are forgotten. */
export const HISTORY_LIMIT = 100;
/** Edits with the same coalesce key this close together become ONE undo step. */
export const COALESCE_MS = 1000;

export type HistoryState = {
  past: EmailDocument[];
  present: EmailDocument;
  future: EmailDocument[];
  /** Used to merge rapid edits (typing, dragging a slider) into one undo step. */
  lastKey: string | null;
  lastAt: number;
};

export type HistoryAction =
  | {
      type: "apply";
      action: EditorAction;
      /** e.g. "block:b_123:html". Same key + quick succession = one undo step. */
      coalesceKey?: string;
      /** Time of the edit (ms). Passed in so the reducer stays pure. */
      at?: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  /** Start fresh with a document and an empty history. */
  | { type: "reset"; document: EmailDocument };

export function createHistory(document: EmailDocument): HistoryState {
  return { past: [], present: document, future: [], lastKey: null, lastAt: 0 };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "apply": {
      const next = documentReducer(state.present, action.action);
      if (next === state.present) return state; // nothing changed: no undo step
      const at = action.at ?? 0;
      const key = action.coalesceKey ?? null;
      const merge = key !== null && key === state.lastKey && at - state.lastAt < COALESCE_MS;
      if (merge) {
        // Replace the present without adding a step; the step before still undoes all of it.
        return { ...state, present: next, future: [], lastAt: at };
      }
      const past = [...state.past, state.present];
      if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
      return { past, present: next, future: [], lastKey: key, lastAt: at };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...future] = state.future;
      return { past: [...state.past, state.present], present: next, future, lastKey: null, lastAt: 0 };
    }
    case "reset":
      return createHistory(action.document);
  }
}
