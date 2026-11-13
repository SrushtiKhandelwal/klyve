"use client";

import { useMemo } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { encodeQr, qrSvgDocument, qrSvgPath, type QrCode } from "@/components/forms/embed/qr";

/** Light margin around the code, in modules. Scanners need at least 4. */
const QUIET_ZONE = 4;
/** Pixels per module in the downloaded PNG (a 33-module code → 410 px). */
const PNG_SCALE = 10;

/** Saves a Blob as a file via a temporary link (works in every modern browser). */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Draws the code on a canvas (black on white) and saves it as a PNG. */
function downloadPng(qr: QrCode, filename: string) {
  const dim = qr.size + QUIET_ZONE * 2;
  const canvas = document.createElement("canvas");
  canvas.width = dim * PNG_SCALE;
  canvas.height = dim * PNG_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    toast.error("Your browser couldn't create the image. Try the SVG download instead.");
    return;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) ctx.fillRect((x + QUIET_ZONE) * PNG_SCALE, (y + QUIET_ZONE) * PNG_SCALE, PNG_SCALE, PNG_SCALE);
    }
  }
  canvas.toBlob((blob) => {
    if (blob) saveBlob(blob, filename);
    else toast.error("Couldn't create the PNG. Try the SVG download instead.");
  }, "image/png");
}

/** "Website footer" → "website-footer" (for file names). */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "signup-form"
  );
}

/** A scannable QR code for the form's link, with PNG and SVG downloads. */
export function QrCodeCard({ url, formName }: { url: string; formName: string }) {
  // Encoding is pure maths, so it's done once per URL.
  const qr = useMemo(() => {
    try {
      return encodeQr(url);
    } catch {
      return null; // only if the URL were over ~200 characters
    }
  }, [url]);

  if (!qr) return <p className="text-sm text-zinc-500">This link is too long to turn into a QR code.</p>;

  const dim = qr.size + QUIET_ZONE * 2;
  const base = `${slug(formName)}-qr`;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-5">
      <svg
        viewBox={`0 0 ${dim} ${dim}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR code that opens ${url}`}
        className="size-44 shrink-0 rounded-lg border bg-white"
      >
        <rect width={dim} height={dim} fill="#ffffff" />
        <path d={qrSvgPath(qr, QUIET_ZONE)} fill="#000000" />
      </svg>
      <div className="flex flex-col gap-2 text-sm text-zinc-600">
        <p>
          Print it on flyers, posters, menus or packaging, or add it to an Instagram story. Pointing a phone camera at it opens
          your form.
        </p>
        <p className="text-xs text-zinc-500">
          Tip: print it at least 2&nbsp;cm (1&nbsp;inch) wide and keep the white border around it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => downloadPng(qr, `${base}.png`)}>
            <Download aria-hidden />
            Download PNG
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => saveBlob(new Blob([qrSvgDocument(qr, { border: QUIET_ZONE })], { type: "image/svg+xml" }), `${base}.svg`)}
          >
            <Download aria-hidden />
            Download SVG
          </Button>
        </div>
        <p className="text-xs text-zinc-500">SVG stays sharp at any size, so it&apos;s best for print.</p>
      </div>
    </div>
  );
}
