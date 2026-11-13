import type { ReactNode } from "react";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Small building blocks for the API docs page, so the page itself reads like
// the documentation it is. All server components (no JavaScript).

export function DocSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    // scroll-mt: leaves room for the sticky header when you jump to #id.
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t border-zinc-100 pt-10 first:border-0 first:pt-0">
      <h2 id={`${id}-title`} className="group text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
        <a href={`#${id}`} className="outline-none focus-visible:underline">
          {title}
          <span className="ml-2 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
            #
          </span>
        </a>
      </h2>
      <div className="mt-4 flex flex-col gap-4 text-[15px] leading-7 text-zinc-700">{children}</div>
    </section>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-base font-semibold text-zinc-900">{children}</h3>;
}

/** Inline code, e.g. <C>params</C>. */
export function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] break-words text-zinc-800">{children}</code>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-sky-50 text-sky-700 ring-sky-600/20",
  POST: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PATCH: "bg-amber-50 text-amber-700 ring-amber-600/20",
  DELETE: "bg-red-50 text-red-700 ring-red-600/20",
};

/** "POST /api/v1/emails" as a coloured pill + path. */
export function Endpoint({ method, path, children }: { method: string; path: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-zinc-50/60 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("rounded-md px-2 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset", METHOD_COLORS[method])}>
          {method}
        </span>
        <code className="min-w-0 font-mono text-sm break-all text-zinc-900">{path}</code>
      </div>
      {children && <span className="text-sm text-zinc-500 sm:ml-auto">{children}</span>}
    </div>
  );
}

export type Field = {
  name: string;
  type: string;
  required?: boolean | string;
  children: ReactNode;
};

/**
 * A list of fields with types and descriptions. A list (not a table), so it
 * reads well on a phone without scrolling sideways.
 */
export function FieldList({ fields }: { fields: Field[] }) {
  return (
    <dl className="divide-y rounded-xl border">
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5 px-4 py-3">
          <dt className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="font-mono text-sm font-semibold text-zinc-900">{f.name}</code>
            <span className="font-mono text-xs text-zinc-500">{f.type}</span>
            {f.required === true && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                required
              </span>
            )}
            {typeof f.required === "string" && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[11px] font-medium text-zinc-600">{f.required}</span>
            )}
          </dt>
          <dd className="text-sm leading-6 text-zinc-600">{f.children}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title?: string; children: ReactNode }) {
  const Icon = tone === "warn" ? TriangleAlertIcon : InfoIcon;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm leading-6",
        tone === "warn" ? "border-amber-200 bg-amber-50/70 text-amber-950" : "border-emerald-200 bg-emerald-50/60 text-emerald-950",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-amber-600" : "text-emerald-600")} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/** A simple two/three-column table that scrolls inside itself on narrow screens. */
export function DocTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((cells, i) => (
            <tr key={i} className="align-top">
              {cells.map((cell, j) => (
                <td key={j} className={cn("px-4 py-2.5", j === 0 ? "whitespace-nowrap text-zinc-900" : "text-zinc-600")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
