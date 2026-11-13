// Picks the email addresses out of an uploaded CSV (e.g. an unsubscribe or
// bounce export from Mailchimp or Brevo). Plain functions, safe in the
// browser: the dialog parses the file with papaparse, then calls this. The
// server validates every address again, so this only has to be helpful.

/** "E-mail Address" → "emailaddress", so spelling variations still match. */
const simplify = (s: string) =>
  s
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const clean = (cell: unknown) =>
  String(cell ?? "")
    .replace(/^﻿/, "") // Excel's invisible "BOM" before the first cell
    .trim();

/**
 * Finds the email column and returns its non-empty values. Works with or
 * without a header row:
 *  - a header cell named like "Email" / "Email Address" wins (any column),
 *  - otherwise the column where most of the first 50 rows contain "@"; then
 *    the first row is data unless that cell has no "@" (a header we didn't know).
 * Returns null when no column looks like email addresses.
 */
export function pickEmailColumn(rows: string[][]): { column: string; emails: string[] } | null {
  if (rows.length === 0) return null;

  const header = rows[0].map((c) => simplify(clean(c)));
  let index = header.findIndex((h) => h === "email" || h === "emailaddress");
  if (index === -1) index = header.findIndex((h) => h.includes("email"));
  let hasHeader = index !== -1;

  if (index === -1) {
    const sample = rows.slice(0, 50);
    const width = Math.max(...sample.map((r) => r.length));
    let bestCount = 0;
    for (let c = 0; c < width; c++) {
      const count = sample.filter((r) => clean(r[c]).includes("@")).length;
      if (count > bestCount) {
        index = c;
        bestCount = count;
      }
    }
    if (index === -1) return null;
    hasHeader = !clean(rows[0][index]).includes("@");
  }

  const column = (hasHeader && clean(rows[0][index])) || `Column ${index + 1}`;
  const emails = (hasHeader ? rows.slice(1) : rows).map((r) => clean(r[index])).filter(Boolean);
  return { column, emails };
}
