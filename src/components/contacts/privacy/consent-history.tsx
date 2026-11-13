"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { loadConsentHistory } from "@/app/actions/gdpr";
import { Button } from "@/components/ui/button";
import type { ConsentPageView } from "@/lib/gdpr/consent-view";

/**
 * The contact's consent record, newest first: when and how they signed up,
 * confirmed, unsubscribed... This is the proof anti-spam laws ask for.
 */
export function ConsentHistory({ contactId, initial }: { contactId: string; initial: ConsentPageView }) {
  const [rows, setRows] = useState(initial.rows);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, startLoading] = useTransition();

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      try {
        const result = await loadConsentHistory({ contactId, cursor });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows((current) => {
          const seen = new Set(current.map((r) => r.id));
          return [...current, ...result.page.rows.filter((r) => !seen.has(r.id))];
        });
        setCursor(result.page.nextCursor);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-zinc-500">
        Nothing recorded yet. Sign-ups, confirmations and unsubscribes will be listed here.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-medium text-zinc-900">{row.label}</span>
              <time dateTime={row.at} className="text-xs text-zinc-500">
                {row.when}
              </time>
            </div>
            <p className="text-xs break-words text-zinc-500">
              {row.source}
              {row.detail && <> · {row.detail}</>}
            </p>
          </li>
        ))}
      </ul>
      {cursor && (
        <div className="border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading && <Loader2Icon className="animate-spin" aria-hidden />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
