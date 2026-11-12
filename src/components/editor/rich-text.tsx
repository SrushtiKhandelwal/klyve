"use client";

// Rich text editing (TipTap) for heading, text and footer blocks, plus the
// formatting toolbar.
//
// Only ONE TipTap editor exists at a time: the selected block's. Other text
// blocks are shown as plain (cleaned) HTML, which is much lighter.
//
// The editor's schema only knows the tags our documents allow, so anything
// else (pasted tables, fonts, images...) is dropped by TipTap itself, and the
// output is cleaned once more with cleanRichHtml before it reaches the document.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorContent, Extension, Node, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import {
  Bold,
  Braces,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Palette,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cleanRichHtml, isAllowedLink, type RichTextMode } from "@/lib/templates/editor-html";
import { linkError, MergeTagMenu } from "./controls";
import { useEditorApi, useStore } from "./editor-store";

/** Headings: the whole document is one line of inline content (no <p>). */
const InlineDocument = Node.create({ name: "doc", topNode: true, content: "inline*" });

function buildExtensions(mode: RichTextMode, handlers: { onLinkShortcut: () => void; onEscape: () => void }) {
  const lists = mode === "full";
  return [
    StarterKit.configure({
      ...(mode === "inline" ? { document: false as const, paragraph: false as const } : {}),
      // Not part of our HTML subset:
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      bulletList: lists ? {} : false,
      orderedList: lists ? {} : false,
      listItem: lists ? {} : false,
      listKeymap: lists ? {} : false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: true,
        defaultProtocol: "https",
        // Same rule as the document schema, so {{ unsubscribe_url }} is fine
        // and javascript: links can never get in (even by pasting).
        isAllowedUri: (url) => isAllowedLink(url),
        HTMLAttributes: { target: null, rel: null, class: null },
      },
      undoRedo: { depth: 100 },
    }),
    ...(mode === "inline" ? [InlineDocument] : []),
    TextStyle,
    Color,
    Extension.create({
      name: "klyveShortcuts",
      addKeyboardShortcuts() {
        return {
          "Mod-k": () => {
            handlers.onLinkShortcut();
            return true;
          },
          Escape: () => {
            handlers.onEscape();
            return true;
          },
        };
      },
    }),
  ];
}

/**
 * Classes that make rich text on the canvas look like the real email
 * (same spacing as render.ts: 1em under paragraphs and lists except the last,
 * 24px list indent, 4px between list items).
 */
export const RICH_TEXT_CLASSES =
  "break-words [&_p]:m-0 [&>*]:mb-[1em] [&>*:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_li_p]:m-0 [&_a]:text-(--email-link) [&_a]:underline";

/** Read-only rich text (all blocks that aren't being edited). */
export function RichTextStatic({ html, mode, className, style }: { html: string; mode: RichTextMode; className?: string; style?: CSSProperties }) {
  // Stored HTML is cleaned before showing it, so a document can't run script here.
  const clean = useMemo(() => cleanRichHtml(html, mode), [html, mode]);
  const empty = clean === "" || clean === "<p></p>";
  return empty ? (
    <div className={cn(RICH_TEXT_CLASSES, "text-zinc-400 italic", className)} style={style}>
      Empty — click to write
    </div>
  ) : (
    <div className={cn(RICH_TEXT_CLASSES, className)} style={style} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}

/** The live editor for the selected block. */
export function RichTextEditor({
  blockId,
  html,
  mode,
  label,
  onChange,
  className,
  style,
}: {
  blockId: string;
  html: string;
  mode: RichTextMode;
  label: string;
  onChange: (html: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const api = useEditorApi();
  const lastEmitted = useRef(html);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: buildExtensions(mode, {
        onLinkShortcut: () => api.linkRequest.set(api.linkRequest.get() + 1),
        onEscape: () => {
          // Leave the text, keep the block selected, focus its frame.
          document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)?.focus();
        },
      }),
      content: html,
      editorProps: {
        attributes: {
          class: cn("outline-none", RICH_TEXT_CLASSES),
          role: "textbox",
          "aria-label": label,
          "aria-multiline": mode === "inline" ? "false" : "true",
        },
        transformPastedHTML: (pasted) => cleanRichHtml(pasted, mode),
      },
      onUpdate: ({ editor: e }) => {
        const clean = cleanRichHtml(e.getHTML(), mode);
        if (clean === lastEmitted.current) return;
        lastEmitted.current = clean;
        onChangeRef.current(clean);
      },
    },
    [mode],
  );

  // Undo/redo (or another panel) changed the HTML: show it without echoing back.
  useEffect(() => {
    if (!editor || html === lastEmitted.current) return;
    lastEmitted.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, html]);

  // Tell the toolbar which editor is active, and place the cursor where the
  // user clicked (the static text was replaced by this editor in between).
  useEffect(() => {
    if (!editor) return;
    api.activeTextEditor.set(editor);
    const caret = api.pendingCaret.get();
    if (caret && caret.blockId === blockId) {
      api.pendingCaret.set(null);
      requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const pos = Number.isFinite(caret.x) ? editor.view.posAtCoords({ left: caret.x, top: caret.y }) : null;
        editor.commands.focus(pos ? pos.pos : "end");
      });
    }
    return () => {
      if (api.activeTextEditor.get() === editor) api.activeTextEditor.set(null);
    };
  }, [editor, api, blockId]);

  if (!editor) return <RichTextStatic html={html} mode={mode} className={className} style={style} />;
  return <EditorContent editor={editor} className={cn("cursor-text", className)} style={style} />;
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function ToolButton({
  label,
  active,
  onRun,
  children,
  disabled,
}: {
  label: string;
  active?: boolean;
  onRun: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: don't move focus away from the editor on mouse down.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
      className={cn(active && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
    >
      {children}
    </Button>
  );
}

/** Formatting toolbar for the active text block. Renders nothing when no text is being edited. */
export function TextToolbar() {
  const api = useEditorApi();
  const editor = useStore(api.activeTextEditor, (e) => e);
  if (!editor) return null;
  return <TextToolbarInner key={editor.instanceId} editor={editor} />;
}

function TextToolbarInner({ editor }: { editor: Editor }) {
  const api = useEditorApi();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: (e.getAttributes("link").href as string | undefined) ?? null,
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      hasLists: !!e.schema.nodes.bulletList,
    }),
  });
  const run = (fn: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => fn(editor.chain().focus()).run();

  return (
    <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Bold (Ctrl+B)" active={state.bold} onRun={() => run((c) => c.toggleBold())}>
        <Bold />
      </ToolButton>
      <ToolButton label="Italic (Ctrl+I)" active={state.italic} onRun={() => run((c) => c.toggleItalic())}>
        <Italic />
      </ToolButton>
      <ToolButton label="Underline (Ctrl+U)" active={state.underline} onRun={() => run((c) => c.toggleUnderline())}>
        <Underline />
      </ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onRun={() => run((c) => c.toggleStrike())}>
        <Strikethrough />
      </ToolButton>
      <LinkButton editor={editor} currentHref={state.link} />
      {state.link && (
        <ToolButton label="Remove link" onRun={() => run((c) => c.extendMarkRange("link").unsetLink())}>
          <Link2Off />
        </ToolButton>
      )}
      {state.hasLists && (
        <>
          <ToolButton label="Bulleted list" active={state.bulletList} onRun={() => run((c) => c.toggleBulletList())}>
            <List />
          </ToolButton>
          <ToolButton label="Numbered list" active={state.orderedList} onRun={() => run((c) => c.toggleOrderedList())}>
            <ListOrdered />
          </ToolButton>
        </>
      )}
      <ColorButton editor={editor} current={state.color} />
      <ToolButton label="Clear formatting" onRun={() => run((c) => c.unsetAllMarks())}>
        <RemoveFormatting />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-zinc-200" aria-hidden />
      <MergeTagMenu
        mergeTags={api.mergeTags}
        onInsert={(tag) => editor.chain().focus().insertContent({ type: "text", text: tag }).run()}
      >
        <span className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-700 hover:bg-muted">
          <Braces className="size-3.5" /> Personalize
        </span>
      </MergeTagMenu>
    </div>
  );
}

function LinkButton({ editor, currentHref }: { editor: Editor; currentHref: string | null }) {
  const api = useEditorApi();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K inside the text opens this box.
  const request = useStore(api.linkRequest, (n) => n);
  const seen = useRef(request);
  useEffect(() => {
    if (request === seen.current) return;
    seen.current = request;
    setValue(editor.getAttributes("link").href ?? "https://");
    setTried(false);
    setOpen(true);
  }, [request, editor]);

  const error = value.trim() === "" ? "Add a link address." : linkError(value);

  const apply = () => {
    setTried(true);
    if (error) return;
    const href = value.trim();
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      // No text selected: insert the address itself as the link text.
      editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(currentHref ?? "https://");
          setTried(false);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add or edit link (Ctrl+K)"
            title="Link (Ctrl+K)"
            aria-pressed={!!currentHref}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(currentHref && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}
          />
        }
      >
        <Link2 />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80" initialFocus={inputRef}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <div className="flex items-center justify-between">
            <label htmlFor="klyve-link-input" className="text-xs font-medium">
              Link address
            </label>
            <MergeTagMenu
              mergeTags={api.mergeTags}
              label="Insert a personalized link"
              finalFocus={inputRef}
              onInsert={(tag) => setValue((v) => (v.trim() === "" || v.trim() === "https://" ? tag : v + tag))}
            />
          </div>
          <Input
            id="klyve-link-input"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://example.com"
            spellCheck={false}
            aria-invalid={tried && error ? true : undefined}
            aria-describedby={tried && error ? "klyve-link-err" : undefined}
          />
          {tried && error && (
            <p id="klyve-link-err" role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {currentHref && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Remove link
              </Button>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ColorButton({ editor, current }: { editor: Editor; current: string | null }) {
  const api = useEditorApi();
  const settings = api.getDocument().settings;
  const swatches = [
    ...new Set(
      [
        api.theme.primaryColor,
        api.theme.secondaryColor,
        settings.textColor,
        settings.headingColor,
        settings.linkColor,
        "#000000",
        "#52525b",
        "#a1a1aa",
        "#ffffff",
        "#dc2626",
        "#ea580c",
        "#2563eb",
        "#16a34a",
      ].map((c) => c.toLowerCase()),
    ),
  ];
  const [open, setOpen] = useState(false);
  const setColor = (c: string) => editor.chain().focus().setColor(c).run();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Text colour"
            title="Text colour"
            onMouseDown={(e) => e.preventDefault()}
          />
        }
      >
        <span className="relative">
          <Palette />
          <span
            aria-hidden
            className="absolute -bottom-1 left-0 h-0.5 w-full rounded"
            style={{ background: current ?? "transparent" }}
          />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <p className="text-xs font-medium">Text colour</p>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Colour swatches">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use ${c}`}
              title={c}
              onClick={() => {
                setColor(c);
                setOpen(false);
              }}
              className={cn(
                "size-6 rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                current?.toLowerCase() === c && "ring-2 ring-emerald-600 ring-offset-1",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="color"
            value={current && /^#[0-9a-f]{6}$/i.test(current) ? current : "#000000"}
            onChange={(e) => setColor(e.target.value)}
            className="size-7 cursor-pointer rounded border p-0.5"
          />
          Custom colour
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            editor.chain().focus().unsetColor().run();
            setOpen(false);
          }}
        >
          Use the block&apos;s colour
        </Button>
      </PopoverContent>
    </Popover>
  );
}
