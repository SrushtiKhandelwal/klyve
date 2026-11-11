"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CopyIcon, GlobeIcon, PlusIcon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { addDkimSelector, checkDomainDns, deleteDomain, removeDkimSelector } from "@/app/actions/domains";
import { useCountdown } from "@/components/settings/senders/use-now";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CheckStatus, DomainCheckResult, ExampleRecord, RecordCheck } from "@/lib/email/dns-check";
import { FREE_MAIL_NOTE } from "./free-mail";
import { RelativeTime } from "./relative-time";

export type DomainView = {
  id: string;
  domain: string;
  /** Selectors the user added. */
  dkimSelectors: string[];
  /** Selectors checked automatically because of the workspace's providers. */
  selectorHints: string[];
  lastResult: DomainCheckResult | null;
  lastCheckedAt: string | null;
  freeMail: boolean;
};

/** Must match DOMAIN_RULES.checkCooldownSeconds (the server enforces it). */
const CHECK_COOLDOWN_SECONDS = 30;

const STATUS_META: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  warning: { label: "Warning", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  missing: { label: "Missing", className: "bg-red-50 text-red-700 ring-red-600/20" },
  unknown: { label: "Couldn't check", className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20" },
};

function StatusPill({ status, label }: { status: CheckStatus; label?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.className,
      )}
    >
      {label ?? meta.label}
    </span>
  );
}

export function DomainCard({ domain, canManage }: { domain: DomainView; canManage: boolean }) {
  const result = domain.lastResult;

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h2 className="flex min-w-0 items-center gap-2 font-semibold text-zinc-900">
            <GlobeIcon className="size-4 shrink-0 text-emerald-600" />
            <span className="break-all">{domain.domain}</span>
          </h2>
          <p className="text-xs text-zinc-500">
            {domain.lastCheckedAt ? (
              <>
                Last checked <RelativeTime iso={domain.lastCheckedAt} />
              </>
            ) : (
              "Not checked yet"
            )}
          </p>
          {result && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <StatusPill status={result.spf.status} label={`SPF: ${STATUS_META[result.spf.status].label}`} />
              <StatusPill status={result.dkim.status} label={`DKIM: ${STATUS_META[result.dkim.status].label}`} />
              <StatusPill status={result.dmarc.status} label={`DMARC: ${STATUS_META[result.dmarc.status].label}`} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <CheckButton domainId={domain.id} lastCheckedAt={domain.lastCheckedAt} />
          {canManage && <DeleteDomainButton domain={domain} />}
        </div>
      </header>

      {domain.freeMail && <p className="border-b bg-amber-50 px-5 py-3 text-xs text-amber-800">{FREE_MAIL_NOTE}</p>}
      {result && !result.domainExists && (
        <p className="border-b bg-red-50 px-5 py-3 text-sm text-red-700">
          DNS says {domain.domain} doesn&apos;t exist. Check the spelling, or that the domain is registered.
        </p>
      )}

      {result ? (
        <div className="divide-y">
          <RecordSection title="SPF" subtitle="Which servers may send for your domain" check={result.spf} />
          <RecordSection title="DKIM" subtitle="A signature proving the email wasn't changed" check={result.dkim}>
            {result.dkim.selectors.length > 0 && (
              <ul className="grid gap-1.5">
                {result.dkim.selectors.map((s) => (
                  <li key={s.selector} className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusPill status={s.status} />
                    <code className="font-mono break-all text-zinc-700">{s.host}</code>
                    {s.found[0]?.startsWith("CNAME") && <span className="break-all text-zinc-500">{s.found[0]}</span>}
                  </li>
                ))}
              </ul>
            )}
            <SelectorEditor domain={domain} canManage={canManage} />
          </RecordSection>
          <RecordSection
            title="DMARC"
            subtitle={result.dmarc.policy ? `Policy: ${result.dmarc.policy}` : "What inboxes do when checks fail"}
            check={result.dmarc}
          />
          <RecordSection title="MX" subtitle="Info only: lets your domain receive replies" check={result.mx} info />
        </div>
      ) : (
        <div className="grid gap-3 px-5 py-6">
          <p className="text-sm text-zinc-500">Press “Check DNS” to see how this domain is set up.</p>
          <SelectorEditor domain={domain} canManage={canManage} />
        </div>
      )}
    </section>
  );
}

function RecordSection({
  title,
  subtitle,
  check,
  info,
  children,
}: {
  title: string;
  subtitle: string;
  check: RecordCheck;
  info?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
          <span className="font-medium text-zinc-900">{title}</span>
          {info ? (
            <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {check.status === "pass" ? "Found" : check.status === "unknown" ? "Couldn't check" : "None"}
            </span>
          ) : (
            <StatusPill status={check.status} />
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-sm text-zinc-800">{check.summary}</p>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>

      {check.found.length > 0 && (
        <details className="group rounded-lg bg-zinc-50 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-zinc-600 select-none">
            What we found ({check.found.length}) at <code className="font-mono">{check.host}</code>
          </summary>
          <ul className="mt-2 grid gap-1">
            {check.found.map((f, i) => (
              <li key={i} className="font-mono break-all text-zinc-700">
                {f}
              </li>
            ))}
          </ul>
        </details>
      )}

      {check.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-600">
          {check.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {check.howToFix && (
        <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs font-semibold text-amber-900">How to fix</p>
          <p className="text-xs text-amber-900">{check.howToFix}</p>
          {check.example && <ExampleRecordBox record={check.example} />}
        </div>
      )}

      {children}
    </div>
  );
}

function ExampleRecordBox({ record }: { record: ExampleRecord }) {
  return (
    <div className="grid gap-1.5 rounded-md bg-white p-2.5 text-xs ring-1 ring-amber-200">
      <p className="text-[11px] tracking-wide text-zinc-500 uppercase">Example record</p>
      <dl className="grid gap-1.5">
        <CopyRow label="Type" value={record.type} />
        <CopyRow label="Name / Host" value={record.host} />
        <CopyRow label="Value" value={record.value} />
      </dl>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-20 shrink-0 pt-0.5 text-zinc-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-mono break-all text-zinc-800">{value}</dd>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Copy ${label}`}
        title="Copy"
        onClick={() => {
          navigator.clipboard.writeText(value).then(
            () => toast.success(`${label} copied.`),
            () => toast.error("Couldn't copy. Select the text and copy it instead."),
          );
        }}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

function CheckButton({ domainId, lastCheckedAt }: { domainId: string; lastCheckedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const wait = useCountdown(lastCheckedAt, CHECK_COOLDOWN_SECONDS);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || wait > 0}
      onClick={() =>
        startTransition(async () => {
          const result = await checkDomainDns(domainId);
          if (result.ok) toast.success("DNS checked.");
          else toast.error(result.error);
        })
      }
    >
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      {pending ? "Checking…" : wait > 0 ? `Check again in ${wait}s` : "Check DNS"}
    </Button>
  );
}

function SelectorEditor({ domain, canManage }: { domain: DomainView; canManage: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoOnly = domain.selectorHints.filter((s) => !domain.dkimSelectors.includes(s));

  function add(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addDkimSelector(domain.id, value);
      if (result.ok) {
        setValue("");
        setError(null);
        toast.success("Selector added. Press “Check DNS” to look it up.");
      } else {
        setError(result.error);
      }
    });
  }

  function remove(selector: string) {
    startTransition(async () => {
      const result = await removeDkimSelector(domain.id, selector);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <p className="text-xs font-medium text-zinc-700">DKIM selectors</p>
      <p className="text-xs text-zinc-500">
        The selector is the part before <code className="font-mono">._domainkey</code> in the DKIM record your
        provider gave you (e.g. <code className="font-mono">s1</code>, <code className="font-mono">resend</code>).
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {domain.dkimSelectors.map((s) => (
          <li
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-0.5 pr-1 pl-2.5 font-mono text-xs text-emerald-800"
          >
            {s}
            {canManage && (
              <button
                type="button"
                onClick={() => remove(s)}
                disabled={pending}
                className="rounded-full p-0.5 hover:bg-emerald-100 disabled:opacity-50"
                aria-label={`Remove selector ${s}`}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </li>
        ))}
        {autoOnly.map((s) => (
          <li
            key={s}
            className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 font-mono text-xs text-zinc-600"
            title="Checked automatically because of your sending provider"
          >
            {s} <span className="ml-1 font-sans text-zinc-400">auto</span>
          </li>
        ))}
        {domain.dkimSelectors.length === 0 && autoOnly.length === 0 && (
          <li className="text-xs text-zinc-400">None yet.</li>
        )}
      </ul>
      {canManage && (
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="Add a selector, e.g. s1"
            aria-label="New DKIM selector"
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            className="h-8 sm:max-w-xs"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !value.trim()}>
            <PlusIcon />
            Add selector
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DeleteDomainButton({ domain }: { domain: DomainView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-zinc-500 hover:text-red-600"
            aria-label={`Remove ${domain.domain}`}
            title="Remove"
          />
        }
      >
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {domain.domain}?</AlertDialogTitle>
          <AlertDialogDescription>
            This only removes it from this page (and its saved selectors). Your DNS and your senders are not
            changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteDomain(domain.id);
                if (result.ok) {
                  toast.success(`${domain.domain} removed.`);
                  setOpen(false);
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            {pending ? "Removing…" : "Remove domain"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
