import type { ReactNode } from "react";

/**
 * A small, non-interactive picture of a form for the /forms cards: the real
 * form rendered at double width, then shrunk to half size, so it looks like
 * a miniature of the real thing. `inert` keeps it out of Tab order and away
 * from screen readers (the card's name says what it is).
 */
export function FormThumbnail({ children }: { children: ReactNode }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100" aria-hidden inert>
      <div className="pointer-events-none absolute top-0 left-0 w-[200%] origin-top-left scale-50 px-10 pt-8 select-none">
        {children}
      </div>
      {/* Fade the bottom so a tall form ends softly instead of being cut. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-100 to-transparent" />
    </div>
  );
}
