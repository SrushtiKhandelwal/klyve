"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createAttribute, type CreateAttributeState } from "@/app/actions/attributes";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ATTRIBUTE_TYPES,
  ATTRIBUTE_TYPE_LABELS,
  attributeKeySchema,
  toAttributeKey,
  type AttributeTypeValue,
} from "@/lib/contacts/common";

const TYPE_HINTS: Record<AttributeTypeValue, string> = {
  TEXT: "Any words, e.g. a city or job title.",
  NUMBER: "Whole or decimal numbers, e.g. age or points.",
  DATE: "A calendar date, e.g. a birthday.",
  BOOLEAN: "Yes or no, e.g. “VIP customer”.",
};

const TYPE_ITEMS = ATTRIBUTE_TYPES.map((t) => ({ value: t, label: ATTRIBUTE_TYPE_LABELS[t] }));

/** "Create field" button + dialog. `existingKeys` lets us warn about duplicates early. */
export function CreateAttributeDialog({ existingKeys }: { existingKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  // Until the user edits the key themselves, it follows the label.
  const [keyEdited, setKeyEdited] = useState(false);
  const [type, setType] = useState<AttributeTypeValue>("TEXT");

  function reset() {
    setLabel("");
    setKey("");
    setKeyEdited(false);
    setType("TEXT");
  }

  const [state, formAction, pending] = useActionState(
    async (prev: CreateAttributeState, formData: FormData) => {
      const result = await createAttribute(prev, formData);
      if (result?.success) {
        toast.success(`Field “${formData.get("label")}” created.`);
        setOpen(false);
        reset();
      }
      return result;
    },
    undefined,
  );

  // Instant feedback while typing (the server checks again on submit).
  const keyProblem =
    key === ""
      ? null
      : existingKeys.includes(key)
        ? `You already have a field with the key ${key}.`
        : (attributeKeySchema.safeParse(key).error?.issues[0]?.message ?? null);
  const keyError = keyProblem ?? state?.errors?.key?.[0];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Create field
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a custom field</DialogTitle>
          <DialogDescription>
            Store extra details about your contacts, like their city or birthday.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="attr-label">Name</Label>
            <Input
              id="attr-label"
              name="label"
              value={label}
              maxLength={60}
              placeholder="e.g. City"
              autoComplete="off"
              required
              aria-invalid={state?.errors?.label ? true : undefined}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!keyEdited) setKey(toAttributeKey(e.target.value));
              }}
            />
            {state?.errors?.label && <p className="text-xs text-red-600">{state.errors.label[0]}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="attr-key">Key</Label>
            <Input
              id="attr-key"
              name="key"
              value={key}
              maxLength={40}
              placeholder="CITY"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              required
              aria-invalid={keyError ? true : undefined}
              aria-describedby="attr-key-help"
              onChange={(e) => {
                setKeyEdited(true);
                // Keys are UPPER_SNAKE_CASE, so convert as the user types.
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
              }}
            />
            {keyError ? (
              <p className="text-xs text-red-600">{keyError}</p>
            ) : (
              <p id="attr-key-help" className="text-xs text-zinc-500">
                Used in emails as{" "}
                <code className="rounded bg-zinc-100 px-1 font-mono">{`{{ contact.${key || "KEY"} }}`}</code>.
                It can&apos;t be changed later.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="attr-type">Type</Label>
            <Select
              name="type"
              items={TYPE_ITEMS}
              value={type}
              onValueChange={(v) => v && setType(v as AttributeTypeValue)}
            >
              <SelectTrigger id="attr-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500">{TYPE_HINTS[type]} The type can&apos;t be changed later.</p>
          </div>

          {state?.message && <p className="text-sm text-red-600">{state.message}</p>}

          <DialogFooter>
            <Button type="submit" disabled={pending || !label.trim() || !key || keyProblem !== null}>
              {pending ? "Creating…" : "Create field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
