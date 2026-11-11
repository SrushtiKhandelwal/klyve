// Browser-side helpers for the CSV import wizard: reading the file, guessing
// which column is which, building the sample file and splitting rows into
// chunks. No React and no database here, just plain functions.
import Papa from "papaparse";
import type { AttributeTypeValue } from "@/lib/contacts/common";
import {
  CHUNK_MAX_BYTES,
  CHUNK_ROWS,
  EMAIL_TARGET,
  FIRSTNAME_TARGET,
  LASTNAME_TARGET,
  MAX_CELL_CHARS,
  MAX_FILE_BYTES,
  MAX_IMPORT_ROWS,
} from "@/lib/contacts/import-limits";

/** A custom field as the wizard needs it (comes from getAttributeDefinitions). */
export type ImportAttribute = { key: string; label: string; type: AttributeTypeValue };

/** Select value meaning "don't import this column". */
export const SKIP_TARGET = "__skip__";

export type ParsedCsv = {
  fileName: string;
  /** Column names, as written in the file's first row. */
  headers: string[];
  /** Data rows; rows[i][c] is the cell of column c. */
  rows: string[][];
};

// ─── Reading the file ───────────────────────────────────────────────────────

/** Reads a CSV file in the browser. Rejects with a message the user can read. */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  if (!/\.csv$/i.test(file.name)) {
    return Promise.reject(new Error("Please choose a .csv file."));
  }
  if (file.size > MAX_FILE_BYTES) {
    return Promise.reject(new Error("This file is bigger than 20 MB. Split it into smaller files."));
  }
  if (file.size === 0) return Promise.reject(new Error("This file is empty."));

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      // "greedy" also skips lines that only contain spaces or commas.
      skipEmptyLines: "greedy",
      // Papa guesses the separator from the first lines; we only allow these.
      delimitersToGuess: [",", ";", "\t", "|"],
      // Stop reading as soon as we know the file is too long (saves memory).
      preview: MAX_IMPORT_ROWS + 1,
      // Excel adds an invisible "BOM" character before the first header.
      transformHeader: (header) => header.replace(/^﻿/, "").trim(),
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        if (headers.length === 0) {
          reject(new Error("We couldn't find any columns. Is the first row a header row?"));
          return;
        }
        if (result.data.length === 0) {
          reject(new Error("This file has a header row but no contacts under it."));
          return;
        }
        if (result.data.length > MAX_IMPORT_ROWS) {
          reject(
            new Error(
              `This file has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Split it into smaller files.`,
            ),
          );
          return;
        }
        const rows = result.data.map((record) =>
          headers.map((h) => {
            const value = record[h];
            return typeof value === "string" ? value : "";
          }),
        );
        resolve({ fileName: file.name, headers, rows });
      },
      error: () => reject(new Error("We couldn't read this file. Is it a CSV file?")),
    });
  });
}

/** What to show for a column whose header cell is empty. */
export function columnName(headers: string[], index: number): string {
  return headers[index] || `Column ${index + 1}`;
}

/** The first few non-empty values of a column, to help the user recognise it. */
export function sampleValues(rows: string[][], column: number, count = 3): string[] {
  const samples: string[] = [];
  for (const row of rows) {
    const value = (row[column] ?? "").trim();
    if (value) samples.push(value.length > 40 ? `${value.slice(0, 40)}…` : value);
    if (samples.length >= count) break;
  }
  return samples;
}

// ─── Guessing the mapping ───────────────────────────────────────────────────

/** "E-mail Address" → "emailaddress", so spelling variations still match. */
function simplify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const EMAIL_NAMES = ["email", "emailaddress", "mail", "emailid", "emails", "mailaddress", "courriel"];
const FIRST_NAMES = ["firstname", "fname", "givenname", "first", "forename", "prenom", "vorname"];
const LAST_NAMES = ["lastname", "lname", "surname", "familyname", "last", "nom", "nachname"];

/**
 * Picks a field for each column from its header text. Returns one target per
 * column (or SKIP_TARGET). Each field is used at most once: the first
 * matching column wins.
 */
export function guessMapping(headers: string[], attributes: ImportAttribute[]): string[] {
  const simple = headers.map(simplify);
  const taken: (string | undefined)[] = headers.map(() => undefined);

  // Gives `target` to the first free column whose header matches.
  const pick = (target: string, matches: (s: string) => boolean): number => {
    const index = simple.findIndex((s, i) => !taken[i] && matches(s));
    if (index !== -1) taken[index] = target;
    return index;
  };

  // Exact names first, then "anything containing email" as a fallback.
  if (pick(EMAIL_TARGET, (s) => EMAIL_NAMES.includes(s)) === -1) {
    pick(EMAIL_TARGET, (s) => s.includes("email"));
  }
  pick(FIRSTNAME_TARGET, (s) => FIRST_NAMES.includes(s));
  pick(LASTNAME_TARGET, (s) => LAST_NAMES.includes(s));
  for (const attribute of attributes) {
    const names = [simplify(attribute.key), simplify(attribute.label)];
    pick(attribute.key, (s) => s !== "" && names.includes(s));
  }

  return taken.map((t) => t ?? SKIP_TARGET);
}

// ─── Sample file ────────────────────────────────────────────────────────────

const SAMPLE_VALUES: Record<AttributeTypeValue, [string, string]> = {
  TEXT: ["Pune", "Mumbai"],
  NUMBER: ["31", "27"],
  DATE: ["1994-05-12", "1998-11-03"],
  BOOLEAN: ["yes", "no"],
};

/** A small example CSV: email, first name, last name and one custom field. */
export function buildSampleCsv(attributes: ImportAttribute[]): string {
  const custom = attributes[0] ?? { key: "CITY", type: "TEXT" as const };
  const [a, b] = SAMPLE_VALUES[custom.type];
  return Papa.unparse([
    ["email", "firstname", "lastname", custom.key],
    ["priya.sharma@example.com", "Priya", "Sharma", a],
    ["alex.martin@example.com", "Alex", "Martin", b],
  ]);
}

/** Makes the browser save `text` as a file (nothing is uploaded). */
export function downloadTextFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ─── Chunks ─────────────────────────────────────────────────────────────────

export type Chunk = {
  /** Index of the chunk's first row in the file (0-based). */
  rowOffset: number;
  /** Only the mapped columns, in mapping order. */
  rows: string[][];
};

/**
 * Splits the rows into chunks of at most CHUNK_ROWS rows, cutting earlier if a
 * chunk would get too big in bytes (rows with very long values), so every
 * request stays far below the 1 MB Server Action limit.
 */
export function buildChunks(rows: string[][], columns: number[]): Chunk[] {
  const encoder = new TextEncoder();
  const chunks: Chunk[] = [];
  let current: Chunk = { rowOffset: 0, rows: [] };
  let bytes = 0;

  rows.forEach((row, index) => {
    const cells = columns.map((c) => (row[c] ?? "").slice(0, MAX_CELL_CHARS));
    const size = encoder.encode(JSON.stringify(cells)).length + 1;
    if (current.rows.length > 0 && (current.rows.length >= CHUNK_ROWS || bytes + size > CHUNK_MAX_BYTES)) {
      chunks.push(current);
      current = { rowOffset: index, rows: [] };
      bytes = 0;
    }
    current.rows.push(cells);
    bytes += size;
  });
  if (current.rows.length > 0) chunks.push(current);
  return chunks;
}
