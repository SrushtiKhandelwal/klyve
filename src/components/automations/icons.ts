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

/** Soft colour per step type (icon tile background + icon colour). */
export const STEP_TONES: Record<AutomationStep["type"], string> = {
  send_email: "bg-emerald-50 text-emerald-700",
  wait: "bg-sky-50 text-sky-700",
  condition: "bg-violet-50 text-violet-700",
  add_to_list: "bg-teal-50 text-teal-700",
  remove_from_list: "bg-orange-50 text-orange-700",
  update_field: "bg-indigo-50 text-indigo-700",
  exit: "bg-zinc-100 text-zinc-600",
};
