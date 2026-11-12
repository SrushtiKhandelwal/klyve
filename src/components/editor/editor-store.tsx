"use client";

// Shared editor state that many components read, kept OUTSIDE React state on
// purpose: a tiny "store" that components subscribe to with a selector.
//
// Why: if the selection lived in a normal React context, clicking a block
// would re-render every block on the canvas. With a store + selector, only
// the blocks whose answer changed ("am I selected?") re-render.
import { createContext, use, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";
import type { Block, BlockType, BrandTheme, EmailDocument, MergeTag } from "@/lib/templates/document";
import type { EditorAction } from "@/lib/templates/editor-state";

// ── A minimal store ──────────────────────────────────────────────────────────

export type Store<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Reads part of a store. The selector must return something simple (a
 * boolean, string, number or an object that is reused), otherwise React
 * would think it changed on every read.
 */
export function useStore<T, S>(store: Store<T>, selector: (value: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

// ── What the stores hold ─────────────────────────────────────────────────────

export type SelectionKind = "block" | "column" | "section";
export type EditorSelection = { kind: SelectionKind; id: string } | null;

/** Where a dragged item would land right now (drawn as a line on the canvas). */
export type DropTarget =
  | { kind: "block"; columnId: string; index: number }
  | { kind: "section"; index: number }
  | null;

/** Where the user last clicked inside a text block, so the cursor lands there. */
export type PendingCaret = { blockId: string; x: number; y: number } | null;

// ── The editor API every component can use ───────────────────────────────────

export type EditorApi = {
  /** Apply an edit. Same `coalesceKey` in quick succession = one undo step. */
  dispatch: (action: EditorAction, coalesceKey?: string) => void;
  /** The current document (always fresh; doesn't cause re-renders). */
  getDocument: () => EmailDocument;
  undo: () => void;
  redo: () => void;
  select: (selection: EditorSelection, opts?: { focus?: boolean }) => void;

  /** Add a new block, next to the selection (or where it makes sense). */
  insertBlock: (type: BlockType, at?: { columnId: string; index: number }) => void;
  /** Add a new row with these column widths. */
  insertRow: (widths: number[], index?: number) => void;
  deleteBlock: (blockId: string) => void;
  duplicateBlock: (blockId: string) => void;
  deleteSection: (sectionId: string) => void;
  duplicateSection: (sectionId: string) => void;
  /** Opens the media library; calls back with the chosen image. */
  pickImage: (onPick: (asset: PickedImage) => void) => void;

  theme: BrandTheme;
  mergeTags: MergeTag[];

  selection: Store<EditorSelection>;
  dropTarget: Store<DropTarget>;
  /** The rich-text editor that is open right now (only one at a time). */
  activeTextEditor: Store<Editor | null>;
  /** Bumped by Ctrl+K inside a text block to open the link box. */
  linkRequest: Store<number>;
  /** Set when a click (or Enter) should put the text cursor into a block that is about to open. */
  pendingCaret: Store<PendingCaret>;
};

export type PickedImage = { id: string | null; url: string; width: number | null; height: number | null; alt?: string };

export const EditorApiContext = createContext<EditorApi | null>(null);

export function useEditorApi(): EditorApi {
  const api = use(EditorApiContext);
  if (!api) throw new Error("useEditorApi must be used inside <EmailEditor>.");
  return api;
}

/** True when this item is the selected one. Re-renders only when that flips. */
export function useIsSelected(kind: SelectionKind, id: string): boolean {
  const { selection } = useEditorApi();
  return useStore(selection, (s) => s?.kind === kind && s.id === id);
}

/** Helper type for block-specific property panels. */
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;
