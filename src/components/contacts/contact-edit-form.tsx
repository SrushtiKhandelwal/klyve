"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateContact, type ContactFormResult } from "@/app/actions/contacts";
import type { AttributeValue } from "@/lib/contacts/common";
import type { AttributeDefinition } from "@/lib/contacts/lookups";
import { ContactAttributeFields } from "@/components/contacts/contact-attribute-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The "Details" card on a contact's page: email, names and custom fields. */
export function ContactEditForm({
  contact,
  attributes,
}: {
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    attributes: Record<string, AttributeValue>;
  };
  attributes: AttributeDefinition[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ContactFormResult | null>(null);
  const errors = result && !result.ok ? result.errors : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Sent by hand (not <form action>) so typed values stay if there's an error.
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const res = await updateContact(contact.id, formData);
        setResult(res);
        if (res.ok) toast.success(res.message);
      } catch {
        setResult({ ok: false, message: "Couldn't reach the server. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          required
          maxLength={254}
          defaultValue={contact.email}
          disabled={pending}
          aria-invalid={errors?.email ? true : undefined}
          aria-describedby={errors?.email ? "contact-email-error" : undefined}
        />
        {errors?.email && (
          <p id="contact-email-error" className="text-sm text-destructive">
            {errors.email[0]}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-first">First name</Label>
          <Input
            id="contact-first"
            name="firstName"
            maxLength={100}
            defaultValue={contact.firstName ?? ""}
            disabled={pending}
            aria-invalid={errors?.firstName ? true : undefined}
          />
          {errors?.firstName && <p className="text-sm text-destructive">{errors.firstName[0]}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact-last">Last name</Label>
          <Input
            id="contact-last"
            name="lastName"
            maxLength={100}
            defaultValue={contact.lastName ?? ""}
            disabled={pending}
            aria-invalid={errors?.lastName ? true : undefined}
          />
          {errors?.lastName && <p className="text-sm text-destructive">{errors.lastName[0]}</p>}
        </div>
      </div>

      {attributes.length > 0 && (
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <ContactAttributeFields
            attributes={attributes}
            values={contact.attributes}
            errors={errors}
            idPrefix="contact-attr"
            disabled={pending}
          />
        </div>
      )}

      {result && !result.ok && (result.message || errors) && (
        <p role="alert" className="text-sm text-destructive">
          {result.message ?? "Please fix the highlighted fields."}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
