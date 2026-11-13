"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// "Export (.csv)" on Statistics: downloads the numbers for the date range on
// screen. The file comes from GET /api/statistics/export, which checks the
// login and only reads the active workspace. Because the server answers with
// "Content-Disposition: attachment", the browser saves the file and stays on
// this page.

export function ExportMenu({ search }: { search: string }) {
  const href = (type: "daily" | "campaigns") => `/api/statistics/export?${search}&type=${type}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download aria-hidden />
        Export (.csv)
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Real links (rendered as the menu items), so the browser handles the download. */}
        <DropdownMenuItem render={<a href={href("daily")} download />}>Numbers per day</DropdownMenuItem>
        <DropdownMenuItem render={<a href={href("campaigns")} download />}>Campaigns in this period</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
