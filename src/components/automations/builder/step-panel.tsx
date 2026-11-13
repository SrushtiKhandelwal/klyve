"use client";

// The settings for whatever is selected in the flow chart: the trigger or one
// step. Each change is reported up straight away (the builder autosaves).
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CircleAlert, Paintbrush, Send, Trash2, Zap, type LucideIcon } from "lucide-react";
import { previewDocument } from "@/app/actions/render";
import { Glyph } from "@/components/brand/glyph";
import { MergeTagTextField } from "@/components/editor/controls";
import { EmailThumbnail } from "@/components/templates/email-thumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WAIT_UNITS,
  type AutomationCondition,
  type AutomationStep,
  type AutomationTrigger,
  type SendEmailStep,
} from "@/lib/automations/schema";
import type { MergeTag } from "@/lib/templates/document";
import { STEP_LABELS, TRIGGER_LABELS, fieldLabel, type Lookups } from "../describe";
import { STEP_ICONS, STEP_TONES } from "../icons";
import { Explainer, Picker, TextField, WholeNumberField, type Option } from "./fields";
import { emailStepsAbove, locateStep } from "./tree";

export type SenderOption = { id: string; label: string };

// ── Trigger ─────────────────────────────────────────────────────────────────

export function TriggerSettings({
  trigger,
  lookups,
  readOnly,
  onChange,
}: {
  trigger: AutomationTrigger;
  lookups: Lookups;
  readOnly: boolean;
  onChange: (trigger: AutomationTrigger) => void;
}) {
  const dateFields = lookups.attributes.filter((a) => a.type === "DATE");
  const typeOptions: Option[] = [
    { value: "list_joined", label: TRIGGER_LABELS.list_joined, disabled: lookups.lists.length === 0, hint: lookups.lists.length ? undefined : "Create a list first" },
    { value: "form_submitted", label: TRIGGER_LABELS.form_submitted, disabled: lookups.forms.length === 0, hint: lookups.forms.length ? undefined : "Create a form first" },
    { value: "contact_created", label: TRIGGER_LABELS.contact_created },
    { value: "date_anniversary", label: TRIGGER_LABELS.date_anniversary, disabled: dateFields.length === 0, hint: dateFields.length ? undefined : "Add a date field (like Birthday) first" },
    { value: "manual", label: TRIGGER_LABELS.manual },
  ];

  function changeType(type: string) {
    if (type === trigger.type) return;
    if (type === "list_joined" && lookups.lists[0]) onChange({ type, listId: lookups.lists[0].id });
    else if (type === "form_submitted" && lookups.forms[0]) onChange({ type, formId: lookups.forms[0].id });
    else if (type === "date_anniversary" && dateFields[0]) onChange({ type, attributeKey: dateFields[0].key, daysBefore: 0 });
    else if (type === "contact_created" || type === "manual") onChange({ type });
  }

  return (
    <PanelBody>
      <PanelTitle icon={Zap} title="Trigger" subtitle="What starts the automation for someone." />
      <Picker label="Start when someone…" value={trigger.type} options={typeOptions} onChange={changeType} disabled={readOnly} />

      {trigger.type === "list_joined" && (
        <>
          <Picker
            label="List"
            value={trigger.listId}
            options={lookups.lists.map((l) => ({ value: l.id, label: l.name }))}
            onChange={(listId) => onChange({ ...trigger, listId })}
            disabled={readOnly}
          />
          <Explainer>
            Starts when a <strong>subscribed</strong> contact is added to this list in any way: an import, a form, or by hand.
            People already on the list when you turn it on don&apos;t start (use <strong>Add people</strong> for them).
          </Explainer>
        </>
      )}

      {trigger.type === "form_submitted" && (
        <>
          <Picker
            label="Form"
            value={trigger.formId}
            options={lookups.forms.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(formId) => onChange({ ...trigger, formId })}
            disabled={readOnly}
          />
          <Explainer>
            Starts when someone signs up through this form. With double opt-in, it starts once they&apos;ve confirmed their
            email.
          </Explainer>
        </>
      )}

      {trigger.type === "contact_created" && (
        <Explainer>Starts for every new subscribed contact, however they were added (import, form, API or by hand).</Explainer>
      )}

      {trigger.type === "date_anniversary" && (
        <>
          <Picker
            label="Date field"
            value={trigger.attributeKey}
            options={dateFields.map((a) => ({ value: a.key, label: a.label }))}
            onChange={(attributeKey) => onChange({ ...trigger, attributeKey })}
            disabled={readOnly}
          />
          <WholeNumberField
            label="How many days before"
            value={trigger.daysBefore}
            min={0}
            max={30}
            onChange={(daysBefore) => onChange({ ...trigger, daysBefore })}
            disabled={readOnly}
            suffix={<span className="text-sm text-zinc-500">days (0 = on the day)</span>}
          />
          <Explainer>
            Runs once a year for each person, using only the day and month of this field (great for birthdays and
            anniversaries). People with the field empty are skipped.
          </Explainer>
        </>
      )}

      {trigger.type === "manual" && (
        <Explainer>
          Nobody starts automatically. Once it&apos;s on, use <strong>Add people</strong> at the top to put a list or segment
          through it, whenever you like.
        </Explainer>
      )}
    </PanelBody>
  );
}

// ── Steps ───────────────────────────────────────────────────────────────────

export type StepSettingsProps = {
  step: AutomationStep;
  steps: AutomationStep[];
  lookups: Lookups;
  senders: SenderOption[];
  mergeTags: MergeTag[];
  readOnly: boolean;
  onChange: (updater: (step: AutomationStep) => AutomationStep) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onEditDesign: () => void;
  onSendTest: () => void;
};

export function StepSettings(props: StepSettingsProps) {
  const { step, steps, readOnly, onMove, onDelete } = props;
  const Icon = STEP_ICONS[step.type];
  const loc = locateStep(steps, step.id);
  return (
    <PanelBody>
      <PanelTitle
        icon={Icon}
        tone={STEP_TONES[step.type]}
        title={STEP_LABELS[step.type]}
        subtitle={loc && loc.depth > 1 ? "Inside an if/else path" : "On the main path"}
      />
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onMove(-1)} disabled={!loc || loc.index === 0}>
            <ArrowUp aria-hidden />
            Move up
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMove(1)} disabled={!loc || loc.index >= loc.siblings - 1}>
            <ArrowDown aria-hidden />
            Move down
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} className="ml-auto">
            <Trash2 aria-hidden />
            Delete
          </Button>
        </div>
      )}
      {step.type === "send_email" && <SendEmailSettings {...props} step={step} />}
      {step.type === "wait" && (
        <div className="flex flex-wrap items-end gap-3">
          <WholeNumberField
            label="Wait for"
            value={step.amount}
            min={1}
            max={365}
            onChange={(amount) => props.onChange((s) => ({ ...s, amount }) as AutomationStep)}
            disabled={readOnly}
          />
          <div className="w-36">
            <Picker
              label="Unit"
              value={step.unit}
              options={WAIT_UNITS.map((u) => ({ value: u, label: u[0].toUpperCase() + u.slice(1) }))}
              onChange={(unit) => props.onChange((s) => ({ ...s, unit }) as AutomationStep)}
              disabled={readOnly}
            />
          </div>
        </div>
      )}
      {step.type === "wait" && <Explainer>People wait here, then carry on to the next step.</Explainer>}
      {step.type === "condition" && <ConditionSettings {...props} />}
      {(step.type === "add_to_list" || step.type === "remove_from_list") && (
        <Picker
          label={step.type === "add_to_list" ? "Add them to" : "Remove them from"}
          value={step.listId}
          options={props.lookups.lists.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(listId) => props.onChange((s) => ({ ...s, listId }) as AutomationStep)}
          disabled={readOnly}
          empty={<NeedList />}
        />
      )}
      {step.type === "update_field" && <UpdateFieldSettings {...props} />}
      {step.type === "exit" && (
        <Explainer>
          People who reach this step leave the automation here. Use it at the end of an if/else path to stop that path
          early.
        </Explainer>
      )}
    </PanelBody>
  );
}

function SendEmailSettings(props: StepSettingsProps & { step: SendEmailStep }) {
  const { step, senders, mergeTags, readOnly, onChange, onEditDesign, onSendTest } = props;
  const set = (patch: Partial<SendEmailStep>) => onChange((s) => ({ ...s, ...patch }) as AutomationStep);
  const senderMissing = !!step.senderId && !senders.some((s) => s.id === step.senderId);
  return (
    <>
      <TextField
        label="Email name"
        value={step.name}
        onChange={(name) => set({ name })}
        maxLength={100}
        disabled={readOnly}
        hint="Only you see this, e.g. “Welcome email”. It's how reports and if/else steps refer to it."
      />
      <Picker
        label="From"
        value={step.senderId}
        options={senders.map((s) => ({ value: s.id, label: s.label }))}
        onChange={(senderId) => set({ senderId })}
        disabled={readOnly}
        placeholder="Choose a verified sender"
        hint={senderMissing ? "The sender used before isn't verified any more. Choose another one." : undefined}
        empty={
          <span className="flex items-start gap-1.5 text-amber-800">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              You have no verified senders yet.{" "}
              <Link href="/settings/senders" className="font-medium underline underline-offset-2">
                Verify one in Settings
              </Link>
              , then come back.
            </span>
          </span>
        }
      />
      {readOnly ? (
        <>
          <ReadOnlyText label="Subject" value={step.subject} />
          <ReadOnlyText label="Preview text" value={step.preheader} />
        </>
      ) : (
        <>
          <MergeTagTextField
            label="Subject"
            value={step.subject}
            onChange={(subject) => set({ subject })}
            mergeTags={mergeTags}
            maxLength={200}
            placeholder="Welcome to the club!"
            hint={step.subject.trim() ? undefined : "Required before you can turn it on."}
          />
          <MergeTagTextField
            label="Preview text"
            value={step.preheader}
            onChange={(preheader) => set({ preheader })}
            mergeTags={mergeTags}
            maxLength={200}
            hint="The grey line shown after the subject in most inboxes. Optional."
          />
        </>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-700">Design</span>
        <div className="flex gap-3">
          <div className="w-28 shrink-0 overflow-hidden rounded-lg border">
            <DesignThumbnail step={step} />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2">
            {readOnly ? (
              <p className="text-xs text-zinc-500">Pause the automation to change this email&apos;s design.</p>
            ) : (
              <Button size="sm" onClick={onEditDesign}>
                <Paintbrush aria-hidden />
                Edit design
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onSendTest}>
              <Send aria-hidden />
              Send a test
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/** A small live preview of the step's design (rendered by the server, shown in a sandboxed frame). */
function DesignThumbnail({ step }: { step: SendEmailStep }) {
  const [html, setHtml] = useState<{ id: string; html: string } | null>(null);
  const { id, document, subject, preheader } = step;
  useEffect(() => {
    let cancelled = false;
    previewDocument(document, { subject, preheader })
      .then((r) => !cancelled && setHtml({ id, html: r.ok ? r.html : "<!doctype html><html><body></body></html>" }))
      .catch(() => !cancelled && setHtml({ id, html: "<!doctype html><html><body></body></html>" }));
    return () => {
      cancelled = true;
    };
    // Only the design matters for the picture; the subject changes on every key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, document]);
  return <EmailThumbnail srcDoc={html?.id === id ? html.html : null} title={`Preview of ${step.name}`} />;
}

function ConditionSettings(props: StepSettingsProps) {
  const { step, steps, lookups, readOnly, onChange } = props;
  if (step.type !== "condition") return null;
  const emails = emailStepsAbove(steps, step.id);
  const condition = step.condition;
  const setCondition = (next: AutomationCondition) => onChange((s) => ({ ...s, condition: next }) as AutomationStep);

  const kindOptions: Option[] = [
    { value: "email_activity", label: "Opened or clicked an email", disabled: emails.length === 0, hint: emails.length ? undefined : "Needs a “Send email” step above it" },
    { value: "in_list", label: "Is in a list", disabled: lookups.lists.length === 0, hint: lookups.lists.length ? undefined : "Create a list first" },
    { value: "in_segment", label: "Matches a segment", disabled: lookups.segments.length === 0, hint: lookups.segments.length ? undefined : "Create a segment first" },
  ];

  function changeKind(kind: string) {
    if (kind === condition.kind) return;
    if (kind === "email_activity" && emails[0]) setCondition({ kind, stepId: emails[0].id, action: "opened" });
    if (kind === "in_list" && lookups.lists[0]) setCondition({ kind, listId: lookups.lists[0].id });
    if (kind === "in_segment" && lookups.segments[0]) setCondition({ kind, segmentId: lookups.segments[0].id });
  }

  return (
    <>
      <Picker label="Check whether they…" value={condition.kind} options={kindOptions} onChange={changeKind} disabled={readOnly} />
      {condition.kind === "email_activity" && (
        <>
          <Picker
            label="Did they…"
            value={condition.action}
            options={[
              { value: "opened", label: "Open" },
              { value: "clicked", label: "Click a link in" },
            ]}
            onChange={(action) => setCondition({ ...condition, action: action as "opened" | "clicked" })}
            disabled={readOnly}
          />
          <Picker
            label="…this email"
            value={condition.stepId}
            options={emails.map((e) => ({ value: e.id, label: e.name }))}
            onChange={(stepId) => setCondition({ ...condition, stepId })}
            disabled={readOnly}
            placeholder="Choose an email above"
            hint="Only emails above this step on the same path can be checked."
            empty="Add a “Send email” step above this one first."
          />
          <Explainer>
            Tip: put a <strong>Wait</strong> step before this one, so people have time to open the email. Opens are
            estimated (some apps hide them), clicks are exact.
          </Explainer>
        </>
      )}
      {condition.kind === "in_list" && (
        <Picker
          label="List"
          value={condition.listId}
          options={lookups.lists.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(listId) => setCondition({ kind: "in_list", listId })}
          disabled={readOnly}
          hint="Checked at the moment they reach this step."
          empty={<NeedList />}
        />
      )}
      {condition.kind === "in_segment" && (
        <Picker
          label="Segment"
          value={condition.segmentId}
          options={lookups.segments.map((g) => ({ value: g.id, label: g.name }))}
          onChange={(segmentId) => setCondition({ kind: "in_segment", segmentId })}
          disabled={readOnly}
          hint="Checked at the moment they reach this step."
          empty={
            <>
              No segments yet.{" "}
              <Link href="/contacts/segments" className="font-medium text-emerald-700 underline underline-offset-2">
                Create one
              </Link>
            </>
          }
        />
      )}
      <Explainer>
        People who match go down the <strong className="text-emerald-700">If yes</strong> path, everyone else down{" "}
        <strong className="text-rose-700">If no</strong>. Both paths then carry on with the steps below the split.
      </Explainer>
    </>
  );
}

function UpdateFieldSettings(props: StepSettingsProps) {
  const { step, lookups, readOnly, onChange } = props;
  if (step.type !== "update_field") return null;
  const options: Option[] = [
    { value: "FIRSTNAME", label: "First name" },
    { value: "LASTNAME", label: "Last name" },
    ...lookups.attributes.map((a) => ({ value: `attr:${a.key}`, label: a.label })),
  ];
  const attr = step.target.startsWith("attr:") ? lookups.attributes.find((a) => `attr:${a.key}` === step.target) : null;
  const type = attr?.type ?? "TEXT";
  const setValue = (value: string) => onChange((s) => ({ ...s, value }) as AutomationStep);
  const label = `New ${fieldLabel(step.target, lookups).toLowerCase()}`;

  return (
    <>
      <Picker
        label="Field"
        value={step.target}
        options={options}
        // A new field starts empty: an old value may not fit its type.
        onChange={(target) => onChange((s) => ({ ...s, target, value: "" }) as AutomationStep)}
        disabled={readOnly}
      />
      {type === "BOOLEAN" ? (
        <Picker
          label={label}
          value={step.value === "" ? "__clear" : step.value}
          options={[
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
            { value: "__clear", label: "(empty)" },
          ]}
          onChange={(v) => setValue(v === "__clear" ? "" : v)}
          disabled={readOnly}
        />
      ) : (
        <TextField
          label={label}
          type={type === "NUMBER" ? "number" : type === "DATE" ? "date" : "text"}
          value={step.value}
          onChange={setValue}
          maxLength={500}
          disabled={readOnly}
          hint="Leave it empty to clear the field."
        />
      )}
    </>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function NeedList() {
  return (
    <>
      No lists yet.{" "}
      <Link href="/contacts/lists" className="font-medium text-emerald-700 underline underline-offset-2">
        Create a list
      </Link>{" "}
      first.
    </>
  );
}

function ReadOnlyText({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      <Input value={value || "(empty)"} readOnly disabled className="h-9" aria-label={label} />
    </div>
  );
}

function PanelBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/** Bare icon + title. `tone` is a text colour (the step type's); none = Klyve green. */
function PanelTitle({ icon, tone, title, subtitle }: { icon: LucideIcon; tone?: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <Glyph icon={icon} size="lg" strokeWidth={1.5} tone={tone ? "current" : "brand"} className={tone} />
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
    </div>
  );
}
