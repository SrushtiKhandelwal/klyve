"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Loader2, MoreHorizontal, Palette, Pencil, Send, Trash2, Type, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { duplicateCampaignAction } from "@/app/actions/campaigns";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { DeleteCampaignDialog } from "@/components/campaigns/campaigns-list";
import { DesignThumbnail, FullPreviewButton, useDesignHtml } from "@/components/campaigns/design-preview";
import { CampaignTestDialog } from "@/components/campaigns/send-test-dialog";
import { people } from "@/components/campaigns/types";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { audienceIsEmpty, type Audience } from "@/lib/campaigns/audience";
import { documentWarnings, type EmailDocument, type MergeTag } from "@/lib/templates/document";
import { RecipientsEditor, useAudienceCount, type AudienceSources } from "./recipients-editor";
import { ReviewSection, type SectionId } from "./review-section";
import { SenderEditor, ProviderLine, senderText, type SenderChoice } from "./sender-editor";
import { SaveIndicator, SetupSection } from "./setup-section";
import { SubjectEditor } from "./subject-editor";
import { useDraftAutosave } from "./use-draft-autosave";

export type DraftCampaignView = {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  audience: Audience;
  senderId: string | null;
  document: EmailDocument | null;
  /** Phase 5 tracking switches (both on by default). */
  trackOpens: boolean;
  trackClicks: boolean;
  canDelete: boolean;
};

/**
 * The setup page of a DRAFT campaign: a checklist of steps (recipients,
 * sender, subject, design), each showing whether it's done, then "Review &
 * send". Every change saves automatically.
 */
export function CampaignSetup({
  campaign,
  sources,
  senders,
  mergeTags,
  userEmail,
  initialRecipientCount,
  limits,
}: {
  campaign: DraftCampaignView;
  sources: AudienceSources;
  senders: SenderChoice[];
  mergeTags: MergeTag[];
  userEmail: string;
  initialRecipientCount: number | null;
  limits: { nameMax: number; subjectMax: number; preheaderMax: number };
}) {
  const { state: saveState, save, flush, savedVersion } = useDraftAutosave(campaign.id);

  const [name, setName] = useState(campaign.name);
  const [audience, setAudience] = useState<Audience>(campaign.audience);
  const [senderId, setSenderId] = useState<string | null>(
    // A sender that's no longer verified/existing counts as "not chosen".
    senders.some((s) => s.id === campaign.senderId) ? campaign.senderId : null,
  );
  const [subject, setSubject] = useState(campaign.subject);
  const [preheader, setPreheader] = useState(campaign.preheader);
  const [testOpen, setTestOpen] = useState(false);
  const [tracking, setTracking] = useState({ trackOpens: campaign.trackOpens, trackClicks: campaign.trackClicks });

  const count = useAudienceCount(audience, initialRecipientCount);
  const sender = senders.find((s) => s.id === senderId) ?? null;
  const design = useDesignHtml(campaign.document, subject, preheader);
  const designIssues = campaign.document ? documentWarnings(campaign.document) : [];
  const designBlocked = !campaign.document || designIssues.some((w) => /unsubscribe link/i.test(w));

  const done: Record<SectionId, boolean> = {
    recipients: !audienceIsEmpty(audience) && !(count.kind === "ready" && count.recipients === 0) && count.kind !== "error",
    sender: !!sender && !!sender.provider && sender.provider.status !== "FAILED",
    subject: subject.trim().length > 0,
    design: !designBlocked,
  };

  // Start with the first unfinished step open, so it's obvious where to begin.
  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => {
    const first = (["recipients", "sender", "subject", "design"] as SectionId[]).find((s) => !done[s]);
    return { recipients: first === "recipients", sender: first === "sender", subject: first === "subject", design: first === "design" };
  });
  const toggle = (s: SectionId) => setOpen((o) => ({ ...o, [s]: !o[s] }));

  function openSection(s: SectionId) {
    setOpen((o) => ({ ...o, [s]: true }));
    requestAnimationFrame(() => document.getElementById(s)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const completed = Object.values(done).filter(Boolean).length;
  const audienceSummary = describeAudience(audience, sources);

  return (
    <div className="flex flex-col gap-6">
      <Header
        campaignId={campaign.id}
        name={name}
        nameMax={limits.nameMax}
        canDelete={campaign.canDelete}
        onRename={(next) => {
          setName(next);
          save({ name: next }, 0);
        }}
        saveIndicator={<SaveIndicator state={saveState} onRetry={() => void flush()} />}
      />

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200" aria-hidden>
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(completed / 4) * 100}%` }} />
        </div>
        <p className="shrink-0 text-xs font-medium text-zinc-500">{completed} of 4 steps done</p>
      </div>

      <div className="flex flex-col gap-3">
        <SetupSection
          id="recipients"
          icon={Users}
          title="Recipients"
          done={done.recipients}
          open={open.recipients}
          onToggle={() => toggle("recipients")}
          summary={
            audienceIsEmpty(audience) ? (
              "Choose the lists or segments to send to."
            ) : (
              <>
                {audienceSummary}
                {count.kind === "ready" && <span className="font-medium text-zinc-700"> · {people(count.recipients)}</span>}
                {count.kind === "error" && <span className="text-red-700"> · {count.message}</span>}
              </>
            )
          }
        >
          <RecipientsEditor
            audience={audience}
            sources={sources}
            count={count}
            onChange={(next) => {
              setAudience(next);
              save({ audience: next }, 300);
            }}
          />
        </SetupSection>

        <SetupSection
          id="sender"
          icon={UserRound}
          title="Sender"
          done={done.sender}
          open={open.sender}
          onToggle={() => toggle("sender")}
          summary={
            sender ? (
              <span className="flex flex-col gap-0.5">
                <span className="break-all">{senderText(sender)}</span>
                <ProviderLine provider={sender.provider} />
              </span>
            ) : senders.length === 0 ? (
              "Add and verify a sender address first."
            ) : (
              "Choose who the email comes from."
            )
          }
        >
          <SenderEditor
            senders={senders}
            value={senderId}
            onChange={(id) => {
              setSenderId(id);
              save({ senderId: id }, 0);
            }}
          />
        </SetupSection>

        <SetupSection
          id="subject"
          icon={Type}
          title="Subject"
          done={done.subject}
          open={open.subject}
          onToggle={() => toggle("subject")}
          summary={
            subject.trim() ? (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-zinc-700">{subject}</span>
                {preheader && <span className="truncate">{preheader}</span>}
              </span>
            ) : (
              "Write a subject line people want to open."
            )
          }
        >
          <SubjectEditor
            subject={subject}
            preheader={preheader}
            onSubjectChange={(v) => {
              setSubject(v);
              save({ subject: v });
            }}
            onPreheaderChange={(v) => {
              setPreheader(v);
              save({ preheader: v });
            }}
            mergeTags={mergeTags}
            campaignId={campaign.id}
            senderName={sender?.name || sender?.email || ""}
            limits={limits}
          />
        </SetupSection>

        <SetupSection
          id="design"
          icon={Palette}
          title="Design"
          done={done.design}
          open={open.design}
          onToggle={() => toggle("design")}
          summary={
            !campaign.document
              ? "Design your email in the editor."
              : designBlocked
                ? "Add an unsubscribe link (the Footer block has one)."
                : designIssues.length
                  ? `Ready · ${designIssues.length} small ${designIssues.length === 1 ? "thing" : "things"} to check`
                  : "Ready"
          }
        >
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="w-40 shrink-0 self-center overflow-hidden rounded-lg border sm:self-start">
              <DesignThumbnail state={design} title={`Preview of ${name}`} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {designIssues.length > 0 ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {designIssues.map((w) => (
                    <li
                      key={w}
                      className={/unsubscribe link/i.test(w) ? "text-red-700" : "text-amber-800"}
                    >
                      • {w}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600">
                  {campaign.document
                    ? "Your design is ready. Open the editor to change text, images or layout."
                    : "Open the editor to build your email."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/campaigns/${campaign.id}/design`}
                  className={buttonVariants()}
                  onClick={() => void flush()}
                >
                  <Pencil aria-hidden />
                  Edit design
                </Link>
                <FullPreviewButton state={design} title={subject || name} description="With sample details filled in." />
                <Button type="button" variant="outline" onClick={() => setTestOpen(true)}>
                  <Send aria-hidden />
                  Send a test email
                </Button>
              </div>
            </div>
          </div>
        </SetupSection>

        <ReviewSection
          campaignId={campaign.id}
          subject={subject}
          senderLabel={sender ? senderText(sender) : null}
          savedVersion={savedVersion}
          flush={flush}
          onFixSection={openSection}
          tracking={tracking}
          onTrackingChange={(patch) => {
            setTracking((t) => ({ ...t, ...patch }));
            save(patch, 0);
          }}
        />
      </div>

      <CampaignTestDialog
        campaignId={campaign.id}
        senderLabel={sender ? senderText(sender) : null}
        defaultTo={userEmail}
        open={testOpen}
        onOpenChange={setTestOpen}
        beforeSend={flush}
      />
    </div>
  );
}

/** "Newsletter, VIPs (segment) · not: Unengaged" */
function describeAudience(audience: Audience, sources: AudienceSources): string {
  const listName = (id: string) => sources.lists.find((l) => l.id === id)?.name ?? "a deleted list";
  const segmentName = (id: string) => `${sources.segments.find((s) => s.id === id)?.name ?? "a deleted segment"} (segment)`;
  const included = [...audience.listIds.map(listName), ...audience.segmentIds.map(segmentName)];
  const excluded = [...audience.excludeListIds.map(listName), ...audience.excludeSegmentIds.map(segmentName)];
  return included.join(", ") + (excluded.length ? ` · leaving out ${excluded.join(", ")}` : "");
}

function Header({
  campaignId,
  name,
  nameMax,
  canDelete,
  onRename,
  saveIndicator,
}: {
  campaignId: string;
  name: string;
  nameMax: number;
  canDelete: boolean;
  onRename: (name: string) => void;
  saveIndicator: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    else setDraft(name);
  }

  async function duplicate() {
    setDuplicating(true);
    try {
      const result = await duplicateCampaignAction(campaignId);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Campaign duplicated as a new draft.");
      router.push(`/campaigns/${result.id}`);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Link href="/campaigns" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden />
        Campaigns
      </Link>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {editing ? (
            <input
              autoFocus
              value={draft}
              maxLength={nameMax}
              aria-label="Campaign name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(name);
                  setEditing(false);
                }
              }}
              className="w-full max-w-xl rounded-md border border-emerald-500 bg-white px-2 py-1 text-2xl font-semibold tracking-tight text-zinc-900 ring-3 ring-emerald-500/20 outline-none"
            />
          ) : (
            <h1 className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                title="Rename"
                className="group inline-flex max-w-full items-center gap-2 rounded-md text-left text-2xl font-semibold tracking-tight text-zinc-900 outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/40 sm:text-3xl"
              >
                <span className="min-w-0 break-words">{name}</span>
                <Pencil className="size-4 shrink-0 text-zinc-400 opacity-60 group-hover:opacity-100" aria-hidden />
                <span className="sr-only">(rename)</span>
              </button>
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CampaignStatusBadge status="DRAFT" />
            {saveIndicator}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" disabled={duplicating} />}>
            {duplicating ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={duplicate}>
              <Copy aria-hidden />
              Duplicate
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden />
                  Delete draft
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DeleteCampaignDialog
        campaignId={campaignId}
        name={name}
        sent={false}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/campaigns")}
      />
    </div>
  );
}
