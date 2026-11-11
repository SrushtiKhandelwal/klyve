"use client";

import { useState } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Ada Lovelace" → "AL", "ada" → "A". Falls back to the email's first letter. */
function getInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0];
  return (letters || email[0] || "?").toUpperCase();
}

/** Avatar + name at the bottom of the sidebar, with a "Sign out" option. */
export function UserMenuDropdown({ name, email }: { name: string; email: string }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await signOut();
    if (error) {
      // Still logged in (e.g. network problem): let them try again.
      setSigningOut(false);
      return;
    }
    // FULL page load: wipes everything the browser kept in memory about this
    // user, so the next person on this computer can't see any of it.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional: auth change needs a clean page load
    window.location.assign("/login");
  }

  const initials = getInitials(name, email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={name || email}
        className="flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors outline-none hover:bg-zinc-100 focus-visible:ring-3 focus-visible:ring-emerald-500/40 data-popup-open:bg-zinc-100 md:max-lg:justify-center md:max-lg:px-0"
      >
        <Avatar>
          <AvatarFallback className="bg-emerald-600 text-xs font-medium text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col md:max-lg:sr-only">
          <span className="truncate text-sm font-medium text-zinc-900">{name}</span>
          <span className="truncate text-xs text-zinc-500">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-zinc-400 md:max-lg:hidden" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            <span className="truncate font-normal">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="py-1.5"
          disabled={signingOut}
          // Keep the menu open so "Signing out…" is visible.
          closeOnClick={false}
          onClick={handleSignOut}
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
