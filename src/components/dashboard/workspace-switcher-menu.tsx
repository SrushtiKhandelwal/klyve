"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { switchWorkspace } from "@/app/actions/workspace";
import type { ActiveWorkspace } from "@/lib/workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABELS: Record<ActiveWorkspace["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

/** Dropdown that shows the current workspace and lets the user pick another. */
export function WorkspaceSwitcherMenu({
  active,
  workspaces,
}: {
  active: ActiveWorkspace;
  workspaces: ActiveWorkspace[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(workspaceId: string) {
    if (workspaceId === active.id) return;
    setError(null);
    // A transition keeps the old UI on screen (with a spinner) until the
    // new workspace's data has loaded, instead of flashing empty states.
    startTransition(async () => {
      try {
        // The server checks membership again; we never trust the browser.
        const result = await switchWorkspace(workspaceId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Re-render the server parts of the page with the new workspace.
        router.refresh();
      } catch {
        // e.g. the network dropped or the server crashed.
        setError("Couldn't switch workspace. Please try again.");
      }
    });
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isPending}
          title={active.name}
          className="flex h-12 w-full items-center gap-2.5 rounded-lg border bg-white px-2 text-left shadow-xs transition-colors outline-none hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-3 focus-visible:ring-emerald-500/40 disabled:opacity-70 data-popup-open:bg-zinc-50 md:max-lg:justify-center md:max-lg:border-transparent md:max-lg:px-0 md:max-lg:shadow-none"
        >
          <WorkspaceInitial name={active.name} />
          <span className="flex min-w-0 flex-1 flex-col md:max-lg:sr-only">
            <span className="truncate text-sm font-medium text-zinc-900">
              {active.name}
            </span>
            <span className="truncate text-xs text-zinc-500">
              {ROLE_LABELS[active.role]}
            </span>
          </span>
          {isPending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400 md:max-lg:hidden" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-zinc-400 md:max-lg:hidden" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={active.id} onValueChange={handleSelect}>
              {workspaces.map((w) => (
                <DropdownMenuRadioItem key={w.id} value={w.id} className="gap-2 py-1.5">
                  <WorkspaceInitial name={w.name} small />
                  <span className="truncate">{w.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="py-1.5" onClick={() => router.push("/onboarding")}>
            <Plus />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {error && (
        <p role="alert" className="mt-1.5 px-1 text-xs text-red-600 md:max-lg:hidden">
          {error}
        </p>
      )}
    </div>
  );
}

/** Coloured square with the workspace's first letter, like a mini logo. */
function WorkspaceInitial({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        small
          ? "flex size-5 shrink-0 items-center justify-center rounded bg-emerald-100 text-[10px] font-semibold text-emerald-700"
          : "flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-sm font-semibold text-emerald-700"
      }
    >
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}
