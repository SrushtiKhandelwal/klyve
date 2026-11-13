"use client";

import { useActionState, useState } from "react";
import { Switch } from "@base-ui/react/switch";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createList, updateList, type ListFormState } from "@/app/actions/lists";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from "./list-rules";

export type EditableList = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  publicName: string | null;
  publicDescription: string | null;
};

/**
 * The "Create list" / "Edit list" dialog.
 * Pass `list` to edit it; leave it out to create a new one.
 */
export function ListFormDialog({
  list,
  open,
  onOpenChange,
}: {
  list?: EditableList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? "Edit list" : "Create a list"}</DialogTitle>
          <DialogDescription>
            {list
              ? "Rename the list or change how subscribers see it. Its contacts stay the same."
              : "Group contacts you want to email together, like “Newsletter” or “Customers”."}
          </DialogDescription>
        </DialogHeader>
        {/* The form lives inside the dialog, so it starts fresh every time it opens. */}
        <ListForm list={list} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ListForm({ list, onDone }: { list?: EditableList; onDone: () => void }) {
  const router = useRouter();

  // useActionState gives us the server's last answer (errors), the function
  // to put on the <form>, and whether it's still running.
  const [state, formAction, pending] = useActionState(
    async (prev: ListFormState, formData: FormData): Promise<ListFormState> => {
      const result = list ? await updateList(list.id, prev, formData) : await createList(prev, formData);

      if (result?.success && result.list) {
        const saved = result.list;
        if (list) {
          toast.success("List saved");
        } else {
          toast.success(`“${saved.name}” created`, {
            description: "Next, add some contacts to it.",
            action: { label: "Open list", onClick: () => router.push(`/contacts/lists/${saved.id}`) },
          });
        }
        onDone();
      }
      return result;
    },
    undefined,
  );

  const nameErrors = state?.errors?.name;
  const descriptionErrors = state?.errors?.description;
  const publicNameErrors = state?.errors?.publicName;
  const publicDescriptionErrors = state?.errors?.publicDescription;
  const idPrefix = list ? `edit-list-${list.id}` : "create-list";

  // Controlled so the public fields can appear/disappear as the switch moves.
  const [isPublic, setIsPublic] = useState(state?.values?.isPublic ?? list?.isPublic ?? false);
  // Shown as a hint in the public name box: what subscribers see if it's left empty.
  const [nameDraft, setNameDraft] = useState(state?.values?.name ?? list?.name ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="e.g. Newsletter"
          autoComplete="off"
          autoFocus
          required
          maxLength={LIST_NAME_MAX}
          defaultValue={state?.values?.name ?? list?.name ?? ""}
          onChange={(e) => setNameDraft(e.target.value)}
          readOnly={pending}
          aria-invalid={nameErrors ? true : undefined}
          aria-describedby={nameErrors ? `${idPrefix}-name-error` : undefined}
        />
        {nameErrors && (
          <p id={`${idPrefix}-name-error`} className="text-sm text-destructive">
            {nameErrors[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-description`}>
          Description <span className="font-normal text-zinc-400">(optional)</span>
        </Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          placeholder="Who is in this list and what you send them"
          rows={3}
          maxLength={LIST_DESCRIPTION_MAX}
          defaultValue={state?.values?.description ?? list?.description ?? ""}
          readOnly={pending}
          aria-invalid={descriptionErrors ? true : undefined}
          aria-describedby={descriptionErrors ? `${idPrefix}-description-error` : undefined}
        />
        {descriptionErrors && (
          <p id={`${idPrefix}-description-error`} className="text-sm text-destructive">
            {descriptionErrors[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border bg-zinc-50/60 p-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idPrefix}-public`}>Show in preference centre</Label>
            <p id={`${idPrefix}-public-hint`} className="text-xs text-zinc-500">
              Subscribers can choose to join or leave this list from the link in your emails.
            </p>
          </div>
          {/* Base UI's Switch renders a hidden checkbox named "isPublic", so the
              form sends "on" when it's on and nothing when it's off. */}
          <Switch.Root
            id={`${idPrefix}-public`}
            name="isPublic"
            checked={isPublic}
            onCheckedChange={setIsPublic}
            disabled={pending}
            aria-describedby={`${idPrefix}-public-hint`}
            className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-zinc-300 p-0.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 data-[checked]:bg-emerald-600 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
          >
            <Switch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-4" />
          </Switch.Root>
        </div>

        {/* Hidden (not removed) when off, so what was typed is kept and saved. */}
        <div className={cn("flex flex-col gap-4", !isPublic && "hidden")}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-public-name`}>
              Public name <span className="font-normal text-zinc-400">(optional)</span>
            </Label>
            <Input
              id={`${idPrefix}-public-name`}
              name="publicName"
              placeholder={nameDraft.trim() || "Same as the list name"}
              autoComplete="off"
              maxLength={LIST_NAME_MAX}
              defaultValue={state?.values?.publicName ?? list?.publicName ?? ""}
              readOnly={pending}
              aria-invalid={publicNameErrors ? true : undefined}
              aria-describedby={`${idPrefix}-public-name-hint`}
            />
            <p id={`${idPrefix}-public-name-hint`} className="text-xs text-zinc-500">
              {publicNameErrors ? (
                <span className="text-destructive">{publicNameErrors[0]}</span>
              ) : (
                "What subscribers see. Leave empty to use the list name."
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${idPrefix}-public-description`}>
              Public description <span className="font-normal text-zinc-400">(optional)</span>
            </Label>
            <Textarea
              id={`${idPrefix}-public-description`}
              name="publicDescription"
              placeholder="e.g. Our monthly newsletter with tips and offers"
              rows={2}
              maxLength={LIST_DESCRIPTION_MAX}
              defaultValue={state?.values?.publicDescription ?? list?.publicDescription ?? ""}
              readOnly={pending}
              aria-invalid={publicDescriptionErrors ? true : undefined}
              aria-describedby={publicDescriptionErrors ? `${idPrefix}-public-description-error` : undefined}
            />
            {publicDescriptionErrors && (
              <p id={`${idPrefix}-public-description-error`} className="text-sm text-destructive">
                {publicDescriptionErrors[0]}
              </p>
            )}
          </div>
        </div>
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={pending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {list ? (pending ? "Saving…" : "Save changes") : pending ? "Creating…" : "Create list"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A "Create list" button that opens the dialog. */
export function CreateListButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("bg-emerald-600 text-white hover:bg-emerald-700", className)}
      >
        <Plus aria-hidden />
        Create list
      </Button>
      <ListFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
