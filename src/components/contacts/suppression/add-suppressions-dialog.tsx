"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { ClipboardPaste, FileSpreadsheet, Loader2, Plus, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { addSuppressionAddresses, type AddSuppressionsActionResult } from "@/app/actions/suppression";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { pickEmailColumn } from "@/lib/suppression/csv";
import { cn } from "@/lib/utils";
import {
  MANUAL_REASONS,
  MAX_SUPPRESSIONS_PER_ADD,
  SUPPRESSION_NOTE_MAX,
  SUPPRESSION_REASON_META,
  splitSuppressionInput,
  type ManualReasonValue,
} from "@/lib/suppression/meta";

// "Add addresses": paste them, or upload a CSV (e.g. an unsubscribe export
// from Mailchimp or Brevo). The CSV is read here in the browser with
// papaparse, only to pick out the email column; the server checks every
// address again before anything is saved.

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const fmt = (n: number) => n.toLocaleString("en-US");

type Mode = "paste" | "upload";
type FileInfo = { name: string; column: string; emails: string[] };

export function AddSuppressionsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
        <Plus aria-hidden />
        Add addresses
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to the suppression list</DialogTitle>
            <DialogDescription>
              These addresses will never be emailed by this workspace. Up to {fmt(MAX_SUPPRESSIONS_PER_ADD)} at a time.
            </DialogDescription>
          </DialogHeader>
          {/* Inside the dialog, so the form starts fresh every time it opens. */}
          <AddForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<FileInfo | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reason, setReason] = useState<ManualReasonValue>("MANUAL");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<AddSuppressionsActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const entries = mode === "paste" ? splitSuppressionInput(text) : (file?.emails ?? []);
  const tooMany = entries.length > MAX_SUPPRESSIONS_PER_ADD;

  async function handleFile(picked: File | undefined) {
    setFile(null);
    setFileError(null);
    setResult(null);
    if (!picked) return;
    try {
      const info = await readEmailColumn(picked);
      setFile(info);
      // An unsubscribe export from another tool: "Imported" fits best.
      setReason("IMPORT");
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "We couldn't read this file.");
    }
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await addSuppressionAddresses({ entries, reason, note: note.trim() || undefined });
        setResult(res);
        if (!res.ok) return;
        const parts = [`${fmt(res.added)} added`];
        if (res.alreadyThere > 0) parts.push(`${fmt(res.alreadyThere)} already on the list`);
        if (res.invalidCount > 0) parts.push(`${fmt(res.invalidCount)} invalid`);
        toast.success(res.added > 0 ? "Suppression list updated" : "Nothing new to add", {
          description: parts.join(" · "),
        });
        // All good: close. Otherwise stay open to show the invalid entries.
        if (res.invalidCount === 0) onDone();
      } catch {
        setResult({ ok: false, error: "Couldn't reach the server. Please try again." });
      }
    });
  }

  const reasonItems = MANUAL_REASONS.map((r) => ({ value: r, label: SUPPRESSION_REASON_META[r].label }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Two simple toggle buttons (paste / upload). */}
      <div role="radiogroup" aria-label="How to add addresses" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
        {(
          [
            { value: "paste", label: "Paste addresses", icon: ClipboardPaste },
            { value: "upload", label: "Upload CSV", icon: Upload },
          ] as const
        ).map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            disabled={pending}
            onClick={() => {
              setMode(m.value);
              setResult(null);
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40",
              mode === m.value ? "bg-white text-emerald-700 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            <m.icon className="size-4" aria-hidden />
            {m.label}
          </button>
        ))}
      </div>

      {mode === "paste" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="suppress-emails">Email addresses</Label>
          <Textarea
            id="suppress-emails"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            placeholder={"bounced@example.com\nno-thanks@example.com, old@example.com"}
            rows={7}
            autoFocus
            spellCheck={false}
            readOnly={pending}
            className="max-h-64 font-mono text-xs md:text-xs"
            aria-describedby="suppress-emails-count"
          />
          <p id="suppress-emails-count" className={tooMany ? "text-sm text-destructive" : "text-sm text-zinc-500"}>
            {tooMany
              ? `${fmt(entries.length)} entries: please add at most ${fmt(MAX_SUPPRESSIONS_PER_ADD)} at a time.`
              : entries.length === 0
                ? "One per line, or separated by commas."
                : `${fmt(entries.length)} ${entries.length === 1 ? "entry" : "entries"} found. Duplicates are ignored.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="suppress-file"
            className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-8 text-center transition-colors focus-within:ring-3 focus-within:ring-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-50/40"
          >
            <FileSpreadsheet className="size-7 text-emerald-600" aria-hidden />
            <span className="mt-2 text-sm font-medium text-zinc-900">
              {file ? file.name : "Choose a CSV file"}
            </span>
            <span className="mt-0.5 text-xs text-zinc-500">
              e.g. an unsubscribe or bounce export from Mailchimp or Brevo. We use the email column only.
            </span>
            <input
              id="suppress-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={pending}
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>
          {fileError && (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          )}
          {file && (
            <p className={tooMany ? "text-sm text-destructive" : "text-sm text-zinc-500"}>
              {tooMany
                ? `${fmt(file.emails.length)} addresses: please upload at most ${fmt(MAX_SUPPRESSIONS_PER_ADD)} at a time (split the file).`
                : `${fmt(file.emails.length)} addresses found in the column “${file.column}”.`}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="suppress-reason">Reason</Label>
          <Select items={reasonItems} value={reason} onValueChange={(v) => v && setReason(v as ManualReasonValue)}>
            <SelectTrigger id="suppress-reason" className="w-full bg-white" disabled={pending}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reasonItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="suppress-note">Note (optional)</Label>
          <Input
            id="suppress-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={SUPPRESSION_NOTE_MAX}
            placeholder="e.g. Asked by phone, 12 Nov"
            disabled={pending}
            className="bg-white"
          />
        </div>
      </div>

      {result && !result.ok && (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}
      {result?.ok && result.invalidCount > 0 && (
        <div
          role="status"
          className="flex max-h-48 min-w-0 flex-col gap-2 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {fmt(result.invalidCount)} {result.invalidCount === 1 ? "entry isn’t" : "entries aren’t"} a valid email
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {result.invalid.map((item, i) => (
              <li key={i} className="max-w-full truncate rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs ring-1 ring-amber-200">
                {item || "(empty)"}
              </li>
            ))}
            {result.invalidCount > result.invalid.length && (
              <li className="px-1.5 py-0.5 text-xs">and {fmt(result.invalidCount - result.invalid.length)} more</li>
            )}
          </ul>
          <p className="text-xs text-amber-800">
            {fmt(result.added)} added, {fmt(result.alreadyThere)} already on the list.
          </p>
        </div>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
          {result?.ok ? "Close" : "Cancel"}
        </DialogClose>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || entries.length === 0 || tooMany}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Adding…" : "Add to suppression list"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Reading the CSV ────────────────────────────────────────────────────────

/** Reads the file with papaparse and picks out the email column (see pickEmailColumn). */
function readEmailColumn(file: File): Promise<FileInfo> {
  if (!/\.csv$/i.test(file.name)) return Promise.reject(new Error("Please choose a .csv file."));
  if (file.size === 0) return Promise.reject(new Error("This file is empty."));
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error("This file is bigger than 10 MB. Split it into smaller files."));

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
      // Read a little past the limit so we can say "too many".
      preview: MAX_SUPPRESSIONS_PER_ADD + 2,
      complete: (parsed) => {
        const rows = parsed.data.filter((r) => Array.isArray(r));
        if (rows.length === 0) return reject(new Error("This file has no rows."));
        const picked = pickEmailColumn(rows);
        if (!picked) return reject(new Error("We couldn't find a column with email addresses."));
        if (picked.emails.length === 0) return reject(new Error("The email column is empty."));
        resolve({ name: file.name, ...picked });
      },
      error: () => reject(new Error("We couldn't read this file. Is it a CSV file?")),
    });
  });
}
