"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { failImport, finishImport, importChunk, startImport } from "@/app/actions/import";
import type { ImportProblem } from "@/lib/contacts/import";
import type { ListOption } from "@/lib/contacts/lookups";
import { cn } from "@/lib/utils";
import { buildChunks, guessMapping, SKIP_TARGET, type ImportAttribute, type ParsedCsv } from "./csv";
import { MAX_STORED_PROBLEMS } from "@/lib/contacts/import-limits";
import { MappingStep } from "./mapping-step";
import { DEFAULT_OPTIONS, OptionsStep, optionsProblem, type ImportOptions } from "./options-step";
import { ProgressView, SummaryView, type ImportCounts } from "./result-views";
import { UploadStep } from "./upload-step";

type Step = "upload" | "map" | "options" | "importing" | "done";

const STEP_LABELS = ["Upload", "Map columns", "Options", "Import"] as const;
const STEP_INDEX: Record<Step, number> = { upload: 0, map: 1, options: 2, importing: 3, done: 3 };

const NO_COUNTS: ImportCounts = { created: 0, updated: 0, skipped: 0, invalid: 0 };

type Outcome = {
  counts: ImportCounts;
  problems: ImportProblem[];
  listId: string | null;
  failure?: string;
};

/**
 * The CSV import wizard. The file is read in the browser; the rows are then
 * sent to the server in small chunks, where they are checked again (the
 * server never trusts what the browser sends).
 */
export function ImportWizard({
  lists,
  attributes,
}: {
  lists: ListOption[];
  attributes: ImportAttribute[];
}) {
  const [step, setStep] = useState<Step>("upload");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Guards against a double click starting two imports.
  const running = useRef(false);

  // Warn before closing or reloading the tab while rows are still being sent.
  useEffect(() => {
    if (step !== "importing") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ""; // older browsers need this to show the warning
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

  function reset() {
    setStep("upload");
    setCsv(null);
    setTargets([]);
    setOptions(DEFAULT_OPTIONS);
    setStartError(null);
    setOutcome(null);
  }

  async function runImport() {
    if (!csv || running.current || optionsProblem(options, lists)) return;
    running.current = true;
    setStarting(true);
    setStartError(null);

    // Only the mapped columns are sent, in this order.
    const columns: number[] = [];
    const mapping: string[] = [];
    targets.forEach((target, column) => {
      if (target !== SKIP_TARGET) {
        columns.push(column);
        mapping.push(target);
      }
    });

    // Filled in once the import record exists, so the catch below knows
    // whether there is a started import to mark as failed.
    let current: { importId: string; listId: string | null; counts: ImportCounts; problems: ImportProblem[] } | null =
      null;

    try {
      const started = await startImport({
        fileName: csv.fileName,
        totalRows: csv.rows.length,
        listId: options.listMode === "existing" ? options.listId : undefined,
        newListName: options.listMode === "new" ? options.newListName.trim() : undefined,
      });
      if (!started.ok) {
        setStartError(started.error);
        return;
      }

      const { importId, listId } = started.data;
      const counts = { ...NO_COUNTS };
      const problems: ImportProblem[] = [];
      current = { importId, listId, counts, problems };
      setProgress({ done: 0, total: csv.rows.length });
      setStep("importing");

      // One chunk at a time (Next.js runs Server Actions one by one anyway).
      for (const chunk of buildChunks(csv.rows, columns)) {
        let result: Awaited<ReturnType<typeof importChunk>>;
        try {
          result = await importChunk({
            importId,
            rowOffset: chunk.rowOffset,
            rows: chunk.rows,
            mapping,
            updateExisting: options.updateExisting,
          });
        } catch {
          result = { ok: false, error: "We lost the connection to the server." };
        }

        if (!result.ok) {
          // Mark it FAILED so it doesn't look "still processing" forever.
          await failImport(importId, result.error).catch(() => undefined);
          setOutcome({ counts, problems, listId, failure: result.error });
          setStep("done");
          return;
        }

        counts.created += result.data.created;
        counts.updated += result.data.updated;
        counts.skipped += result.data.skipped;
        counts.invalid += result.data.invalid;
        problems.push(...result.data.problems.slice(0, MAX_STORED_PROBLEMS - problems.length));
        setProgress({ done: chunk.rowOffset + chunk.rows.length, total: csv.rows.length });
      }

      const finished = await finishImport(importId).catch(() => null);
      if (finished?.ok) {
        const s = finished.data;
        setOutcome({
          counts: { created: s.created, updated: s.updated, skipped: s.skipped, invalid: s.invalid ?? counts.invalid },
          problems: s.problems,
          listId: s.listId,
        });
      } else {
        // Every row was sent and saved; only the final status update failed.
        setOutcome({ counts, problems, listId });
      }
      setStep("done");
    } catch {
      const message = "We couldn't reach the server. Check your connection and try again.";
      if (current) {
        // Something broke mid-import: stop cleanly and show what was saved.
        await failImport(current.importId, message).catch(() => undefined);
        setOutcome({ counts: current.counts, problems: current.problems, listId: current.listId, failure: message });
        setStep("done");
      } else {
        setStartError(message);
      }
    } finally {
      running.current = false;
      setStarting(false);
    }
  }

  return (
    <section aria-label="Import contacts" className="flex flex-col gap-6">
      <StepIndicator current={STEP_INDEX[step]} finished={step === "done"} />

      {step === "upload" && (
        <UploadStep
          attributes={attributes}
          onParsed={(parsed) => {
            setCsv(parsed);
            setTargets(guessMapping(parsed.headers, attributes));
            setStep("map");
          }}
        />
      )}

      {step === "map" && csv && (
        <MappingStep
          csv={csv}
          attributes={attributes}
          targets={targets}
          onChange={setTargets}
          onBack={reset}
          onNext={() => setStep("options")}
        />
      )}

      {step === "options" && csv && (
        <OptionsStep
          rowCount={csv.rows.length}
          lists={lists}
          options={options}
          onChange={setOptions}
          error={startError}
          starting={starting}
          onBack={() => setStep("map")}
          onStart={runImport}
        />
      )}

      {step === "importing" && <ProgressView done={progress.done} total={progress.total} />}

      {step === "done" && outcome && (
        <SummaryView
          counts={outcome.counts}
          problems={outcome.problems}
          listId={outcome.listId}
          failure={outcome.failure}
          onReset={reset}
        />
      )}
    </section>
  );
}

function StepIndicator({ current, finished }: { current: number; finished: boolean }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEP_LABELS.map((label, index) => {
        const done = index < current || finished;
        const active = index === current && !finished;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-emerald-600 text-white",
                active && "bg-emerald-50 text-emerald-700 ring-2 ring-emerald-600",
                !done && !active && "bg-zinc-100 text-zinc-500",
              )}
            >
              {done ? <Check className="size-4" /> : index + 1}
            </span>
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "truncate",
                active ? "font-medium text-zinc-900" : "text-zinc-500",
                // On phones only the current step's name fits.
                !active && "hidden sm:inline",
              )}
            >
              {label}
            </span>
            {index < STEP_LABELS.length - 1 && <span aria-hidden className="h-px flex-1 bg-zinc-200" />}
          </li>
        );
      })}
    </ol>
  );
}
