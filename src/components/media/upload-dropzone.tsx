"use client";

import { useId, useRef, useState } from "react";
import { AlertCircleIcon, CheckCircle2Icon, ImageUpIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE } from "@/lib/media/limits";
import { precheckFile, uploadMedia, type UploadedMedia } from "./upload";

type UploadRow = {
  key: string;
  name: string;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

/**
 * "Drop images here or click to choose" area. Uploads each file in turn,
 * shows a progress bar per file, and reports finished uploads to `onUploaded`.
 * Works with the keyboard (it's a real button) and on phones (opens the
 * photo picker).
 */
export function UploadDropzone({
  onUploaded,
  disabled,
  multiple = true,
  className,
}: {
  onUploaded: (asset: UploadedMedia, info: { isLastOfBatch: boolean; batchSize: number }) => void;
  disabled?: boolean;
  multiple?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const busy = rows.some((r) => r.status === "uploading");

  const updateRow = (key: string, patch: Partial<UploadRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list).slice(0, multiple ? 10 : 1);
    if (files.length === 0) return;

    const batch: (UploadRow & { file: File })[] = files.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      name: file.name,
      file,
      status: "uploading",
      progress: 0,
    }));
    // Keep earlier errors visible a little longer, but drop old successes.
    const newRows: UploadRow[] = batch.map((b) => ({ key: b.key, name: b.name, status: b.status, progress: b.progress }));
    setRows((current) => [...newRows, ...current.filter((r) => r.status === "error")].slice(0, 10));

    // One at a time: kinder to slow phone connections and to the rate limit.
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const problem = precheckFile(row.file);
      if (problem) {
        updateRow(row.key, { status: "error", error: problem });
        continue;
      }
      const result = await uploadMedia(row.file, (progress) => updateRow(row.key, { progress }));
      if (result.ok) {
        updateRow(row.key, { status: "done", progress: 100 });
        onUploaded(result.asset, { isLastOfBatch: i === batch.length - 1, batchSize: batch.length });
      } else {
        updateRow(row.key, { status: "error", error: result.error });
      }
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <button
        type="button"
        disabled={disabled || busy}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && !busy) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors outline-none",
          "focus-visible:border-emerald-500 focus-visible:ring-3 focus-visible:ring-emerald-500/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          dragging ? "border-emerald-500 bg-emerald-50" : "border-zinc-300 bg-zinc-50 hover:border-emerald-400 hover:bg-emerald-50/50",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-white text-emerald-600 shadow-xs ring-1 ring-zinc-200">
          <ImageUpIcon className="size-5" />
        </span>
        <span className="text-sm font-medium text-zinc-900">
          {busy ? "Uploading…" : (
            <>
              <span className="hidden sm:inline">Drop images here or </span>
              <span className="text-emerald-700 underline underline-offset-2">choose {multiple ? "files" : "a file"}</span>
            </>
          )}
        </span>
        <span id={hintId} className="text-xs text-zinc-500">
          PNG, JPG, GIF or WebP · up to 5 MB · max 6000 × 6000 px
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = ""; // so choosing the same file again still triggers onChange
        }}
      />

      {rows.length > 0 && (
        <ul className="grid gap-1.5" aria-live="polite">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs">
              {row.status === "error" ? (
                <AlertCircleIcon className="size-4 shrink-0 text-red-600" aria-hidden />
              ) : row.status === "done" ? (
                <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <ImageUpIcon className="size-4 shrink-0 text-zinc-400" aria-hidden />
              )}
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="truncate font-medium text-zinc-800">{row.name}</span>
                {row.status === "uploading" && (
                  <span
                    role="progressbar"
                    aria-label={`Uploading ${row.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={row.progress}
                    className="block h-1.5 overflow-hidden rounded-full bg-zinc-100"
                  >
                    <span className="block h-full bg-emerald-500 transition-[width]" style={{ width: `${row.progress}%` }} />
                  </span>
                )}
                {row.status === "error" && <span className="text-red-600">{row.error}</span>}
                {row.status === "done" && <span className="text-emerald-700">Uploaded</span>}
              </div>
              {row.status !== "uploading" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Dismiss ${row.name}`}
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                >
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
