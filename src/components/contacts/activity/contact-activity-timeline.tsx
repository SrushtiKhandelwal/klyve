"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  BanIcon,
  Loader2Icon,
  MailOpenIcon,
  MailXIcon,
  MousePointerClickIcon,
  SendIcon,
  UserMinusIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { loadOlderContactActivity } from "@/app/(dashboard)/contacts/[contactId]/actions";
import { Button } from "@/components/ui/button";
import type { ContactActivityKind } from "@/lib/contacts/activity";
import { EVENT_TYPE_META } from "@/lib/tracking/metrics";
import { cn } from "@/lib/utils";
import type { ActivityItemView, ActivityPageView } from "./activity-view";

const ICONS: Record<ContactActivityKind, LucideIcon> = {
  SENT: SendIcon,
  OPENED: MailOpenIcon,
  CLICKED: MousePointerClickIcon,
  BOUNCED: MailXIcon,
  COMPLAINED: BanIcon,
  UNSUBSCRIBED: UserMinusIcon,
};

/** Icon colours: "Sent" is neutral, the rest reuse the report colours. */
function iconClass(kind: ContactActivityKind): string {
  return kind === "SENT" ? "bg-zinc-100 text-zinc-600 ring-zinc-500/20" : EVENT_TYPE_META[kind].className;
}

/** The contact's email history, newest first, with a "Show older" button. */
export function ContactActivityTimeline({ contactId, initial }: { contactId: string; initial: ActivityPageView }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, startLoading] = useTransition();

  function loadOlder() {
    if (!cursor) return;
    startLoading(async () => {
      try {
        const result = await loadOlderContactActivity({ contactId, cursor });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        // Skip anything already shown (e.g. if a new event arrived meanwhile).
        setItems((current) => {
          const seen = new Set(current.map((i) => i.id));
          return [...current, ...result.page.items.filter((i) => !seen.has(i.id))];
        });
        setCursor(result.page.nextCursor);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-zinc-500">
        No emails yet. Campaigns sent to this contact, and their opens and clicks, will show up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ol className="flex flex-col px-5 py-4">
        {items.map((item, index) => (
          <TimelineItem key={item.id} item={item} last={index === items.length - 1} />
        ))}
      </ol>
      {initial.automatedHidden > 0 && (
        <p className="border-t px-5 py-2.5 text-xs text-zinc-500">
          +{initial.automatedHidden.toLocaleString()} automated {initial.automatedHidden === 1 ? "open" : "opens"}{" "}
          hidden (privacy scanners and link checkers, not the person).
        </p>
      )}
      {cursor && (
        <div className="border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={loadOlder} disabled={loading}>
            {loading && <Loader2Icon className="animate-spin" />}
            Show older activity
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ item, last }: { item: ActivityItemView; last: boolean }) {
  const Icon = ICONS[item.kind];
  const campaign = (
    <Link
      href={`/campaigns/${item.campaignId}`}
      className="font-medium break-words text-zinc-900 hover:text-emerald-700 hover:underline"
    >
      {item.campaignName}
    </Link>
  );

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* The thin line joining the icons. */}
      {!last && <span aria-hidden className="absolute top-8 bottom-0 left-[13px] w-px bg-zinc-200" />}
      <span
        className={cn(
          "relative flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
          iconClass(item.kind),
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-sm text-zinc-600">
        <p className="break-words">
          {item.kind === "SENT" && <>Sent {campaign}</>}
          {item.kind === "OPENED" && <>Opened {campaign}</>}
          {item.kind === "CLICKED" && <>Clicked a link in {campaign}</>}
          {item.kind === "BOUNCED" && (
            <>
              {item.bounceType === "hard" ? "Hard bounce" : "Soft bounce"} on {campaign}
            </>
          )}
          {item.kind === "COMPLAINED" && <>Marked {campaign} as spam</>}
          {item.kind === "UNSUBSCRIBED" && <>Unsubscribed from {campaign}</>}
        </p>
        {/* Only real web links become clickable (never javascript: and the like). */}
        {item.kind === "CLICKED" && item.url && /^https?:\/\//i.test(item.url) && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-0.5 block truncate text-xs text-emerald-700 hover:underline"
            title={item.url}
          >
            {item.url}
          </a>
        )}
        {item.kind === "BOUNCED" && (
          <p className="mt-0.5 text-xs text-zinc-500">
            {item.bounceType === "hard"
              ? "The address doesn't exist or can't receive mail."
              : "A temporary problem, like a full mailbox."}
          </p>
        )}
        <time dateTime={item.iso} className="mt-0.5 block text-xs text-zinc-400">
          {item.when}
        </time>
      </div>
    </li>
  );
}
