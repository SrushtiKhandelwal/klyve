import "server-only";
import type { ContactActivityItem, ContactActivityKind, ContactActivityPage } from "@/lib/contacts/activity";

// Timeline items as the browser gets them. Dates are formatted HERE, on the
// server, for both the first page and "Show older", so the times never
// differ between the server render and the browser (no hydration mismatch).

export type ActivityItemView = {
  id: string;
  kind: ContactActivityKind;
  /** ISO time, for <time dateTime>. */
  iso: string;
  /** e.g. "12 Nov 2026, 14:05". */
  when: string;
  campaignId: string;
  campaignName: string;
  url: string | null;
  bounceType: "hard" | "soft" | null;
};

export type ActivityPageView = {
  items: ActivityItemView[];
  nextCursor: string | null;
  automatedHidden: number;
};

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function toActivityPageView(page: ContactActivityPage): ActivityPageView {
  return {
    items: page.items.map(toItemView),
    nextCursor: page.nextCursor,
    automatedHidden: page.automatedHidden,
  };
}

function toItemView(item: ContactActivityItem): ActivityItemView {
  return {
    id: item.id,
    kind: item.kind,
    iso: item.at.toISOString(),
    when: dateTimeFormat.format(item.at),
    campaignId: item.campaignId,
    campaignName: item.campaignName,
    url: item.url,
    bounceType: item.bounceType,
  };
}
