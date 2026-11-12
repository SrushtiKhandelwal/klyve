import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { BrandKitForm } from "@/components/settings/brand/brand-kit-form";
import { emptySocialLinks, type BrandFormValues } from "@/components/settings/brand/brand-values";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND_LIMITS, coerceFont, getBrandKit } from "@/lib/brand-kit";
import { requireActiveWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Brand" };

export default function BrandSettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Brand"
        description="Your logo, colours, font and footer details. New emails start in your brand automatically."
      />
      {/* Depends on the logged-in user's workspace, so it streams in. */}
      <Suspense fallback={<BrandSkeleton />}>
        <BrandSection />
      </Suspense>
    </PageContainer>
  );
}

async function BrandSection() {
  const ws = await requireActiveWorkspace();
  const kit = await getBrandKit(ws);

  // Plain strings for the form ("" = empty), every network present.
  const initial: BrandFormValues = {
    companyName: kit.companyName,
    logoUrl: kit.logoUrl ?? "",
    primaryColor: kit.primaryColor,
    secondaryColor: kit.secondaryColor,
    backgroundColor: kit.backgroundColor,
    textColor: kit.textColor,
    fontFamily: coerceFont(kit.fontFamily), // always one of the dropdown options
    address: kit.address,
    websiteUrl: kit.websiteUrl ?? "",
    socialLinks: { ...emptySocialLinks(), ...kit.socialLinks },
  };

  return <BrandKitForm initial={initial} canManage={ws.role === "OWNER" || ws.role === "ADMIN"} limits={BRAND_LIMITS} />;
}

function BrandSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3 rounded-xl border bg-white p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
