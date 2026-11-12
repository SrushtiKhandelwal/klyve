import { createHash } from "node:crypto";
import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/dashboard/page-header";
import type { TemplateCardData } from "@/components/templates/template-card";
import { TemplatesGallery } from "@/components/templates/templates-gallery";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrandTheme } from "@/lib/brand-kit";
import { canDeleteTemplate, listTemplates, type TemplateListItem } from "@/lib/templates/queries";
import { STARTERS, STARTER_CATEGORIES } from "@/lib/templates/starters";
import { requireUser } from "@/lib/session";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Templates" };

// The page frame is static. Everything that depends on the user (their
// templates, their brand) loads inside <Suspense>, so it streams in.
export default function TemplatesPage() {
  return (
    <PageContainer>
      <Suspense fallback={<TemplatesSkeleton />}>
        <TemplatesContent />
      </Suspense>
    </PageContainer>
  );
}

async function TemplatesContent() {
  // Checks login + workspace right next to the data (see ../layout.tsx).
  const [ws, user] = await Promise.all([requireActiveWorkspace(), requireUser()]);
  const [templates, theme] = await Promise.all([listTemplates(ws.id), getBrandTheme(ws)]);

  const cards = toCards(templates, { userId: user.id, role: ws.role });

  // A short fingerprint of the brand: part of each starter preview's URL, so
  // the browser fetches fresh previews right after the brand kit changes.
  const previewVersion = createHash("sha256").update(JSON.stringify(theme)).digest("hex").slice(0, 12);

  return (
    <TemplatesGallery
      templates={cards}
      starters={STARTERS}
      categories={STARTER_CATEGORIES}
      previewVersion={previewVersion}
    />
  );
}

/** What each card needs, with "Edited 5 min ago" worked out on the server. */
function toCards(templates: TemplateListItem[], actor: { userId: string; role: string }): TemplateCardData[] {
  const now = Date.now();
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    updatedAt: t.updatedAt.toISOString(),
    updatedLabel: `Edited ${timeAgo(t.updatedAt.getTime(), now)}`,
    canDelete: canDeleteTemplate(actor, t.createdById),
  }));
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "just now", "5 min ago", "3 hours ago", "2 days ago", then the date. */
function timeAgo(time: number, now: number): string {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return dateFormat.format(time);
}

function TemplatesSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Templates</h1>
          <p className="text-sm text-zinc-500 sm:text-base">Reusable email designs, in your brand.</p>
        </div>
        <Skeleton className="h-8 w-36" />
      </div>
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-white">
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="flex flex-col gap-1.5 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
