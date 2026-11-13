// Building CSV files for "Export (.csv)". Pure functions, easy to test.
//
// SAFETY ("CSV injection"): spreadsheet apps run a cell that starts with
// = + - @ (or a tab / carriage return) as a FORMULA. A campaign called
// "=HYPERLINK(…)" could then do harm when someone opens the export. So such
// text gets an apostrophe in front ('=HYPERLINK…), which spreadsheets show as
// plain text. Numbers are written as numbers (a negative number is fine).

export type CsvValue = string | number | null | undefined;

/** One cell, quoted when needed ("a, b" → "\"a, b\""). */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A whole file: a header row, then the rows. Lines end with CRLF (what Excel
 * expects) and the file starts with a "BOM", so Excel reads accents and
 * other non-English letters correctly.
 */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
