"use client";

import { useNow } from "@/components/settings/senders/use-now";

/** "just now", "3 minutes ago", "2 days ago". Empty until the browser takes over. */
export function RelativeTime({ iso }: { iso: string }) {
  const now = useNow();
  const date = new Date(iso);
  if (now === null) return <time dateTime={iso} />;

  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  let text: string;
  if (seconds < 45) text = "just now";
  else if (seconds < 3600) text = plural(Math.round(seconds / 60), "minute");
  else if (seconds < 86400) text = plural(Math.round(seconds / 3600), "hour");
  else text = plural(Math.round(seconds / 86400), "day");

  return (
    <time dateTime={iso} title={date.toLocaleString()}>
      {text}
    </time>
  );
}

function plural(n: number, unit: string) {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}
