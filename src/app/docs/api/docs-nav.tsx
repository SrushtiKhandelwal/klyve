"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// The "On this page" navigation for the API docs.
// Desktop: a sticky list on the left that highlights the section you're reading.
// Phones: a collapsible box above the content (no sideways scrolling).

export type DocsSection = { id: string; title: string; group: string };

/** Which section is currently at the top of the screen. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  // A string, so the effect only re-runs when the list really changes (not on every render).
  const idsKey = ids.join(" ");

  useEffect(() => {
    const elements = idsKey.split(" ").map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    // A section counts as "being read" when it crosses a thin band near the top of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [idsKey]);

  return active;
}

function groupSections(sections: DocsSection[]) {
  const groups: { name: string; items: DocsSection[] }[] = [];
  for (const s of sections) {
    const last = groups.at(-1);
    if (last && last.name === s.group) last.items.push(s);
    else groups.push({ name: s.group, items: [s] });
  }
  return groups;
}

export function DocsSideNav({ sections }: { sections: DocsSection[] }) {
  const active = useActiveSection(sections.map((s) => s.id));
  return (
    <nav aria-label="API documentation" className="flex flex-col gap-6 text-sm">
      {groupSections(sections).map((g) => (
        <div key={g.name}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">{g.name}</p>
          <ul className="flex flex-col border-l border-zinc-200">
            {g.items.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "location" : undefined}
                  className={cn(
                    "-ml-px block border-l-2 py-1 pl-3 transition-colors",
                    active === s.id
                      ? "border-emerald-600 font-medium text-emerald-700"
                      : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
                  )}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsMobileNav({ sections }: { sections: DocsSection[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-zinc-50/70 lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-zinc-900"
      >
        On this page
        <ChevronDown className={cn("size-4 text-zinc-500 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="grid grid-cols-1 gap-x-4 border-t px-4 py-3 text-sm sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} onClick={() => setOpen(false)} className="block py-1.5 text-zinc-600 hover:text-emerald-700">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
