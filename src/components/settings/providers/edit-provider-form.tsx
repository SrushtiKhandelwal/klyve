"use client";

import type { ProviderTypeValue } from "@/lib/email/provider-configs";
import { ProviderForm, type ProviderFormInitial } from "./provider-form";

/**
 * The edit page's form. A thin client wrapper because the page (a Server
 * Component) can't pass the `onSaved` callback itself. After saving, the
 * form shows the new test result and the Server Action refreshes the page.
 */
export function EditProviderForm({
  providerId,
  type,
  initial,
  showDevPresets,
}: {
  providerId: string;
  type: ProviderTypeValue;
  initial: ProviderFormInitial;
  showDevPresets: boolean;
}) {
  return (
    <ProviderForm
      providerId={providerId}
      type={type}
      initial={initial}
      showDevPresets={showDevPresets}
      onSaved={() => {}}
    />
  );
}
