import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LocalDateTime } from "@/components/campaigns/local-time";
import { RunStatusBadge } from "@/components/automations/stats/run-status";
import { AddToAutomation, RemoveFromAutomationButton } from "@/components/contacts/automation-runs-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { getContactAutomations, type ContactRunView } from "@/lib/automations/stats";

/**
 * The contact page's "Automations" card: every automation this person has
 * been through (or is going through), with a short history of each, plus
 * "Add to automation". `workspaceId` must be the active workspace's id.
 *
 * Rendered on the server; the history uses a plain <details> element, so it
 * opens without any JavaScript.
 */
export async function AutomationRunsCard({ workspaceId, contactId }: { workspaceId: string; contactId: string }) {
  const data = await getContactAutomations(workspaceId, contactId);
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 p-5">
      {data.runs.length === 0 ? (
        <p className="text-sm text-zinc-500">Not in any automation yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {data.runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-zinc-900">Add to automation</h3>
        {data.enrollable.length > 0 ? (
          <AddToAutomation contactId={contactId} automations={data.enrollable} />
        ) : null}
        <p className="text-xs text-zinc-500">
          {data.enrollable.length > 0
            ? "Only automations that are turned on and start “when you add people by hand” are listed. Others start on their own."
            : "No automation can take people by hand right now. Create one that starts “when you add people by hand” and turn it on."}{" "}
          <Link href="/automations" className="font-medium text-emerald-700 hover:underline">
            Go to automations
          </Link>
        </p>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: ContactRunView }) {
  const inProgress = run.status === "ACTIVE" || run.status === "WAITING";
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/automations/${run.automation.id}`}
            className="block truncate text-sm font-medium text-zinc-900 hover:text-emerald-700 hover:underline"
          >
            {run.automation.name}
            {run.occurrence ? <span className="font-normal text-zinc-500"> · {run.occurrence}</span> : null}
          </Link>
          <p className="truncate text-xs text-zinc-500">
            {inProgress
              ? run.stepName
                ? `Now at: ${run.stepName}`
                : "Starting…"
              : run.status === "COMPLETED"
                ? "Went all the way through"
                : (run.lastError ?? (run.status === "FAILED" ? "A step couldn't run" : "Left early"))}
            {inProgress && run.automation.status === "PAUSED" ? " (automation paused)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RunStatusBadge status={run.status} />
          {inProgress && <RemoveFromAutomationButton runId={run.id} automationName={run.automation.name} />}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-zinc-500">Started</dt>
          <dd className="text-zinc-800">
            <LocalDateTime iso={run.startedAt} />
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Finished</dt>
          <dd className="text-zinc-800">{run.finishedAt ? <LocalDateTime iso={run.finishedAt} /> : "Not yet"}</dd>
        </div>
      </dl>

      {run.logs.length > 0 && (
        <details className="group text-xs">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 font-medium text-zinc-500 hover:text-zinc-800 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
            History ({run.logs.length}
            {run.moreLogs ? "+" : ""})
          </summary>
          <ol className="mt-2 flex flex-col gap-2 border-l border-zinc-200 pl-3">
            {run.logs.map((log) => (
              <li key={log.id} className="relative">
                <span aria-hidden className="absolute top-1.5 -left-[15.5px] size-1.5 rounded-full bg-zinc-300" />
                <p className="text-zinc-800">{log.label}</p>
                {log.detail && <p className="break-words text-zinc-500">{log.detail}</p>}
                <p className="text-zinc-400">
                  <LocalDateTime iso={log.createdAt} />
                </p>
              </li>
            ))}
          </ol>
          {run.moreLogs && <p className="mt-2 text-zinc-400">Only the latest steps are shown.</p>}
        </details>
      )}
    </li>
  );
}

export function AutomationRunsCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
