// Rules shared by the Lists screens (browser) and the list Server Actions
// (server), so both sides agree. No database access here.

export const LIST_NAME_MAX = 80;
export const LIST_DESCRIPTION_MAX = 300;

/** Most emails (or contact ids) we accept in one "add" or "remove". */
export const MAX_EMAILS_PER_ADD = 1000;
export const MAX_CONTACTS_PER_REMOVE = 1000;

/**
 * Splits pasted text into separate entries. People paste one per line, or
 * separated by commas, semicolons or spaces (e.g. straight from a spreadsheet),
 * so we accept all of them. Duplicates (ignoring case) are dropped.
 */
export function splitEmailInput(text: string): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const entry = part.trim();
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}
