import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { MediaLibraryView } from "@/components/library/media-library-view";
import { Skeleton } from "@/components/ui/skeleton";
import { getAppUrl } from "@/lib/app-url";
import { getMediaUsage, listMediaAssets } from "@/lib/media/assets";
import { MAX_ASSETS_PER_WORKSPACE, MAX_BYTES_PER_WORKSPACE } from "@/lib/media/limits";
import { getCurrentUser } from "@/lib/session";
import { getWorkspaceDatePrefs } from "@/lib/workspace-prefs";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Media" };

const TITLE = "Media";
const DESCRIPTION = "The images you upload for your emails: your logo, product photos and banners.";

// Media library (like Brevo's Library → Media). The frame is static; the
// images load inside <Suspense> because they depend on the logged-in user.
export default function LibraryPage() {
  return (
    <PageContainer>
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryContent />
      </Suspense>
    </PageContainer>
  );
}

async function LibraryContent() {
  const ws = await requireActiveWorkspace();
  // Every query is filtered by this workspace: other workspaces' images never appear.
  const [user, page, usage, prefs] = await Promise.all([
    getCurrentUser(),
    listMediaAssets(ws.id),
    getMediaUsage(ws.id),
    getWorkspaceDatePrefs(ws.id),
  ]);
  const isManager = ws.role === "OWNER" || ws.role === "ADMIN";

  return (
    <MediaLibraryView
      title={TITLE}
      description={DESCRIPTION}
      initialItems={page.items.map((item) => ({ ...item, canDelete: isManager || (!!user && item.createdById === user.id) }))}
      initialCursor={page.nextCursor}
      initialUsage={usage}
      quota={{ count: MAX_ASSETS_PER_WORKSPACE, bytes: MAX_BYTES_PER_WORKSPACE }}
      appUrl={getAppUrl()}
      prefs={prefs}
    />
  );
}

function LibrarySkeleton() {
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    </>
  );
}
