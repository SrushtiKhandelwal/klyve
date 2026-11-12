import type { ReactNode } from "react";
import { SentDesignPreview } from "@/components/campaigns/design-preview";
import { LocalDateTime } from "@/components/campaigns/local-time";
import type { EmailDocument } from "@/lib/templates/document";

/**
 * The "what was sent" card under the progress: subject, sender, audience,
 * timestamps and a read-only preview of the design. Rendered on the server.
 */
export function CampaignSummary({
  subject,
  preheader,
  senderLabel,
  providerName,
  audienceText,
  document,
  createdAt,
  scheduledAt,
  startedAt,
  finishedAt,
}: {
  subject: string;
  preheader: string;
  senderLabel: string | null;
  providerName: string | null;
  audienceText: ReactNode;
  document: EmailDocument | null;
  createdAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}) {
  return (
    <section aria-labelledby="summary-title" className="flex flex-col gap-5 rounded-xl border bg-white p-4 sm:p-5">
      <h2 id="summary-title" className="font-semibold text-zinc-900">
        Summary
      </h2>
      <div className="flex flex-col gap-6 md:flex-row">
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Item label="Subject" wide>
            {subject || <span className="text-zinc-400">No subject</span>}
          </Item>
          {preheader && (
            <Item label="Preview text" wide>
              {preheader}
            </Item>
          )}
          <Item label="From">{senderLabel ?? <span className="text-zinc-400">No sender</span>}</Item>
          <Item label="Sent through">{providerName ?? <span className="text-zinc-400">Unknown provider</span>}</Item>
          <Item label="Audience" wide>
            {audienceText}
          </Item>
          <Item label="Created">
            <LocalDateTime iso={createdAt} />
          </Item>
          {scheduledAt && (
            <Item label="Scheduled for">
              <LocalDateTime iso={scheduledAt} />
            </Item>
          )}
          {startedAt && (
            <Item label="Started">
              <LocalDateTime iso={startedAt} />
            </Item>
          )}
          {finishedAt && (
            <Item label="Finished">
              <LocalDateTime iso={finishedAt} />
            </Item>
          )}
        </dl>
        <div className="shrink-0 md:w-48">
          <p className="mb-2 text-xs font-medium text-zinc-500">Design</p>
          <SentDesignPreview document={document} subject={subject} preheader={preheader} />
        </div>
      </div>
    </section>
  );
}

function Item({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-zinc-900">{children}</dd>
    </div>
  );
}
