import type { ReactNode } from "react";

/** Wraps every dashboard page so spacing and max width are the same everywhere. */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      {children}
    </div>
  );
}

/** Big page title with an optional one-line description underneath. */
export function PageHeader({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
        {title}
      </h1>
      {description && <p className="text-sm text-zinc-500 sm:text-base">{description}</p>}
    </div>
  );
}
