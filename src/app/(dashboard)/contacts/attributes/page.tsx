import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { InfoIcon, LockIcon, TagsIcon } from "lucide-react";
import { AttributeActions } from "@/components/contacts/attributes/attribute-actions";
import { CreateAttributeDialog } from "@/components/contacts/attributes/create-attribute-dialog";
import { PersonalizationTag } from "@/components/contacts/attributes/personalization-tag";
import { PageContainer, PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ATTRIBUTE_TYPE_LABELS, BUILTIN_FIELDS } from "@/lib/contacts/common";
import { getAttributeDefinitions } from "@/lib/contacts/lookups";
import { requireActiveWorkspace } from "@/lib/workspace";
import { getAttributeUsage, getBuiltinFieldCounts } from "./data";

export const metadata: Metadata = { title: "Contact fields" };

export default function AttributesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Fields"
        description="The details you keep about each contact. Use them to personalise emails and build segments."
      />

      {/* Everything below depends on the workspace, so it streams in. */}
      <Suspense fallback={<FieldsSkeleton />}>
        <FieldsSections />
      </Suspense>
    </PageContainer>
  );
}

async function FieldsSections() {
  const ws = await requireActiveWorkspace();
  const [attributes, usage, builtinCounts] = await Promise.all([
    getAttributeDefinitions(ws.id),
    getAttributeUsage(ws.id),
    getBuiltinFieldCounts(ws.id),
  ]);

  return (
    <>
      <Section
        title="Built-in fields"
        description="Every contact has these. They can't be renamed or deleted."
      >
        <ul className="divide-y">
          {BUILTIN_FIELDS.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              fieldKey={field.key}
              type="Text"
              count={builtinCounts.get(field.key) ?? 0}
              actions={
                <span className="flex size-7 items-center justify-center text-zinc-400" title="Built-in field">
                  <LockIcon className="size-4" />
                  <span className="sr-only">Built-in field</span>
                </span>
              }
            />
          ))}
        </ul>
      </Section>

      <Section
        title="Custom fields"
        description="Fields you create, like City, Birthday or VIP."
        action={<CreateAttributeDialog existingKeys={attributes.map((a) => a.key)} />}
      >
        {attributes.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <TagsIcon className="size-6" />
            </span>
            <h3 className="mt-4 font-semibold text-zinc-900">No custom fields yet</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Create a field such as “City” to store it for each contact, then write{" "}
              <code className="rounded bg-zinc-100 px-1 font-mono text-xs">{"{{ contact.CITY }}"}</code> in an
              email to fill it in automatically.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {attributes.map((attribute) => (
              <FieldRow
                key={attribute.id}
                label={attribute.label}
                fieldKey={attribute.key}
                type={ATTRIBUTE_TYPE_LABELS[attribute.type]}
                count={usage.contactCounts.get(attribute.key) ?? 0}
                actions={
                  <AttributeActions
                    attribute={attribute}
                    contactCount={usage.contactCounts.get(attribute.key) ?? 0}
                    segmentCount={usage.segmentCounts.get(attribute.key) ?? 0}
                  />
                }
              />
            ))}
          </ul>
        )}

        <p className="flex gap-2 border-t bg-zinc-50 px-5 py-3 text-xs text-zinc-500">
          <InfoIcon className="mt-px size-3.5 shrink-0" />
          <span>
            You can rename a field at any time, but its key and type are fixed: your email templates and segments
            refer to the key, and changing the type would break the values already saved.
          </span>
        </p>
      </Section>
    </>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-zinc-900">{title}</h2>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldRow({
  label,
  fieldKey,
  type,
  count,
  actions,
}: {
  label: string;
  fieldKey: string;
  type: string;
  count: number;
  actions: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5 sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 sm:w-48 sm:shrink-0">
          <p className="truncate text-sm font-medium text-zinc-900">{label}</p>
          <p className="text-xs text-zinc-500">{type}</p>
        </div>
        <div className="min-w-0 flex-1">
          <PersonalizationTag fieldKey={fieldKey} />
        </div>
        <p className="text-xs text-zinc-500 sm:w-36 sm:text-right" title="Contacts with a value for this field">
          {count.toLocaleString()} {count === 1 ? "contact has" : "contacts have"} a value
        </p>
      </div>
      {actions}
    </li>
  );
}

function FieldsSkeleton() {
  return (
    <>
      {[3, 2].map((rows, i) => (
        <div key={i} className="rounded-xl border bg-white">
          <div className="border-b px-5 py-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-64" />
          </div>
          {Array.from({ length: rows }, (_, j) => (
            <div key={j} className="flex items-center gap-4 border-b px-5 py-4 last:border-0">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
