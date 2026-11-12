"use client";

// The drag-and-drop email editor.
//
//   <EmailEditor
//     initialDocument={template.document}
//     theme={brandTheme}
//     mergeTags={[...BUILTIN_MERGE_TAGS, ...customFieldTags]}
//     subject={template.subject}
//     preheader={template.preheader}
//     onSave={saveTemplate}            // validated document + subject + preheader
//     onSendTest={() => setOpen(true)} // optional
//     headerSlot={<BackLink />}        // optional, left of the top bar
//   />
//
// The props are only read when the editor first mounts. To load a different
// template, give the editor a new `key` (e.g. key={template.id}).
//
// How it fits together:
//   - The document lives in a pure undo/redo reducer (lib/templates/editor-state.ts).
//   - Everything inside talks to it through one stable "editor API" object
//     (editor-store.tsx), so components don't need the whole document as props.
//   - Drag & drop: dnd.tsx.  Canvas: canvas.tsx.  Panels: left-panel / properties-panel.
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from "react";
import {
  CircleCheck,
  CloudAlert,
  Loader2,
  Monitor,
  PanelRight,
  Plus,
  Redo2,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaPicker } from "@/components/media/media-picker";
import {
  createBlock,
  createSection,
  documentWarnings,
  MAX_SECTIONS,
  newId,
  type BlockType,
  type BrandTheme,
  type EmailDocument,
  type MergeTag,
} from "@/lib/templates/document";
import {
  columnHasRoom,
  createHistory,
  findBlock,
  findColumn,
  findSection,
  historyReducer,
  type EditorAction,
  type HistoryAction,
  type HistoryState,
} from "@/lib/templates/editor-state";
import { validateDocument, type DocumentProblem } from "@/lib/templates/editor-validate";
import { BLOCK_META } from "./block-meta";
import { Canvas, type CanvasDevice } from "./canvas";
import { MergeTagTextField, Segmented } from "./controls";
import { EditorDnd } from "./dnd";
import {
  createStore,
  EditorApiContext,
  useEditorApi,
  useStore,
  type DropTarget,
  type EditorApi,
  type EditorSelection,
  type PendingCaret,
  type PickedImage,
} from "./editor-store";
import { LeftPanel, type LeftTab } from "./left-panel";
import { CodePane, PreviewPane } from "./preview-pane";
import { PropertiesPanel } from "./properties-panel";
import { TextToolbar } from "./rich-text";

export type EmailEditorProps = {
  initialDocument: EmailDocument;
  /** Brand kit, used for new blocks. */
  theme: BrandTheme;
  /** Built-in + workspace custom fields. */
  mergeTags: MergeTag[];
  /** Editable in the editor's top bar. */
  subject: string;
  preheader: string;
  onSave: (input: { document: EmailDocument; subject: string; preheader: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** The page shows its own "send a test" dialog. */
  onSendTest?: () => void;
  /** Template name / back link, shown at the left of the top bar. */
  headerSlot?: ReactNode;
};

/** Wait this long after the last change before saving automatically. */
const AUTOSAVE_MS = 3000;

const noopSubscribe = () => () => {};

/** True only in the browser, after hydration (the editor needs browser APIs). */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function EmailEditor(props: EmailEditorProps): JSX.Element {
  const isClient = useIsClient();
  if (!isClient) return <EditorSkeleton />;
  return <EditorInner {...props} />;
}

function EditorSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full flex-col md:h-dvh" aria-busy="true" aria-label="Loading the editor">
      <div className="h-14 border-b bg-white" />
      <div className="flex flex-1 items-center justify-center bg-zinc-100 text-sm text-zinc-500">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Loading the editor…
      </div>
    </div>
  );
}

type SaveState = "idle" | "saving" | "error" | "invalid";
type Snapshot = { doc: EmailDocument; subject: string; preheader: string };

function EditorInner({ initialDocument, theme, mergeTags, subject: initialSubject, preheader: initialPreheader, onSave, onSendTest, headerSlot }: EmailEditorProps) {
  // ── Document + undo history ────────────────────────────────────────────────
  // Kept in a ref too, so actions can read the latest document right away
  // (e.g. "insert a block, then select it" in one go).
  const [history, setHistory] = useState<HistoryState>(() => createHistory(initialDocument));
  const historyRef = useRef(history);
  const doc = history.present;

  const applyHistory = useCallback((action: HistoryAction) => {
    const current = historyRef.current;
    const next = historyReducer(current, action);
    if (next !== current) {
      historyRef.current = next;
      setHistory(next);
    }
    return next;
  }, []);

  const [subject, setSubject] = useState(initialSubject);
  const [preheader, setPreheader] = useState(initialPreheader);

  // ── Stores (see editor-store.tsx for why these aren't React state) ──────────
  const [stores] = useState(() => ({
    selection: createStore<EditorSelection>(null),
    dropTarget: createStore<DropTarget>(null),
    activeTextEditor: createStore<Editor | null>(null),
    linkRequest: createStore(0),
    pendingCaret: createStore<PendingCaret>(null),
  }));

  // ── Media picker (one for the whole editor) ────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickCallback = useRef<((asset: PickedImage) => void) | null>(null);

  // ── The editor API ─────────────────────────────────────────────────────────
  const api = useMemo<EditorApi>(() => {
    const getDocument = () => historyRef.current.present;
    const dispatch = (action: EditorAction, coalesceKey?: string) =>
      applyHistory({ type: "apply", action, coalesceKey, at: Date.now() });
    const undo = () => applyHistory({ type: "undo" });
    const redo = () => applyHistory({ type: "redo" });

    const scrollToBlock = (id: string) =>
      requestAnimationFrame(() =>
        document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
    const select: EditorApi["select"] = (selection, opts) => {
      stores.selection.set(selection);
      if (selection && opts?.focus) {
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(selection.id)}"]`)?.focus());
      }
    };

    /** Offers "Undo" on a toast, but only if nothing else happened since. */
    const undoToast = (message: string, after: EmailDocument) =>
      toast(message, {
        action: {
          label: "Undo",
          onClick: () => {
            if (historyRef.current.present === after) undo();
            else toast.info("Other changes were made since. Use Undo (Ctrl+Z) to step back.");
          },
        },
      });

    /** Index for a new row: after the selected row, else above the footer row, else at the end. */
    const defaultRowIndex = (d: EmailDocument): number => {
      const sel = stores.selection.get();
      if (sel) {
        const sectionIndex =
          sel.kind === "section" ? findSection(d, sel.id)?.sectionIndex : sel.kind === "column" ? findColumn(d, sel.id)?.sectionIndex : findBlock(d, sel.id)?.sectionIndex;
        if (sectionIndex !== undefined) return sectionIndex + 1;
      }
      const last = d.sections[d.sections.length - 1];
      const lastHasFooter = last?.columns.some((c) => c.blocks.some((b) => b.type === "footer"));
      return lastHasFooter ? d.sections.length - 1 : d.sections.length;
    };

    const insertRow: EditorApi["insertRow"] = (widths, index) => {
      const d = getDocument();
      if (d.sections.length >= MAX_SECTIONS) {
        toast.error(`An email can have up to ${MAX_SECTIONS} rows.`);
        return;
      }
      const section = createSection(widths);
      dispatch({ type: "addSection", index: index ?? defaultRowIndex(d), section });
      select({ kind: "section", id: section.id });
      requestAnimationFrame(() => document.querySelector(`[data-section-id="${section.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    };

    const insertBlock: EditorApi["insertBlock"] = (type: BlockType, at) => {
      const d = getDocument();
      const block = createBlock(type, theme);
      let target = at ?? null;
      if (!target) {
        // Next to whatever is selected.
        const sel = stores.selection.get();
        if (sel?.kind === "block") {
          const loc = findBlock(d, sel.id);
          if (loc) target = { columnId: loc.column.id, index: loc.blockIndex + 1 };
        } else if (sel?.kind === "column") {
          const loc = findColumn(d, sel.id);
          if (loc) target = { columnId: loc.column.id, index: loc.column.blocks.length };
        } else if (sel?.kind === "section") {
          const loc = findSection(d, sel.id);
          const column = loc?.section.columns[0];
          if (column) target = { columnId: column.id, index: column.blocks.length };
        }
      }
      if (!target) {
        // Nothing selected: the block gets its own new row (above the footer).
        if (d.sections.length >= MAX_SECTIONS) {
          toast.error(`An email can have up to ${MAX_SECTIONS} rows.`);
          return;
        }
        dispatch({ type: "addSection", index: defaultRowIndex(d), section: createSection([100], [[block]]) });
      } else {
        if (!columnHasRoom(d, target.columnId)) {
          toast.error("This column is full. Add a new row instead.");
          return;
        }
        dispatch({ type: "addBlock", columnId: target.columnId, index: target.index, block });
      }
      select({ kind: "block", id: block.id });
      scrollToBlock(block.id);
    };

    return {
      dispatch,
      getDocument,
      undo,
      redo,
      select,
      insertBlock,
      insertRow,
      deleteBlock(blockId) {
        const loc = findBlock(getDocument(), blockId);
        if (!loc) return;
        const after = dispatch({ type: "deleteBlock", blockId }).present;
        if (stores.selection.get()?.id === blockId) select(null);
        undoToast(`${BLOCK_META[loc.block.type].label} block deleted`, after);
      },
      duplicateBlock(blockId) {
        const loc = findBlock(getDocument(), blockId);
        if (!loc) return;
        if (!columnHasRoom(getDocument(), loc.column.id)) {
          toast.error("This column is full. Add a new row instead.");
          return;
        }
        const copyId = newId("b");
        dispatch({ type: "duplicateBlock", blockId, newId: copyId });
        select({ kind: "block", id: copyId });
        scrollToBlock(copyId);
      },
      deleteSection(sectionId) {
        if (!findSection(getDocument(), sectionId)) return;
        const after = dispatch({ type: "deleteSection", sectionId }).present;
        select(null);
        undoToast("Row deleted", after);
      },
      duplicateSection(sectionId) {
        if (getDocument().sections.length >= MAX_SECTIONS) {
          toast.error(`An email can have up to ${MAX_SECTIONS} rows.`);
          return;
        }
        const copyId = newId("s");
        dispatch({ type: "duplicateSection", sectionId, newId: copyId });
        select({ kind: "section", id: copyId });
      },
      pickImage(onPick) {
        pickCallback.current = onPick;
        setPickerOpen(true);
      },
      theme,
      mergeTags,
      ...stores,
    };
  }, [applyHistory, stores, theme, mergeTags]);

  // If undo/redo removed the selected item, clear the selection.
  useEffect(() => {
    const sel = stores.selection.get();
    if (!sel) return;
    const exists =
      sel.kind === "block" ? findBlock(doc, sel.id) : sel.kind === "column" ? findColumn(doc, sel.id) : findSection(doc, sel.id);
    if (!exists) stores.selection.set(null);
  }, [doc, stores]);

  // ── Saving ─────────────────────────────────────────────────────────────────
  const [saved, setSaved] = useState<Snapshot>({ doc: initialDocument, subject: initialSubject, preheader: initialPreheader });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problems, setProblems] = useState<DocumentProblem[]>([]);
  const dirty = doc !== saved.doc || subject !== saved.subject || preheader !== saved.preheader;

  const latest = useRef({ subject, preheader, onSave, saving: false, lastError: "" });
  useEffect(() => {
    latest.current.subject = subject;
    latest.current.preheader = preheader;
    latest.current.onSave = onSave;
  });

  const save = useCallback(async (manual: boolean) => {
    const l = latest.current;
    if (l.saving) return; // the autosave timer runs again after this save finishes
    const snapshot: Snapshot = { doc: historyRef.current.present, subject: l.subject, preheader: l.preheader };

    // Check the document first, so we never send something broken.
    const found = validateDocument(snapshot.doc);
    setProblems(found);
    if (found.length) {
      setSaveState("invalid");
      if (manual) toast.error("Fix this before saving", { description: found[0].message });
      return;
    }

    l.saving = true;
    setSaveState("saving");
    try {
      const result = await l.onSave({ document: snapshot.doc, subject: snapshot.subject, preheader: snapshot.preheader });
      if (result.ok) {
        setSaved(snapshot);
        setSaveState("idle");
        setSaveError(null);
        l.lastError = "";
        if (manual) toast.success("Saved");
      } else {
        setSaveState("error");
        setSaveError(result.error);
        // Autosave: tell the user once per distinct error, not every 3 seconds.
        if (manual || l.lastError !== result.error) toast.error("Couldn't save", { description: result.error });
        l.lastError = result.error;
      }
    } catch {
      const message = "Couldn't reach the server. Check your connection; we'll try again on your next change.";
      setSaveState("error");
      setSaveError(message);
      if (manual || l.lastError !== message) toast.error("Couldn't save", { description: message });
      l.lastError = message;
    } finally {
      l.saving = false;
    }
  }, []);

  // Autosave a few seconds after the last change.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save(false), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, doc, subject, preheader, saved, save]);

  // Leaving the editor inside the app (e.g. the Back link) doesn't fire
  // "beforeunload", so save one last time if something is still unsaved.
  const unsaved = useRef<Snapshot | null>(null);
  useEffect(() => {
    unsaved.current = dirty ? { doc, subject, preheader } : null;
  });
  useEffect(
    () => () => {
      const last = unsaved.current;
      if (!last || latest.current.saving || validateDocument(last.doc).length) return;
      void latest.current.onSave({ document: last.doc, subject: last.subject, preheader: last.preheader }).catch(() => {});
    },
    [],
  );

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void save(true);
        return;
      }
      // Inside text boxes and the text editor, Ctrl+Z undoes typing there.
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        api.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        api.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [api, save]);

  // ── Checks (warnings + schema problems), computed lazily while typing ───────
  const deferredDoc = useDeferredValue(doc);
  const warnings = useMemo(() => documentWarnings(deferredDoc), [deferredDoc]);
  const liveProblems = useMemo(() => validateDocument(deferredDoc), [deferredDoc]);

  // ── Layout state ───────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"design" | "preview" | "code">("design");
  const [leftTab, setLeftTab] = useState<LeftTab>("blocks");
  const [device, setDevice] = useState<CanvasDevice>("desktop");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isPhone = useMediaQuery("(max-width: 767px)");

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return (
    <EditorApiContext value={api}>
      <EditorDnd api={api}>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex h-[calc(100dvh-3.5rem)] min-h-0 w-full flex-col gap-0 overflow-hidden bg-white md:h-dvh"
        >
          {/* ── Top bar ── */}
          <header className="flex shrink-0 flex-col border-b">
            <div className="flex min-h-14 flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1 sm:flex-none">{headerSlot}</div>
              <TabsList className="order-last w-full sm:order-none sm:w-auto">
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
              </TabsList>
              <div className="hidden flex-1 sm:block" />
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={api.undo}>
                  <Undo2 />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={api.redo}>
                  <Redo2 />
                </Button>
                <ChecksPopover warnings={warnings} problems={liveProblems} />
              </div>
              <SaveStatus dirty={dirty} state={saveState} error={saveError} problems={problems} />
              {onSendTest && (
                <Button type="button" variant="outline" size="sm" onClick={onSendTest} aria-label="Send a test email">
                  <Send /> <span className="hidden md:inline">Send test</span>
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => void save(true)} disabled={saveState === "saving"} title="Save (Ctrl+S)">
                <Save /> Save
              </Button>
            </div>

            {/* Subject + preheader: always shown on bigger screens, behind a toggle on phones */}
            <button
              type="button"
              className="flex items-center justify-between border-t px-3 py-2 text-left text-xs text-zinc-600 md:hidden"
              aria-expanded={detailsOpen}
              aria-controls="klyve-email-details"
              onClick={() => setDetailsOpen((o) => !o)}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium text-zinc-800">Subject:</span> {subject || "(none yet)"}
              </span>
              <span className="shrink-0 pl-2 text-emerald-700">{detailsOpen ? "Hide" : "Edit"}</span>
            </button>
            <div id="klyve-email-details" className={cn("grid gap-3 border-t px-3 py-2 md:grid-cols-2", !detailsOpen && "max-md:hidden")}>
              <MergeTagTextField
                label="Subject"
                value={subject}
                onChange={setSubject}
                mergeTags={mergeTags}
                maxLength={500}
                placeholder="What's this email about?"
                hint={subject.trim() === "" ? "Add a subject before sending." : undefined}
              />
              <MergeTagTextField
                label="Preheader (preview text)"
                value={preheader}
                onChange={setPreheader}
                mergeTags={mergeTags}
                maxLength={500}
                placeholder="Short summary shown next to the subject in the inbox"
              />
            </div>
          </header>

          {/* ── Design ── */}
          <TabsContent value="design" className="flex min-h-0 flex-1">
            {isDesktop && (
              <aside aria-label="Blocks and settings" className="flex w-72 shrink-0 flex-col border-r bg-white">
                <LeftPanel tab={leftTab} onTabChange={setLeftTab} settings={doc.settings} />
              </aside>
            )}

            <section aria-label="Email designer" className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-11 shrink-0 items-center gap-2 border-b bg-white px-2 py-1">
                {!isDesktop && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setLeftOpen(true)} aria-expanded={leftOpen}>
                    <Plus /> Add
                  </Button>
                )}
                <div className="min-w-0 flex-1 overflow-x-auto">
                  <CanvasHint />
                </div>
                <div className="hidden w-40 shrink-0 sm:block">
                  <Segmented
                    label="Canvas width"
                    size="sm"
                    value={device}
                    onChange={setDevice}
                    options={[
                      { value: "desktop", label: "Desktop width", icon: <Monitor className="size-3.5" /> },
                      { value: "mobile", label: "Phone width", icon: <Smartphone className="size-3.5" /> },
                    ]}
                  />
                </div>
                {!isDesktop && <PropertiesButton onOpen={() => setRightOpen(true)} open={rightOpen} />}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <Canvas doc={doc} device={device} />
              </div>
            </section>

            {isDesktop && (
              <aside aria-label="Properties" className="flex w-80 shrink-0 flex-col border-l bg-white">
                <PropertiesPanel doc={doc} />
              </aside>
            )}

            {!isDesktop && (
              <>
                <Drawer side="left" label="Add blocks and rows" open={leftOpen} onClose={() => setLeftOpen(false)} modal={isPhone}>
                  <LeftPanel
                    tab={leftTab}
                    onTabChange={setLeftTab}
                    settings={doc.settings}
                    onAdded={() => isPhone && setLeftOpen(false)}
                  />
                </Drawer>
                <Drawer side="right" label="Properties" open={rightOpen} onClose={() => setRightOpen(false)} modal={isPhone} hideHeader>
                  <PropertiesPanel doc={doc} onClose={() => setRightOpen(false)} />
                </Drawer>
              </>
            )}
          </TabsContent>

          <TabsContent value="preview" className="min-h-0 flex-1">
            {tab === "preview" && <PreviewPane doc={doc} subject={subject} preheader={preheader} />}
          </TabsContent>
          <TabsContent value="code" className="min-h-0 flex-1">
            {tab === "code" && <CodePane doc={doc} subject={subject} preheader={preheader} />}
          </TabsContent>
        </Tabs>
      </EditorDnd>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(asset) => {
          pickCallback.current?.({ id: asset.id, url: asset.url, width: asset.width, height: asset.height, alt: asset.alt });
          pickCallback.current = null;
        }}
      />
    </EditorApiContext>
  );
}

// ── Small pieces of the top bar / canvas bar ─────────────────────────────────

/** The text toolbar while editing text, otherwise a short hint. */
function CanvasHint() {
  const api = useEditorApi();
  const editing = useStore(api.activeTextEditor, (e) => e !== null);
  if (editing) return <TextToolbar />;
  return <p className="truncate px-1 text-xs text-zinc-500">Click a block to edit it. Drag blocks and rows from the panel.</p>;
}

function PropertiesButton({ onOpen, open }: { onOpen: () => void; open: boolean }) {
  const api = useEditorApi();
  const selection = useStore(api.selection, (s) => s);
  const doc = api.getDocument();
  let label = "Settings";
  if (selection?.kind === "block") {
    const loc = findBlock(doc, selection.id);
    if (loc) label = `Edit ${BLOCK_META[loc.block.type].label.toLowerCase()}`;
  } else if (selection?.kind === "column") label = "Edit column";
  else if (selection?.kind === "section") label = "Edit row";
  return (
    <Button
      type="button"
      size="sm"
      variant={selection ? "default" : "outline"}
      onClick={onOpen}
      aria-expanded={open}
      aria-label={`${label} (opens the properties panel)`}
    >
      <PanelRight /> <span className="max-w-24 truncate">{label}</span>
    </Button>
  );
}

function SaveStatus({ dirty, state, error, problems }: { dirty: boolean; state: SaveState; error: string | null; problems: DocumentProblem[] }) {
  let icon = <CircleCheck className="size-3.5 text-emerald-600" />;
  let text = "Saved";
  let title = "All changes are saved.";
  if (state === "saving") {
    icon = <Loader2 className="size-3.5 animate-spin" />;
    text = "Saving…";
    title = "Saving your changes.";
  } else if (dirty && state === "invalid") {
    icon = <TriangleAlert className="size-3.5 text-amber-600" />;
    text = problems.length === 1 ? "1 problem" : `${problems.length} problems`;
    title = problems.map((p) => p.message).join("\n") || "Fix the problems shown in Checks.";
  } else if (dirty && state === "error") {
    icon = <CloudAlert className="size-3.5 text-red-600" />;
    text = "Not saved";
    title = error ?? "Couldn't save.";
  } else if (dirty) {
    icon = <span className="size-2 rounded-full bg-amber-500" />;
    text = "Unsaved changes";
    title = "Changes save automatically in a few seconds, or press Ctrl+S.";
  }
  return (
    <span role="status" aria-live="polite" title={title} className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-zinc-600">
      {icon}
      <span className={cn(text === "Unsaved changes" && "max-sm:sr-only")}>{text}</span>
    </span>
  );
}

function ChecksPopover({ warnings, problems }: { warnings: string[]; problems: DocumentProblem[] }) {
  const api = useEditorApi();
  const count = warnings.length + problems.length;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={count ? `Checks: ${count} to look at` : "Checks: all good"}
            className={cn(problems.length ? "text-red-700" : warnings.length ? "text-amber-700" : "text-emerald-700")}
          />
        }
      >
        {count ? <TriangleAlert /> : <ShieldCheck />}
        <span className="hidden lg:inline">Checks</span>
        {count > 0 && <span className="rounded-full bg-current/10 px-1.5 text-[11px] font-semibold">{count}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        {count === 0 && (
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <ShieldCheck className="size-4" aria-hidden /> Everything looks good.
          </p>
        )}
        {problems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-red-800">Fix before saving</p>
            <ul className="flex flex-col gap-1">
              {problems.map((p) => (
                <li key={p.message}>
                  <button
                    type="button"
                    className="w-full rounded px-1.5 py-1 text-left text-xs text-red-800 hover:bg-red-50 disabled:hover:bg-transparent"
                    disabled={!p.target}
                    onClick={() => p.target && api.select(p.target, { focus: p.target.kind === "block" })}
                  >
                    {p.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-amber-800">Before you send</p>
            <ul className="flex flex-col gap-1.5">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-xs text-amber-900">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Side panel that slides in on tablets and phones. On tablets it doesn't
 * block the canvas (so you can drag from it); on phones it does.
 */
function Drawer({
  side,
  label,
  open,
  onClose,
  modal,
  hideHeader,
  children,
}: {
  side: "left" | "right";
  label: string;
  open: boolean;
  onClose: () => void;
  modal: boolean;
  hideHeader?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Move focus into the panel when it opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    requestAnimationFrame(() => panel?.querySelector<HTMLElement>("button, [tabindex='0'], input")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    panel?.addEventListener("keydown", onKey);
    return () => {
      panel?.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  return (
    <>
      {open && modal && <div aria-hidden className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />}
      <div
        ref={ref}
        role="dialog"
        aria-modal={modal && open ? true : undefined}
        aria-label={label}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(340px,92vw)] flex-col bg-white shadow-2xl transition-[translate,visibility] duration-200",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          open ? "visible translate-x-0" : side === "left" ? "invisible -translate-x-full" : "invisible translate-x-full",
        )}
      >
        {!hideHeader && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b px-3">
            <h2 className="text-sm font-medium">{label}</h2>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
              <X />
            </Button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </>
  );
}
