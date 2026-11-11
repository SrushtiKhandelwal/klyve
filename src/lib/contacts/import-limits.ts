// Limits for CSV import, shared by the browser wizard AND the server
// (src/lib/contacts/import.ts), so both sides always agree.
// Plain constants only: safe to import from client and server code.

/** Biggest file the wizard accepts (20 MB). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Most data rows (not counting the header) one import may contain. */
export const MAX_IMPORT_ROWS = 50_000;

/** Rows the browser sends per request. Small enough to stay far below the 1 MB Server Action limit. */
export const CHUNK_ROWS = 500;

/** The browser also cuts a chunk early once it reaches roughly this many bytes. */
export const CHUNK_MAX_BYTES = 600_000;

/** The server refuses chunks bigger than this (a safety net; the wizard sends 500). */
export const MAX_CHUNK_ROWS = 1_000;

/**
 * Longest cell we send. No field accepts more than 1000 characters, so
 * cutting at 1001 keeps the request small while the server still reports
 * "longer than 1000 characters" for that row.
 */
export const MAX_CELL_CHARS = 1_001;

/** First and last names longer than this are rejected. */
export const MAX_NAME_CHARS = 100;

/** How many row problems we keep per import (enough to spot a pattern). */
export const MAX_STORED_PROBLEMS = 100;

/** Spreadsheet row number of the first data row (row 1 is the header). */
export const FIRST_DATA_ROW_NUMBER = 2;

/** Target value for the email column in a column mapping. */
export const EMAIL_TARGET = "EMAIL";
export const FIRSTNAME_TARGET = "FIRSTNAME";
export const LASTNAME_TARGET = "LASTNAME";
