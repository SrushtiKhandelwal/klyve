"use client";

// Left panel: Blocks (drag or click to add), Rows (layouts) and Settings
// (the whole email's look).
import { useDraggable } from "@dnd-kit/core";
import { Paintbrush } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  defaultSettings,
  FONT_STACKS,
  SECTION_LAYOUTS,
  type BlockType,
  type DocumentSettings,
} from "@/lib/templates/document";
import { BLOCK_META, BLOCK_ORDER } from "./block-meta";
import { ColorField, NumberField, PanelSection } from "./controls";
import { dndId, type DragData } from "./dnd";
import { useEditorApi } from "./editor-store";

export type LeftTab = "blocks" | "rows" | "settings";

export function LeftPanel({
  tab,
  onTabChange,
  settings,
  onAdded,
}: {
  tab: LeftTab;
  onTabChange: (t: LeftTab) => void;
  settings: DocumentSettings;
  /** Called after a click-to-add (phones close the drawer). */
  onAdded?: () => void;
}) {
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as LeftTab)} className="flex h-full min-h-0 flex-col gap-0">
      <div className="border-b px-3 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="blocks">Blocks</TabsTrigger>
          <TabsTrigger value="rows">Rows</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="blocks" className="min-h-0 overflow-y-auto p-3">
        <p className="mb-3 text-xs text-zinc-500">
          Drag a block onto the email, or click it to add it after the selected block.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BLOCK_ORDER.map((type) => (
            <BlockTile key={type} type={type} onAdded={onAdded} />
          ))}
        </div>
      </TabsContent>
      <TabsContent value="rows" className="min-h-0 overflow-y-auto p-3">
        <p className="mb-3 text-xs text-zinc-500">Rows hold blocks side by side. Drag one onto the email, or click to add it.</p>
        <div className="grid grid-cols-2 gap-2">
          {SECTION_LAYOUTS.map((l) => (
            <RowTile key={l.id} id={l.id} label={l.label} widths={l.widths} onAdded={onAdded} />
          ))}
        </div>
      </TabsContent>
      <TabsContent value="settings" className="min-h-0 overflow-y-auto">
        <DocumentSettingsPanel settings={settings} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Keyboard + click behaviour shared by palette tiles:
 * Space picks the tile up (drag with arrow keys), Enter or click adds it.
 */
function tileHandlers(listeners: ReturnType<typeof useDraggable>["listeners"], isDragging: boolean, add: () => void) {
  return {
    ...listeners,
    onClick: add,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      // While a keyboard drag is running, Enter means "drop here", not "add".
      if (isDragging) return;
      if (e.key === "Enter") {
        e.preventDefault();
        add();
        return;
      }
      listeners?.onKeyDown?.(e);
    },
  };
}

const tileClass =
  "flex cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg border bg-white px-2 py-3 text-center text-xs font-medium text-zinc-700 shadow-xs outline-none transition hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500 active:cursor-grabbing";

function BlockTile({ type, onAdded }: { type: BlockType; onAdded?: () => void }) {
  const api = useEditorApi();
  const meta = BLOCK_META[type];
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dndId.paletteBlock(type),
    data: { kind: "new-block", blockType: type } satisfies DragData,
  });
  const add = () => {
    api.insertBlock(type);
    onAdded?.();
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...tileHandlers(listeners, isDragging, add)}
      aria-label={`${meta.label}: ${meta.hint}. Press Enter to add, Space to drag.`}
      title={meta.hint}
      className={cn(tileClass, isDragging && "opacity-50")}
    >
      <meta.icon className="size-5 text-emerald-600" aria-hidden />
      {meta.label}
    </div>
  );
}

function RowTile({ id, label, widths, onAdded }: { id: string; label: string; widths: number[]; onAdded?: () => void }) {
  const api = useEditorApi();
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: dndId.paletteRow(id),
    data: { kind: "new-row", widths, label } satisfies DragData,
  });
  const add = () => {
    api.insertRow(widths);
    onAdded?.();
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...tileHandlers(listeners, isDragging, add)}
      aria-label={`${label} row. Press Enter to add, Space to drag.`}
      className={cn(tileClass, isDragging && "opacity-50")}
    >
      {/* A tiny picture of the layout */}
      <div className="flex h-7 w-full gap-1" aria-hidden>
        {widths.map((w, i) => (
          <div key={i} className="rounded-sm bg-emerald-100 ring-1 ring-emerald-300" style={{ width: `${w}%` }} />
        ))}
      </div>
      {label}
    </div>
  );
}

/** The whole email's look. Also shown on the right when nothing is selected. */
export function DocumentSettingsPanel({ settings }: { settings: DocumentSettings }) {
  const api = useEditorApi();
  const set = (patch: Partial<DocumentSettings>, key: string) => api.dispatch({ type: "updateSettings", patch }, `settings:${key}`);
  return (
    <div>
      <PanelSection title="Layout">
        <NumberField
          label="Email width"
          value={settings.contentWidth}
          min={480}
          max={800}
          step={10}
          onChange={(v) => set({ contentWidth: v }, "width")}
          hint="600px works everywhere. Wider emails may be cut off on some screens."
        />
      </PanelSection>
      <PanelSection title="Colours">
        <ColorField label="Background (around the email)" value={settings.backgroundColor} onChange={(v) => v && set({ backgroundColor: v }, "bg")} />
        <ColorField label="Content background" value={settings.contentBackgroundColor} onChange={(v) => v && set({ contentBackgroundColor: v }, "cbg")} />
        <ColorField label="Text" value={settings.textColor} onChange={(v) => v && set({ textColor: v }, "text")} />
        <ColorField label="Headings" value={settings.headingColor} onChange={(v) => v && set({ headingColor: v }, "heading")} />
        <ColorField label="Links" value={settings.linkColor} onChange={(v) => v && set({ linkColor: v }, "link")} />
      </PanelSection>
      <PanelSection title="Font">
        <Select value={settings.fontFamily} onValueChange={(v) => v && set({ fontFamily: v as string }, "font")}>
          <SelectTrigger className="w-full" aria-label="Font">
            <SelectValue>{FONT_STACKS.find((f) => f.value === settings.fontFamily)?.label ?? "Font"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {FONT_STACKS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                <span style={{ fontFamily: f.value }}>{f.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500">Only fonts every email app has, so your email looks the same everywhere.</p>
      </PanelSection>
      <PanelSection title="Brand">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const brand = defaultSettings(api.theme);
            api.dispatch({ type: "updateSettings", patch: { ...brand, contentWidth: settings.contentWidth } });
          }}
        >
          <Paintbrush /> Use brand colours and font
        </Button>
      </PanelSection>
    </div>
  );
}
