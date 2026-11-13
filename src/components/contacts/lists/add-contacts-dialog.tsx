"use client";

import { useActionState, useState } from "react";
import { Loader2, TriangleAlert, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { addEmailsToList, type AddEmailsState, type AddEmailsSummary } from "@/app/actions/lists";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCount, pluralize } from "./format";
import { MAX_EMAILS_PER_ADD, splitEmailInput } from "./list-rules";

/** "Add contacts" button + dialog for pasting email addresses into a list. */
export function AddContactsDialog({ listId, listName }: { listId: string; listName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-emerald-600 text-white hover:bg-emerald-700"
      >
        <UserPlus aria-hidden />
        Add contacts
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add contacts to “{listName}”</DialogTitle>
            <DialogDescription>
              Paste email addresses, one per line or separated by commas. Up to{" "}
              {formatCount(MAX_EMAILS_PER_ADD)} at a time.
            </DialogDescription>
          </DialogHeader>
          {/* Inside the dialog, so the form starts fresh every time it opens. */}
          <AddContactsForm listId={listId} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddContactsForm({ listId, onDone }: { listId: string; onDone: () => void }) {
  // Controlled, so we can show a live count and keep the text after submitting.
  const [emails, setEmails] = useState("");
  const [createMissing, setCreateMissing] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (prev: AddEmailsState, formData: FormData): Promise<AddEmailsState> => {
      const result = await addEmailsToList(listId, prev, formData);
      if (result?.success && result.summary) {
        showSummaryToast(result.summary);
        // Everything worked: close. Otherwise stay open to show the problems.
        if (!hasProblems(result.summary)) onDone();
      }
      return result;
    },
    undefined,
  );

  const entryCount = splitEmailInput(emails).length;
  const tooMany = entryCount > MAX_EMAILS_PER_ADD;
  const summary = state?.success ? state.summary : undefined;

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`add-emails-${listId}`}>Email addresses</Label>
        <Textarea
          id={`add-emails-${listId}`}
          name="emails"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={"priya@example.com\nalex@example.com, sam@example.com"}
          rows={7}
          autoFocus
          spellCheck={false}
          readOnly={pending}
          // field-sizing-content would grow forever with 1000 lines; cap the height.
          className="max-h-64 font-mono text-xs md:text-xs"
          aria-describedby={`add-emails-${listId}-count`}
        />
        <p
          id={`add-emails-${listId}-count`}
          className={tooMany ? "text-sm text-destructive" : "text-sm text-zinc-500"}
        >
          {tooMany
            ? `${formatCount(entryCount)} entries: please add at most ${formatCount(MAX_EMAILS_PER_ADD)} at a time.`
            : entryCount === 0
              ? "Duplicates are ignored."
              : `${pluralize(entryCount, "entry", "entries")} found. Duplicates are ignored.`}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-zinc-50/60 p-3">
        <Checkbox
          id={`add-emails-${listId}-create`}
          name="createMissing"
          checked={createMissing}
          onCheckedChange={(checked) => setCreateMissing(checked)}
          disabled={pending}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`add-emails-${listId}-create`}>Also create missing contacts</Label>
          <p className="text-xs text-zinc-500">
            Emails that aren’t contacts yet become new subscribed contacts. Only do this for people
            who agreed to hear from you.
          </p>
        </div>
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {summary && <ProblemReport summary={summary} />}

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
          {summary ? "Close" : "Cancel"}
        </DialogClose>
        <Button
          type="submit"
          disabled={pending || entryCount === 0 || tooMany}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Adding…" : "Add to list"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function showSummaryToast(s: AddEmailsSummary) {
  const parts = [`${formatCount(s.added)} added`];
  if (s.alreadyInList > 0) parts.push(`${formatCount(s.alreadyInList)} already in list`);
  if (s.created > 0) parts.push(`${formatCount(s.created)} created`);
  if (s.invalidCount > 0) parts.push(`${formatCount(s.invalidCount)} invalid`);
  if (s.notFoundCount > 0) parts.push(`${formatCount(s.notFoundCount)} not found`);
  if (s.suppressedCount) parts.push(`${formatCount(s.suppressedCount)} suppressed`);
  const description = parts.join(" · ");

  if (s.added > 0) {
    toast.success(`${pluralize(s.added, "contact")} added to the list`, { description });
  } else {
    toast.info("No new contacts were added", { description });
  }
}

/** Anything the user should look at before the dialog closes. */
function hasProblems(s: AddEmailsSummary): boolean {
  return s.invalidCount > 0 || s.notFoundCount > 0 || (s.suppressedCount ?? 0) > 0;
}

/** Lists the emails we couldn't add, so the user can fix them. */
function ProblemReport({ summary }: { summary: AddEmailsSummary }) {
  if (!hasProblems(summary)) return null;
  const suppressedCount = summary.suppressedCount ?? 0;

  return (
    <div
      role="status"
      className="flex max-h-48 min-w-0 flex-col gap-3 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {summary.invalidCount > 0 && (
        <ProblemGroup
          title={`${pluralize(summary.invalidCount, "entry", "entries")} ${summary.invalidCount === 1 ? "isn’t" : "aren’t"} a valid email`}
          items={summary.invalid}
          total={summary.invalidCount}
        />
      )}
      {summary.notFoundCount > 0 && (
        <ProblemGroup
          title={`${pluralize(summary.notFoundCount, "email")} ${summary.notFoundCount === 1 ? "isn’t" : "aren’t"} a contact yet`}
          hint="Tick “Also create missing contacts” and add again to create them."
          items={summary.notFound}
          total={summary.notFoundCount}
        />
      )}
      {suppressedCount > 0 && (
        <ProblemGroup
          title={`${pluralize(suppressedCount, "email")} skipped: on your suppression list`}
          hint="These addresses must never be emailed, so they weren't created as contacts."
          items={summary.suppressed ?? []}
          total={suppressedCount}
        />
      )}
    </div>
  );
}

function ProblemGroup({
  title,
  hint,
  items,
  total,
}: {
  title: string;
  hint?: string;
  items: string[];
  total: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {title}
      </p>
      {hint && <p className="text-xs text-amber-800">{hint}</p>}
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="max-w-full truncate rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs ring-1 ring-amber-200"
          >
            {item}
          </li>
        ))}
        {total > items.length && (
          <li className="px-1.5 py-0.5 text-xs">and {formatCount(total - items.length)} more</li>
        )}
      </ul>
    </div>
  );
}
