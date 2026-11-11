"use server";

import { refresh } from "next/cache";
import {
  failImportForWorkspace,
  finishImportForWorkspace,
  ImportError,
  importChunkForWorkspace,
  startImportForWorkspace,
  type ChunkResult,
  type ImportChunkInput,
  type ImportSummary,
  type StartImportInput,
} from "@/lib/contacts/import";
import { requireActiveWorkspace } from "@/lib/workspace";

// Server Actions for the CSV import wizard (/contacts/import).
// They are public endpoints, so each one works out the workspace from the
// session itself. All validation and workspace scoping happens in
// src/lib/contacts/import.ts, which never trusts anything the browser sends.

export type ImportActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function startImport(
  input: StartImportInput,
): Promise<ImportActionResult<{ importId: string; listId: string | null }>> {
  const ws = await requireActiveWorkspace();
  return run("startImport", () => startImportForWorkspace(ws.id, input));
}

export async function importChunk(input: ImportChunkInput): Promise<ImportActionResult<ChunkResult>> {
  const ws = await requireActiveWorkspace();
  // No refresh() here on purpose: re-rendering the page after every chunk
  // would slow the import down. finishImport refreshes once at the end.
  return run("importChunk", () => importChunkForWorkspace(ws.id, input));
}

export async function finishImport(importId: string): Promise<ImportActionResult<ImportSummary>> {
  const ws = await requireActiveWorkspace();
  const result = await run("finishImport", () => finishImportForWorkspace(ws.id, importId));
  refresh(); // show the new import in "Recent imports" (and any new list)
  return result;
}

export async function failImport(importId: string, message: string): Promise<ImportActionResult<null>> {
  const ws = await requireActiveWorkspace();
  const result = await run("failImport", async () => {
    await failImportForWorkspace(ws.id, importId, message);
    return null;
  });
  refresh();
  return result;
}

/** Runs the work and turns errors into a message the wizard can show. */
async function run<T>(name: string, work: () => Promise<T>): Promise<ImportActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    // Our own errors have friendly messages; anything else is logged and
    // hidden, so database details never reach the browser.
    if (error instanceof ImportError) return { ok: false, error: error.message };
    console.error(`${name} failed:`, error);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}
