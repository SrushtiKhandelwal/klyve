"use client";

import { useState, type DragEvent } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildSampleCsv,
  downloadTextFile,
  parseCsvFile,
  type ImportAttribute,
  type ParsedCsv,
} from "./csv";
import { MAX_IMPORT_ROWS } from "@/lib/contacts/import-limits";

/** Step 1: pick or drop a CSV file. It is read right here in the browser. */
export function UploadStep({
  attributes,
  onParsed,
}: {
  attributes: ImportAttribute[];
  onParsed: (csv: ParsedCsv) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file || reading) return;
    setError(null);
    setReading(true);
    try {
      onParsed(await parseCsvFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read this file.");
    } finally {
      setReading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* A <label> around a hidden file input: clicking anywhere opens the
          file picker, and the input itself stays keyboard-focusable. */}
      <label
        htmlFor="csv-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-within:ring-3 focus-within:ring-emerald-500/40 sm:py-16",
          dragging
            ? "border-emerald-500 bg-emerald-50"
            : "border-zinc-300 bg-zinc-50/50 hover:border-emerald-400 hover:bg-emerald-50/40",
        )}
      >
        {reading ? (
          <Loader2 className="size-8 animate-spin text-emerald-600" aria-hidden />
        ) : (
          <Glyph icon={Upload} size="xl" strokeWidth={1.5} />
        )}
        <span className="mt-4 font-medium text-zinc-900">
          {reading ? "Reading your file…" : "Drop your CSV file here, or click to choose one"}
        </span>
        <span className="mt-1 text-sm text-zinc-500">
          .csv only · up to 20 MB and {MAX_IMPORT_ROWS.toLocaleString("en-US")} rows · first row must be the
          column names
        </span>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = ""; // allow picking the same file again
          }}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-zinc-400" />
          <p className="text-sm text-zinc-600">
            Not sure how to format it? Start from our sample file. Commas or semicolons both work.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadTextFile("klyve-sample-contacts.csv", buildSampleCsv(attributes))}
        >
          <Download aria-hidden />
          Download sample CSV
        </Button>
      </div>
    </div>
  );
}
