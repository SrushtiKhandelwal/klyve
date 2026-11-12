// The app's public address, e.g. https://klyve.example or http://localhost:3000.
// Used for links that leave the app (unsubscribe links, images in emails).
// Safe on server; on the client prefer relative links.
export function getAppUrl(): string {
  const url = process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/** Absolute URL for a path on this app, e.g. absoluteUrl("/u/abc"). */
export function absoluteUrl(path: string): string {
  return `${getAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
