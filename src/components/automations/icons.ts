import {
  Cake,
  ClipboardList,
  DoorOpen,
  Hand,
  Hourglass,
  ListMinus,
  ListPlus,
  Mail,
  PenLine,
  Split,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AutomationStep, AutomationTrigger } from "@/lib/automations/schema";

// One icon per trigger and step type, so the list page and the builder match.

export const TRIGGER_ICONS: Record<AutomationTrigger["type"], LucideIcon> = {
  list_joined: Users,
  form_submitted: ClipboardList,
  contact_created: UserPlus,
  date_anniversary: Cake,
  manual: Hand,
};

export const STEP_ICONS: Record<AutomationStep["type"], LucideIcon> = {
  send_email: Mail,
  wait: Hourglass,
  condition: Split,
  add_to_list: ListPlus,
  remove_from_list: ListMinus,
  update_field: PenLine,
  exit: DoorOpen,
};

/**
 * Icon colour per step type, so each kind of step is easy to spot in the
 * builder. Icons are drawn bare (no tile behind them): <Glyph tone="current">.
 */
export const STEP_TONES: Record<AutomationStep["type"], string> = {
  send_email: "text-emerald-600",
  wait: "text-sky-600",
  condition: "text-violet-600",
  add_to_list: "text-teal-600",
  remove_from_list: "text-orange-600",
  update_field: "text-indigo-600",
  exit: "text-zinc-500",
};
