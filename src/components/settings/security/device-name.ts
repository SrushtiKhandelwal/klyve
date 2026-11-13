// Turns a browser's "user agent" text (e.g. "Mozilla/5.0 (Windows NT 10.0;
// Win64; x64) AppleWebKit/537.36 ... Chrome/131.0 Safari/537.36") into plain
// words like "Chrome on Windows", for the "Where you're logged in" list.
// It's a best guess: browsers can send anything here.

function browserName(ua: string): string | null {
  // Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return null;
}

function systemName(ua: string): string | null {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "Mac";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** "Chrome on Windows", "Safari on iPhone", "Firefox", or "Unknown device". */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent?.slice(0, 512) ?? "";
  if (!ua) return "Unknown device";
  const browser = browserName(ua);
  const system = systemName(ua);
  if (browser && system) return `${browser} on ${system}`;
  if (browser || system) return (browser ?? system) as string;
  // Scripts and tools (curl, the API docs' examples...) rarely look like browsers.
  return "Unknown device";
}
