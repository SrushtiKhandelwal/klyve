// Small display helpers for the Lists screens, so numbers and dates look the
// same everywhere. We format on the server and send plain text to the browser.

const numberFormat = new Intl.NumberFormat("en");
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** 12345 → "12,345" */
export function formatCount(n: number): string {
  return numberFormat.format(n);
}

/** → "Nov 11, 2026" */
export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/** 1 → "1 contact", 3 → "3 contacts" */
export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
