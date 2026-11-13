import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  ChartColumnIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ColumnsIcon,
  CopyIcon,
  FileTextIcon,
  GripVerticalIcon,
  HouseIcon,
  ImageIcon,
  MailIcon,
  MegaphoneIcon,
  MinusIcon,
  MousePointer2Icon,
  MousePointerClickIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  TypeIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react";
import { Glyph } from "@/components/brand/glyph";
import { MockButton, StatusDot } from "@/components/landing/mockups/parts";
import { cn } from "@/lib/utils";
import "@/components/landing/landing.css";

// The big product picture in the hero: the campaign editor, with an email
// being designed, the block palette, and AI suggesting subject lines.
// Parts appear as the screen gets wider (sidebar from md, AI panel from lg,
// block palette from xl), so it stays readable on a phone.

const NAV: { icon: LucideIcon; label: string; active?: boolean; group?: string }[] = [
  { icon: HouseIcon, label: "Home" },
  { icon: UsersIcon, label: "Contacts", group: "Audience" },
  { icon: ClipboardListIcon, label: "Forms" },
  { icon: MegaphoneIcon, label: "Campaigns", group: "Messages", active: true },
  { icon: FileTextIcon, label: "Templates" },
  { icon: WorkflowIcon, label: "Automations" },
  { icon: ChartColumnIcon, label: "Statistics" },
];

const BLOCKS: { icon: LucideIcon; label: string }[] = [
  { icon: TypeIcon, label: "Heading" },
  { icon: FileTextIcon, label: "Text" },
  { icon: ImageIcon, label: "Image" },
  { icon: MousePointerClickIcon, label: "Button" },
  { icon: ColumnsIcon, label: "Columns" },
  { icon: MinusIcon, label: "Divider" },
];

const SUBJECTS = [
  "Our autumn roast is here, and it's lovely",
  "Priya, your first cup of autumn",
  "Small batch, big flavour: autumn roast is in",
];

export function EditorMockup() {
  return (
    <div className="relative">
      {/* A light grey tray around the window, with a hairline edge. */}
      <div
        role="img"
        aria-label="The Klyve campaign editor: an email being designed with drag-and-drop blocks, while AI suggests subject lines in a side panel."
        className="relative rounded-[1.25rem] border border-zinc-200 bg-zinc-100/70 p-1.5 sm:p-2"
      >
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.05),0_16px_40px_-16px_rgb(0_0_0/0.12)] ring-1 ring-zinc-900/10"
        >
          <WindowBar />
          <div className="flex h-[25rem] sm:h-[29rem] lg:h-[33rem]">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <div className="flex min-h-0 flex-1">
                <BlockPalette />
                <Canvas />
                <AiPanel />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two cards hanging over the window's bottom corners (wide screens only). */}
      <div aria-hidden="true" className="hidden lg:block">
        <div className="absolute -bottom-14 -left-4 w-60 xl:-left-12">
          <FloatingCard>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-900">
              <Glyph icon={ShieldCheckIcon} size="sm" />
              Ready to deliver
            </div>
            <dl className="mt-3 grid gap-2 text-[11px]">
              <Row label="Provider" value="Amazon SES" />
              <Row label="SPF" value={<StatusDot>Pass</StatusDot>} />
              <Row label="DKIM" value={<StatusDot>Pass</StatusDot>} />
              <Row label="DMARC" value={<StatusDot>Pass</StatusDot>} />
            </dl>
          </FloatingCard>
        </div>
        <div className="absolute -right-4 -bottom-10 w-56 xl:-right-12">
          <FloatingCard>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-zinc-900">
              <Glyph icon={CalendarClockIcon} size="sm" />
              Scheduled
            </div>
            <p className="mt-2 text-[13px] font-medium text-zinc-900">Tue 18 Nov, 10:00 AM</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Newsletter · 1,236 contacts</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full w-2/3 rounded-full bg-emerald-500" />
            </div>
          </FloatingCard>
        </div>
      </div>
    </div>
  );
}

function FloatingCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-12px_rgb(0_0_0/0.16)]">
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

/** The browser-style bar at the very top of the window. */
function WindowBar() {
  return (
    <div className="flex h-10 items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3.5">
      <div className="flex gap-1.5">
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
        <span className="size-2.5 rounded-full bg-zinc-300" />
      </div>
      <div className="mx-auto hidden h-6 w-full max-w-xs items-center justify-center rounded-md border border-zinc-200 bg-white text-[11px] text-zinc-500 sm:flex">
        klyveapp.tech/campaigns/autumn-roast
      </div>
      <div className="hidden w-[42px] sm:block" />
    </div>
  );
}

/** The app's left-hand navigation. */
function Sidebar() {
  return (
    <div className="hidden w-48 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/70 p-3 md:flex">
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="flex size-6 items-center justify-center rounded-md bg-emerald-600 text-white">
          <MailIcon className="size-3.5" />
        </span>
        <span className="truncate text-[13px] font-semibold text-zinc-900">Monsoon Coffee</span>
      </div>
      <div className="mt-4 grid gap-0.5">
        {NAV.map(({ icon, label, active, group }) => (
          <div key={label}>
            {group && (
              <div className="mt-3 mb-1 px-2 text-[10px] font-medium tracking-wider text-zinc-400 uppercase">
                {group}
              </div>
            )}
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px]",
                active ? "bg-white font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600",
              )}
            >
              <Glyph icon={icon} size="xs" tone={active ? "brand" : "muted"} />
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2.5 px-2 py-1.5 text-[12px] text-zinc-600">
        <Glyph icon={SettingsIcon} size="xs" tone="muted" />
        Settings
      </div>
    </div>
  );
}

/** Breadcrumb + the campaign's main actions. */
function TopBar() {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="hidden text-zinc-500 sm:inline">Campaigns</span>
        <ChevronRightIcon className="hidden size-3.5 text-zinc-300 sm:inline" />
        <span className="truncate font-medium text-zinc-900">Autumn roast launch</span>
        <span className="ml-1.5 hidden sm:inline-flex">
          <StatusDot tone="amber">Draft</StatusDot>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <MockButton variant="outline" className="hidden sm:inline-flex">
          Send test
        </MockButton>
        <MockButton>Schedule</MockButton>
      </div>
    </div>
  );
}

/** Blocks you can drag into the email. */
function BlockPalette() {
  return (
    <div className="hidden w-36 shrink-0 flex-col border-r border-zinc-200 p-3 xl:flex">
      <div className="px-1 text-[10px] font-medium tracking-wider text-zinc-400 uppercase">Blocks</div>
      <div className="mt-2 grid gap-1.5">
        {BLOCKS.map(({ icon, label }) => (
          <div
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 text-[12px]",
              label === "Image" ? "border-dashed border-zinc-300 text-zinc-400" : "border-zinc-200 text-zinc-700",
            )}
          >
            <GripVerticalIcon className="size-3 text-zinc-300" />
            <Glyph icon={icon} size="xs" tone="muted" />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The email being designed. */
function Canvas() {
  return (
    <div className="relative flex min-w-0 flex-1 justify-center overflow-hidden bg-zinc-100 px-4 pt-6 sm:px-8 sm:pt-8">
      <div className="w-full max-w-[22rem]">
        <div className="rounded-t-lg bg-white shadow-sm ring-1 ring-zinc-900/5">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-[11px] font-semibold tracking-[0.28em] text-[#1f3d2b]">MONSOON</span>
            <span className="text-[10px] text-zinc-400">View in browser</span>
          </div>
          <Hills />
          {/* The selected block, with its little toolbar. */}
          <div className="relative mx-3 mt-5 rounded-md px-2 py-1.5 ring-2 ring-emerald-500">
            <div className="absolute -top-8 right-0 flex h-7 items-center gap-0.5 rounded-md bg-zinc-900 px-1 text-zinc-300 shadow-lg">
              <span className="flex items-center gap-1 rounded px-1.5 text-[11px] font-medium text-white">
                <Glyph icon={SparklesIcon} size="xs" tone="soft" />
                Improve
              </span>
              <span className="h-4 w-px bg-white/15" />
              <ArrowUpIcon className="mx-1 size-3" />
              <ArrowDownIcon className="mx-1 size-3" />
              <CopyIcon className="mx-1 size-3" />
              <Trash2Icon className="mx-1 size-3" />
            </div>
            <p className="text-[19px] leading-tight font-semibold tracking-tight text-zinc-900">
              Our autumn roast is here
            </p>
          </div>
          <p className="mx-5 mt-2 text-[12px] leading-5 text-zinc-600">
            Hi Priya, slow-roasted in small batches with notes of jaggery and cocoa. Regulars get the first bags
            this week.
          </p>
          <div className="mx-5 mt-4">
            <span className="inline-flex h-8 items-center rounded-md bg-[#1f3d2b] px-4 text-[12px] font-medium text-white">
              Shop the roast
            </span>
          </div>

          {/* Where the dragged "Image" block will land, with the block itself
              coming in from the palette on the left (wide screens only). */}
          <div className="relative mx-5 mt-5 hidden h-0.5 rounded-full bg-emerald-500 xl:block">
            <span className="absolute -top-[3px] -left-1 size-2 rounded-full border-2 border-emerald-500 bg-white" />
            <span className="absolute -top-[3px] -right-1 size-2 rounded-full border-2 border-emerald-500 bg-white" />
            <div className="absolute -top-4 -left-16 -rotate-3">
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-white/95 px-2.5 py-1.5 text-[12px] font-medium text-zinc-800 shadow-lg shadow-zinc-900/10">
                <GripVerticalIcon className="size-3 text-zinc-400" />
                <Glyph icon={ImageIcon} size="xs" />
                Image
              </div>
              <MousePointer2Icon className="absolute -right-2 -bottom-3 size-4 fill-zinc-900 text-white" />
            </div>
          </div>

          <div className="mx-5 mt-5 grid grid-cols-2 gap-3 pb-6">
            <div className="h-16 rounded-md bg-linear-to-br from-amber-100 to-orange-200" />
            <div className="h-16 rounded-md bg-linear-to-br from-emerald-100 to-teal-200" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The AI side panel. */
function AiPanel() {
  return (
    <div className="hidden w-64 shrink-0 flex-col border-l border-zinc-200 bg-white p-4 lg:flex">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900">
        <Glyph icon={SparklesIcon} size="sm" />
        Subject line ideas
      </div>
      <p className="mt-1 text-[11px] leading-4 text-zinc-500">Based on what your email says right now.</p>
      <ul className="mt-4 grid gap-1.5">
        {SUBJECTS.map((subject, i) => (
          <li
            key={subject}
            className={cn(
              "flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12px] leading-5",
              i === 0 ? "bg-emerald-50/80 text-zinc-900 ring-1 ring-emerald-600/20" : "text-zinc-600",
            )}
          >
            <span
              className={cn(
                "mt-1 flex size-3 shrink-0 items-center justify-center rounded-full border",
                i === 0 ? "border-emerald-600" : "border-zinc-300",
              )}
            >
              {i === 0 && <span className="size-1.5 rounded-full bg-emerald-600" />}
            </span>
            {subject}
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <div className="text-[11px] font-medium text-zinc-500">Preview text</div>
        <p className="mt-1 text-[12px] leading-5 text-zinc-800">Jaggery, cocoa and a little smoke. First bags ship Friday.</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {["Shorter", "Friendlier", "हिन्दी", "मराठी"].map((label) => (
          <span key={label} className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The email's header picture: hills at sunrise, drawn as an SVG. */
function Hills() {
  return (
    <svg viewBox="0 0 352 128" preserveAspectRatio="xMidYMid slice" className="block h-28 w-full sm:h-32">
      <defs>
        <linearGradient id="klyve-mock-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#fdba74" />
        </linearGradient>
      </defs>
      <rect width="352" height="128" fill="url(#klyve-mock-sky)" />
      <circle cx="252" cy="56" r="22" fill="#fff7ed" opacity="0.9" />
      <path d="M0 86 C60 58 110 68 170 82 S280 66 352 78 V128 H0Z" fill="#3f7d58" />
      <path d="M0 102 C70 82 140 94 200 104 S300 92 352 98 V128 H0Z" fill="#2a5c40" />
      <path d="M0 116 C80 106 160 114 240 118 S320 112 352 114 V128 H0Z" fill="#1f3d2b" />
    </svg>
  );
}
