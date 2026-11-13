import { Skeleton } from "@/components/ui/skeleton";
import { listConsentEvents } from "@/lib/consent";
import { toConsentPageView } from "@/lib/gdpr/consent-view";
import { ConsentHistory } from "./consent-history";

/**
 * Server part of the consent history card: loads the first page, the client
 * part handles "Load more". `workspaceId` must be the active workspace's id.
 */
export async function ConsentHistoryCard({ workspaceId, contactId }: { workspaceId: string; contactId: string }) {
  const page = await listConsentEvents(workspaceId, contactId);
  return <ConsentHistory contactId={contactId} initial={toConsentPageView(page)} />;
}

export function ConsentHistoryCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
