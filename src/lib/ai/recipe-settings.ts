import "server-only";
import { db } from "@/lib/db";
import { RECIPES, type RecipeMeta } from "@/lib/automations/recipes/catalog";
import { DEFAULT_BIRTHDAY_KEY, buildRecipe, isRecipePlaceholder } from "@/lib/automations/recipes";
import type { AutomationStep, AutomationTrigger } from "@/lib/automations/schema";
import { DEFAULT_THEME } from "@/lib/templates/document";

// The one setting each ready-made automation (recipe) needs from the
// workspace, e.g. "which list?" for the welcome series. Used by "Describe
// with AI" (the AI picks a value), the confirm page (shows it preselected)
// and the create action (checks it again before saving).
//
// Every value is checked against THIS workspace's real lists, forms and date
// fields, so neither the AI nor a tampered URL can point at someone else's.

export type RecipeSettingKind = "list" | "form" | "dateField" | "reengagedList";

/** Which setting a recipe needs (null = nothing to choose besides the sender). */
export function recipeSettingKind(recipe: RecipeMeta): RecipeSettingKind | null {
  if (recipe.id === "win-back") return "reengagedList";
  switch (recipe.triggerType) {
    case "list_joined":
      return "list";
    case "form_submitted":
      return "form";
    case "date_anniversary":
      return "dateField";
    default:
      return null;
  }
}

export const RECIPE_SETTING_LABELS: Record<RecipeSettingKind, string> = {
  list: "Start when someone joins this list",
  form: "Start when someone submits this form",
  dateField: "Date field with the birthday",
  reengagedList: "Add people who click to this list",
};

export type RecipeOptions = {
  lists: { id: string; name: string }[];
  forms: { id: string; name: string }[];
  dateFields: { key: string; label: string }[];
};

/** The workspace's lists, forms and DATE fields (only pass the id from requireActiveWorkspace()). */
export async function loadRecipeOptions(workspaceId: string): Promise<RecipeOptions> {
  const [lists, forms, dateFields] = await Promise.all([
    db.contactList.findMany({ where: { workspaceId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.signupForm.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true }, take: 200 }),
    db.contactAttribute.findMany({ where: { workspaceId, type: "DATE" }, orderBy: { createdAt: "asc" }, select: { key: true, label: true } }),
  ]);
  return { lists, forms, dateFields };
}

/** The value for a setting: an id (list/form) or a field key. null = not chosen. */
export function validSettingValue(kind: RecipeSettingKind | null, value: unknown, options: RecipeOptions): string | null {
  if (!kind || typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  switch (kind) {
    case "list":
    case "reengagedList": {
      const hit = options.lists.find((l) => l.id === v) ?? options.lists.find((l) => l.name.trim().toLowerCase() === v.toLowerCase());
      return hit?.id ?? null;
    }
    case "form": {
      const hit = options.forms.find((f) => f.id === v) ?? options.forms.find((f) => f.name.trim().toLowerCase() === v.toLowerCase());
      return hit?.id ?? null;
    }
    case "dateField": {
      const hit = options.dateFields.find((f) => f.key === v.toUpperCase()) ?? options.dateFields.find((f) => f.label.trim().toLowerCase() === v.toLowerCase());
      return hit?.key ?? null;
    }
  }
}

export function findRecipe(id: unknown): RecipeMeta | null {
  return typeof id === "string" ? (RECIPES.find((r) => r.id === id) ?? null) : null;
}

/**
 * Puts the chosen setting into an automation that was just created from a
 * recipe (with the workspace defaults). Returns null when nothing changes.
 * The caller checks the result with triggerSchema / stepsSchema before saving.
 */
export function applyRecipeSetting(
  trigger: AutomationTrigger,
  steps: AutomationStep[],
  kind: RecipeSettingKind | null,
  value: string | null,
): { trigger: AutomationTrigger; steps: AutomationStep[] } | null {
  if (!kind || !value) return null;
  if (kind === "list" && trigger.type === "list_joined") return { trigger: { ...trigger, listId: value }, steps };
  if (kind === "form" && trigger.type === "form_submitted") return { trigger: { ...trigger, formId: value }, steps };
  if (kind === "dateField" && trigger.type === "date_anniversary") return { trigger: { ...trigger, attributeKey: value }, steps };
  if (kind === "reengagedList") {
    // The win-back recipe's "Add to list" step starts on a placeholder list.
    const swap = (list: AutomationStep[]): AutomationStep[] =>
      list.map((s) => {
        if (s.type === "add_to_list" && isRecipePlaceholder(s.listId)) return { ...s, listId: value };
        if (s.type === "condition") return { ...s, yes: swap(s.yes), no: swap(s.no) };
        return s;
      });
    return { trigger, steps: swap(steps) };
  }
  return null;
}

/**
 * True when the recipe builds into a valid automation with this setting
 * (the recipe's own trigger/steps schemas run inside buildRecipe).
 */
export function recipeBuildsWith(recipe: RecipeMeta, kind: RecipeSettingKind | null, value: string | null): boolean {
  try {
    const built = buildRecipe(recipe.id, {
      theme: DEFAULT_THEME,
      senderId: null,
      listId: kind === "list" ? value : null,
      formId: kind === "form" ? value : null,
      birthdayKey: kind === "dateField" ? (value ?? DEFAULT_BIRTHDAY_KEY) : null,
      reengagedListId: kind === "reengagedList" ? value : null,
    });
    return built !== null;
  } catch {
    return false;
  }
}
