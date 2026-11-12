"use client";

import type { JSX } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaLibrary } from "./media-library";

/** What the picker hands back. `url` is relative ("/media/<id>"); the email renderer makes it absolute. */
export type PickedMedia = { id: string; url: string; width: number | null; height: number | null; alt?: string };

/**
 * A dialog to upload an image or choose one from the workspace's library.
 * Picking an image (or finishing a single upload) calls `onSelect` and closes.
 *
 *   const [open, setOpen] = useState(false);
 *   <MediaPicker open={open} onOpenChange={setOpen} onSelect={(img) => setSrc(img.url)} />
 */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  title = "Choose an image",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: PickedMedia) => void;
  title?: string;
}): JSX.Element {
  function pick(asset: PickedMedia) {
    onSelect({ id: asset.id, url: asset.url, width: asset.width, height: asset.height });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Nearly full screen on phones, a roomy dialog on bigger screens. */}
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[calc(100%-1rem)] flex-col gap-4 overflow-hidden sm:max-h-[calc(100dvh-4rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Upload a new image or pick one you&apos;ve uploaded before.</DialogDescription>
        </DialogHeader>
        {/* The library only mounts while the dialog is open, so it loads fresh each time. */}
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-1">
          <MediaLibrary
            onSelect={pick}
            onUploaded={(asset, info) => {
              // Uploading a single image here almost always means "use this one".
              if (info.batchSize === 1) pick(asset);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
