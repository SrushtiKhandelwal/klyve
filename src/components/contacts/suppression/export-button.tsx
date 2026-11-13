import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Downloads the whole list as CSV. A plain link to the export Route Handler,
 * which checks the user's role and workspace itself.
 */
export function ExportSuppressionsButton() {
  return (
    // A normal <a download>, not next/link: it's a file, not a page.
    <a href="/contacts/suppression/export" download className={cn(buttonVariants({ variant: "outline" }), "bg-white")}>
      <Download aria-hidden />
      Export CSV
    </a>
  );
}
