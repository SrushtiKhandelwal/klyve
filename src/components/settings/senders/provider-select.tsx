"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProviderOption } from "./types";

/** "Send through" dropdown listing the workspace's providers. */
export function ProviderSelect({
  id,
  providers,
  value,
  onChange,
  error,
}: {
  id: string;
  providers: ProviderOption[];
  value: string;
  onChange: (providerId: string) => void;
  error?: string;
}) {
  const items = providers.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.typeLabel})${p.isDefault ? " · default" : ""}`,
  }));

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Send through</Label>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(String(v))}>
        <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined}>
          <SelectValue placeholder="Choose a provider" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
