import type { AiProvenance } from "@/ai/provenance";
import type { CraftingDiscipline } from "@/types/crafting.types";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import {
  ITEM_RARITIES,
  ITEM_TYPES,
  type ItemRarity,
  type ItemType,
} from "@/types/item.types";

/**
 * Validation for the recipe generator. Model output is untrusted: an unknown
 * discipline, rarity or item type falls back to a default, numbers are clamped,
 * and lists are filtered and capped before anything reaches the database.
 */

export const RECIPE_DC_MIN = 5;
export const RECIPE_DC_MAX = 30;
export const RECIPE_MAX_INGREDIENTS = 5;
export const RECIPE_MAX_MODIFIERS = 2;
const MAX_TAGS_PER_INGREDIENT = 4;
const MAX_QUANTITY = 99;
const MAX_CRAFTING_TIME = 999;
const MAX_NAME = 120;

const DISCIPLINE_IDS: readonly CraftingDiscipline[] = CRAFTING_DISCIPLINES.map((d) => d.id);
const TIME_UNITS = ["minutes", "hours", "days"] as const;
type TimeUnit = (typeof TIME_UNITS)[number];

export interface RecipeAiOutput {
  name: string;
  quantity: number;
  /** Plain text. */
  description: string;
  rarity: ItemRarity;
  item_type: ItemType;
}

export interface RecipeAiResult {
  name: string;
  discipline: CraftingDiscipline;
  /** Plain text flavour: convert to Tiptap JSON before saving. */
  description: string;
  dc: number;
  crafting_time: number;
  crafting_time_unit: TimeUnit;
  requires_proficiency: boolean;
  requires_tools: boolean;
  ingredients: { tags: string[]; quantity: number }[];
  modifiers: { description: string; bonus: number }[];
  output: RecipeAiOutput;
  ai_provenance?: AiProvenance;
}

/** The fields the generator can fill on a new item. */
export interface ItemDraft {
  name: string;
  item_type: ItemType;
  rarity: ItemRarity;
  /** Plain text. */
  description: string;
}

export type RecipeOutputResolution =
  | { kind: "campaign"; item_id: string; name: string }
  | { kind: "library"; library_item_id: string; name: string }
  | { kind: "create"; draft: ItemDraft };

export interface NamedItem {
  id: string;
  name: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function integer(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" ? (allowed.find((a) => a === v.trim().toLowerCase()) ?? fallback) : fallback;
}

/** Lowercased, trimmed, deduplicated, capped; blanks dropped. */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, MAX_TAGS_PER_INGREDIENT);
}

/**
 * Coerces whatever the model returned into a safe recipe. Returns null when
 * there is nothing usable (no name, or no output item to craft).
 */
export function normalizeRecipeAi(
  raw: unknown,
  defaultDiscipline: CraftingDiscipline = "smithing",
): RecipeAiResult | null {
  if (!isRecord(raw)) return null;
  const name = text(raw.name, MAX_NAME);
  const rawOutput = isRecord(raw.output) ? raw.output : null;
  const outputName = rawOutput ? text(rawOutput.name, MAX_NAME) : "";
  if (!name || !rawOutput || !outputName) return null;

  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .filter(isRecord)
    .map((i) => ({ tags: normalizeTags(i.tags), quantity: integer(i.quantity, 1, MAX_QUANTITY, 1) }))
    .filter((i) => i.tags.length > 0)
    .slice(0, RECIPE_MAX_INGREDIENTS);

  const modifiers = (Array.isArray(raw.modifiers) ? raw.modifiers : [])
    .filter(isRecord)
    .map((m) => ({ description: text(m.description, 200), bonus: integer(m.bonus, -10, 10, 2) }))
    .filter((m) => m.description.length > 0)
    .slice(0, RECIPE_MAX_MODIFIERS);

  return {
    name,
    discipline: oneOf(raw.discipline, DISCIPLINE_IDS, defaultDiscipline),
    description: text(raw.description, 4000),
    dc: integer(raw.dc, RECIPE_DC_MIN, RECIPE_DC_MAX, 12),
    crafting_time: integer(raw.crafting_time, 1, MAX_CRAFTING_TIME, 1),
    crafting_time_unit: oneOf(raw.crafting_time_unit, TIME_UNITS, "days"),
    requires_proficiency: raw.requires_proficiency === true,
    requires_tools: raw.requires_tools === true,
    ingredients,
    modifiers,
    output: {
      name: outputName,
      quantity: integer(rawOutput.quantity, 1, MAX_QUANTITY, 1),
      description: text(rawOutput.description, 4000),
      rarity: oneOf(rawOutput.rarity, ITEM_RARITIES, "common"),
      item_type: oneOf(rawOutput.item_type, ITEM_TYPES, "wondrous_item"),
    },
  };
}

function byName(items: readonly NamedItem[], name: string): NamedItem | undefined {
  const wanted = name.trim().toLowerCase();
  return items.find((i) => i.name.trim().toLowerCase() === wanted);
}

/**
 * Decides what the recipe's output points at: an item the campaign already has
 * wins, then the shared library, otherwise a new item is drafted. Matching is a
 * case-insensitive exact name, so "Healing Potion" never silently adopts
 * "Greater Healing Potion".
 */
export function resolveRecipeOutput(
  output: RecipeAiOutput,
  campaignItems: readonly NamedItem[],
  libraryItems: readonly NamedItem[],
): RecipeOutputResolution {
  const own = byName(campaignItems, output.name);
  if (own) return { kind: "campaign", item_id: own.id, name: own.name };
  const shared = byName(libraryItems, output.name);
  if (shared) return { kind: "library", library_item_id: shared.id, name: shared.name };
  return {
    kind: "create",
    draft: {
      name: output.name,
      item_type: output.item_type,
      rarity: output.rarity,
      description: output.description,
    },
  };
}

/** Human line for the confirmation step. */
export function describeOutputResolution(r: RecipeOutputResolution): string {
  return r.kind === "create" ? `Creates a new item: ${r.draft.name}` : `Uses ${r.name}`;
}

export function disciplineLabel(id: CraftingDiscipline): string {
  return CRAFTING_DISCIPLINES.find((d) => d.id === id)?.label ?? id;
}
