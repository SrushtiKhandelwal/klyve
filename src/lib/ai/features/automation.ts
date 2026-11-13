import "server-only";
import { z } from "zod";
import { cleanLine, cleanParagraph } from "@/lib/ai/safety";
import {
  findRecipe,
  recipeBuildsWith,
  recipeSettingKind,
  validSettingValue,
  type RecipeOptions,
  type RecipeSettingKind,
} from "@/lib/ai/recipe-settings";
import { RECIPES } from "@/lib/automations/recipes/catalog";

// "Describe with AI" on the new-automation page: the AI picks the ready-made
// recipe that fits the description best and fills in its one setting (which
// list, form or date field). It can't invent new kinds of automations: if
// nothing fits, it says so and names the closest recipe.
//
// PRIVACY: the AI only sees recipe descriptions and the NAMES of the
// workspace's lists, forms and date fields.

const MAX_CONTEXT_ITEMS = 60;

export function automationPrompt(description: string, options: RecipeOptions) {
  const recipes = RECIPES.map((r) => {
    const kind = recipeSettingKind(r);
    return `- id "${r.id}": ${r.name}. ${r.description} Trigger: ${r.triggerLabel}.${kind ? ` Setting: ${kind}.` : ""}`;
  }).join("\n");
  const list = (items: { id: string; name: string }[]) =>
    items.length ? items.slice(0, MAX_CONTEXT_ITEMS).map((i) => `- id "${i.id}": ${JSON.stringify(i.name)}`).join("\n") : "(none)";
  const dateFields = options.dateFields.length
    ? options.dateFields.map((f) => `- key "${f.key}": ${JSON.stringify(f.label)}`).join("\n")
    : "(none)";

  const system = [
    "You help people set up email automations by choosing ONE ready-made recipe. You answer with ONE JSON object and nothing else.",
    'JSON shape: {"recipeId": string | null, "closestRecipeId": string | null, "name": string, "listId": string | null, "formId": string | null, "dateField": string | null, "reengagedListId": string | null, "reason": string}',
    "",
    "Recipes (the only ones that exist):",
    recipes,
    "",
    "Lists:",
    list(options.lists),
    "",
    "Sign-up forms:",
    list(options.forms),
    "",
    "Date fields:",
    dateFields,
    "",
    "Rules:",
    "- recipeId: the id of the recipe that clearly fits the description, or null if none really fits.",
    "- closestRecipeId: when recipeId is null, the id of the closest recipe (or null).",
    '- Fill only the setting the chosen recipe needs: "list" → listId, "form" → formId, "dateField" → dateField (a key above), "reengagedList" → reengagedListId. Use ids/keys from above only; null if unsure or none fits.',
    "- name: a short name for the automation (max 60 characters), in the user's language.",
    "- reason: one or two short sentences, in plain English, saying why this recipe fits (or what's missing).",
  ].join("\n");

  return { system, user: description };
}

const maybeString = z.string().max(500).nullish();

export const automationAnswerSchema = z.object({
  recipeId: maybeString,
  closestRecipeId: maybeString,
  name: z.string().max(500).nullish(),
  listId: maybeString,
  formId: maybeString,
  dateField: maybeString,
  reengagedListId: maybeString,
  reason: z.string().max(2000).nullish(),
});

export type AutomationSuggestion =
  | {
      fit: true;
      recipeId: string;
      recipeName: string;
      name: string;
      setting: { kind: RecipeSettingKind; value: string | null } | null;
      reason: string;
    }
  | { fit: false; closest: { id: string; name: string } | null; reason: string };

/** Checks the AI's pick against the real recipes and this workspace's lists, forms and fields. */
export function acceptAutomation(answer: z.output<typeof automationAnswerSchema>, options: RecipeOptions): AutomationSuggestion {
  const reason = cleanParagraph(answer.reason ?? "", 400);
  const recipe = findRecipe(answer.recipeId);
  if (!recipe) {
    const closest = findRecipe(answer.closestRecipeId);
    return {
      fit: false,
      closest: closest ? { id: closest.id, name: closest.name } : null,
      reason: reason || "None of the ready-made automations fits that description.",
    };
  }

  const kind = recipeSettingKind(recipe);
  const raw =
    kind === "list" ? answer.listId : kind === "form" ? answer.formId : kind === "dateField" ? answer.dateField : kind === "reengagedList" ? answer.reengagedListId : null;
  // An id that isn't in this workspace is dropped (the user picks one instead).
  const value = validSettingValue(kind, raw, options);
  // The recipe's own schemas have the final say.
  const usable = recipeBuildsWith(recipe, kind, value) ? value : null;

  return {
    fit: true,
    recipeId: recipe.id,
    recipeName: recipe.name,
    name: cleanLine(answer.name ?? "", 100) || recipe.name,
    setting: kind ? { kind, value: usable } : null,
    reason,
  };
}
