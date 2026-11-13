"use client";

import { useState, useTransition } from "react";
import { CopyIcon, ExternalLinkIcon, ImageIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteMedia, listMedia, type MediaItem } from "@/app/actions/media";
import { PageHeader } from "@/components/dashboard/page-header";
import { DELETE_WARNING } from "@/components/media/media-library";
import { UploadDropzone } from "@/components/media/upload-dropzone";
import { formatBytes, type UploadedMedia } from "@/components/media/upload";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, type DatePrefs } from "@/lib/format-date";
import { cn } from "@/lib/utils";

// The Media page: storage used, an upload button, and a grid of the
// workspace's images with copy-link, open and delete. Uploading goes through
// the same endpoint (POST /api/media) and drop area as the email editor's
// image picker, and deleting through the same Server Action and permission
// rules (owners/admins, or whoever uploaded the image).

export function MediaLibraryView({
  title,
  description,
  initialItems,
  initialCursor,
  initialUsage,
  quota,
  appUrl,
  prefs,
}: {
  title: string;
  description: string;
  initialItems: MediaItem[];
  initialCursor: string | null;
  initialUsage: { count: number; bytes: number };
  quota: { count: number; bytes: number };
  /** The app's public address, so copied links work in emails and other sites. */
  appUrl: string;
  prefs: DatePrefs;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [usage, setUsage] = useState(initialUsage);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [loadingMore, startLoading] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const full = usage.count >= quota.count || usage.bytes >= quota.bytes;

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      try {
        const result = await listMedia({ cursor });
        if (!result.ok) return void toast.error(result.error);
        // Skip ids already shown (e.g. an image uploaded while this page was open).
        setItems((current) => {
          const seen = new Set(current.map((i) => i.id));
          return [...current, ...result.items.filter((i) => !seen.has(i.id))];
        });
        setCursor(result.nextCursor);
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  function handleUploaded(asset: UploadedMedia, info: { isLastOfBatch: boolean; batchSize: number }) {
    const item: MediaItem = {
      ...asset,
      mimeType: "",
      createdAt: new Date().toISOString(),
      createdById: null,
      canDelete: true, // the uploader can always delete their own image
    };
    setItems((current) => [item, ...current.filter((c) => c.id !== asset.id)]);
    setUsage((u) => ({ count: u.count + 1, bytes: u.bytes + asset.sizeBytes }));
    if (info.isLastOfBatch) {
      toast.success(info.batchSize === 1 ? "Image uploaded." : "Images uploaded.");
    }
  }

  function confirmDelete() {
    const target = toDelete;
    if (!target) return;
    startDeleting(async () => {
      try {
        const result = await deleteMedia(target.id);
        if (!result.ok) return void toast.error(result.error);
        setItems((current) => current.filter((i) => i.id !== target.id));
        setUsage((u) => ({ count: Math.max(0, u.count - 1), bytes: Math.max(0, u.bytes - target.sizeBytes) }));
        setToDelete(null);
        toast.success("Image deleted.");
      } catch {
        toast.error("Couldn't reach the server. Please try again.");
      }
    });
  }

  async function copyLink(item: MediaItem) {
    const link = `${appUrl}${item.url}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Image link copied.");
    } catch {
      // Clipboard blocked (e.g. not HTTPS): show it so it can be copied by hand.
      toast.message("Copy this link:", { description: link });
    }
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={() => setUploadOpen(true)} disabled={full}>
            <UploadIcon aria-hidden />
            Upload images
          </Button>
        }
      />

      <StorageMeter usage={usage} quota={quota} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <ImageIcon className="size-9 text-zinc-300" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">No images yet</h2>
          <p className="mt-1.5 max-w-md text-sm text-zinc-500">
            Upload your logo, product photos or banners once, then use them in any email. You can also add images
            right from the email editor.
          </p>
          <Button className="mt-6" onClick={() => setUploadOpen(true)} disabled={full}>
            <UploadIcon aria-hidden />
            Upload images
          </Button>
        </div>
      ) : (
        <section aria-label="Your images" className="flex flex-col gap-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                prefs={prefs}
                onCopy={() => void copyLink(item)}
                onDelete={() => setToDelete(item)}
              />
            ))}
          </ul>
          {cursor && (
            <div className="flex justify-center">
              <Button variant="outline" className="bg-white" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2Icon className="animate-spin" aria-hidden />}
                Load more
              </Button>
            </div>
          )}
        </section>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload images</DialogTitle>
            <DialogDescription>
              They are saved to your library and can be used in any email. Up to 10 at a time.
            </DialogDescription>
          </DialogHeader>
          <UploadDropzone onUploaded={handleUploaded} disabled={full} />
          {full && <p className="text-sm text-red-600">Your library is full. Delete some images first.</p>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this image?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium break-all text-zinc-900">{toDelete?.fileName}</span> will be removed from
              your library. {DELETE_WARNING} This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2Icon className="animate-spin" aria-hidden />}
              Delete image
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StorageMeter({ usage, quota }: { usage: { count: number; bytes: number }; quota: { count: number; bytes: number } }) {
  const share = Math.min(1, Math.max(usage.bytes / quota.bytes, usage.count / quota.count));
  const percent = Math.round(share * 100);
  const tone = share >= 0.9 ? "bg-red-500" : share >= 0.75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <section aria-label="Storage" className="flex flex-col gap-2 rounded-xl border bg-white px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p className="text-zinc-900">
          <span className="font-semibold tabular-nums">{formatBytes(usage.bytes)}</span>
          <span className="text-zinc-500"> of {formatBytes(quota.bytes)} used</span>
        </p>
        <p className="text-zinc-500 tabular-nums">
          {usage.count.toLocaleString("en")} of {quota.count.toLocaleString("en")} images
        </p>
      </div>
      <div
        role="meter"
        aria-label="Library storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% of your library is used`}
        className="h-2 overflow-hidden rounded-full bg-zinc-100"
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(share > 0 ? 1 : 0, percent)}%` }} />
      </div>
    </section>
  );
}

function MediaCard({
  item,
  prefs,
  onCopy,
  onDelete,
}: {
  item: MediaItem;
  prefs: DatePrefs;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const dims = item.width && item.height ? `${item.width} × ${item.height}` : null;
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white">
      {/* The same link as the "open" button below, for the mouse only (one tab stop per card is enough). */}
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        tabIndex={-1}
        aria-hidden
        className="flex aspect-square items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:16px_16px] outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/50 focus-visible:ring-inset"
      >
        {/* Plain <img>: user uploads served from /media, no Next.js image optimisation needed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.url} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
      </a>
      <div className="flex min-w-0 flex-col gap-0.5 border-t px-3 py-2">
        <p className="truncate text-sm font-medium text-zinc-900" title={item.fileName}>
          {item.fileName}
        </p>
        <p className="truncate text-xs text-zinc-500">{[dims, formatBytes(item.sizeBytes)].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-zinc-500">Uploaded {formatDate(item.createdAt, prefs)}</p>
      </div>
      <div className="mt-auto flex items-center gap-1 border-t px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onCopy} aria-label={`Copy the link of ${item.fileName}`}>
          <CopyIcon aria-hidden />
          Copy link
        </Button>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label={`Open ${item.fileName} in a new tab`}
        >
          <ExternalLinkIcon className="size-4" aria-hidden />
        </a>
        {item.canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Delete ${item.fileName}`}
            onClick={onDelete}
          >
            <Trash2Icon aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}
