"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createContact, type ContactFormResult } from "@/app/actions/contacts";
import type { AttributeDefinition, ListOption } from "@/lib/contacts/lookups";
import { ContactAttributeFields } from "@/components/contacts/contact-attribute-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** "Add contact" button + the dialog it opens. */
export function ContactCreateDialog({
  lists,
  attributes,
  variant = "default",
}: {
  lists: ListOption[];
  attributes: AttributeDefinition[];
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  // Changing the key gives a brand-new empty form each time the dialog opens.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger render={<Button variant={variant} />}>
        <Plus aria-hidden />
        Add contact
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>Add one person by hand. To add many, use Import.</DialogDescription>
        </DialogHeader>
        <CreateContactForm
          key={formKey}
          lists={lists}
          attributes={attributes}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const STATUS_ITEMS = [
  { value: "SUBSCRIBED", label: "Subscribed" },
  { value: "UNSUBSCRIBED", label: "Unsubscribed" },
];

function CreateContactForm({
  lists,
  attributes,
  onDone,
}: {
  lists: ListOption[];
  attributes: AttributeDefinition[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ContactFormResult | null>(null);
  const [status, setStatus] = useState("SUBSCRIBED");
  const errors = result && !result.ok ? result.errors : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // We send the form ourselves (instead of <form action>) so the inputs
    // keep what the user typed if the server finds a problem.
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const res = await createContact(formData);
        setResult(res);
        if (res.ok) {
          toast.success(res.message, {
            action: { label: "View", onClick: () => router.push(`/contacts/${res.contactId}`) },
          });
          onDone();
        }
      } catch {
        setResult({ ok: false, message: "Couldn't reach the server. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field id="new-contact-email" label="Email" error={errors?.email?.[0]}>
        <Input
          id="new-contact-email"
          name="email"
          type="email"
          autoComplete="off"
          autoFocus
          required
          maxLength={254}
          placeholder="priya@example.com"
          disabled={pending}
          aria-invalid={errors?.email ? true : undefined}
          aria-describedby={errors?.email ? "new-contact-email-error" : undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-contact-first" label="First name" error={errors?.firstName?.[0]}>
          <Input id="new-contact-first" name="firstName" maxLength={100} disabled={pending} />
        </Field>
        <Field id="new-contact-last" label="Last name" error={errors?.lastName?.[0]}>
          <Input id="new-contact-last" name="lastName" maxLength={100} disabled={pending} />
        </Field>
      </div>

      <ContactAttributeFields
        attributes={attributes}
        errors={errors}
        idPrefix="new-contact-attr"
        disabled={pending}
      />

      <Field id="new-contact-status" label="Status" error={errors?.status?.[0]}>
        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(v) => setStatus(v ?? "SUBSCRIBED")}
          disabled={pending}
        >
          <SelectTrigger id="new-contact-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name="status" value={status} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Add to lists</legend>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No lists yet.{" "}
            <Link href="/contacts/lists" className="font-medium text-emerald-700 hover:underline">
              Create a list
            </Link>
          </p>
        ) : (
          <div className="flex max-h-40 flex-col gap-2.5 overflow-y-auto rounded-lg border p-3">
            {lists.map((list) => (
              <Label key={list.id} className="cursor-pointer font-normal">
                <Checkbox name="listIds" value={list.id} disabled={pending} />
                <span className="truncate">{list.name}</span>
              </Label>
            ))}
          </div>
        )}
        {errors?.listIds && <p className="text-sm text-destructive">{errors.listIds[0]}</p>}
      </fieldset>

      {result && !result.ok && result.message && (
        <p role="alert" className="text-sm text-destructive">
          {result.message}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Adding…" : "Add contact"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
