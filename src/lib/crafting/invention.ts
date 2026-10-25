import { formatCoinParts, fromCP } from "@/rules/currency";
import { ITEM_RARITIES, ITEM_TYPES } from "@/types/item.types";
import type {
  CraftingInvention,
  InventionDraft,
  InventionIngredient,
  InventionMechanic,
  InventionOutput,
  InventionStatus,
} from "@/types/crafting.types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(what: string): never {
  throw new Error(`Unexpected invention: ${what}`);
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== "string") fail(`${where}.${key} is not text`);
  return v;
}

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${where}.${key} is not a number`);
  return v;
}

function strOrNull(o: Record<string, unknown>, key: string, where: string): string | null {
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== "string") fail(`${where}.${key} is not text or null`);
  return v;
}

function strList(o: Record<string, unknown>, key: string, where: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) fail(`${where}.${key} is not a list of text`);
  return v as string[];
}

function checkRarity(o: Record<string, unknown>, key: string, where: string): void {
  const v = str(o, key, where);
  if (!(ITEM_RARITIES as readonly string[]).includes(v)) fail(`${where}.${key} is not a rarity`);
}

function checkItemType(o: Record<string, unknown>, key: string, where: string): void {
  const v = str(o, key, where);
  if (!(ITEM_TYPES as readonly string[]).includes(v)) fail(`${where}.${key} is not an item type`);
}

function checkRef(v: unknown, where: string): void {
  if (!isRecord(v) || (typeof v.item_id !== "string" && typeof v.library_item_id !== "string")) {
    fail(`${where} is not an item reference`);
  }
}

/** Exactly one of `ref` and `new` is an object; the other is null. */
function checkOneOf(o: Record<string, unknown>, where: string): void {
  const hasRef = o.ref !== null && o.ref !== undefined;
  const hasNew = o.new !== null && o.new !== undefined;
  if (hasRef === hasNew) fail(`${where} needs exactly one of ref and new`);
  if (hasRef) checkRef(o.ref, `${where}.ref`);
  else if (!isRecord(o.new)) fail(`${where}.new is not an object`);
}

function checkMechanic(m: unknown, i: number): void {
  const where = `mechanics[${i}]`;
  if (!isRecord(m)) fail(`${where} is not an object`);
  switch (m.kind) {
    case "minor":
      str(m, "text", where);
      return;
    case "attack_bonus":
    case "ac_bonus":
    case "save_bonus":
      num(m, "value", where);
      return;
    case "extra_damage":
      str(m, "dice", where);
      str(m, "damage_type", where);
      return;
    case "healing":
      str(m, "dice", where);
      return;
    case "spell":
      str(m, "name", where);
      num(m, "level", where);
      return;
    case "charges":
      num(m, "max", where);
      strOrNull(m, "recharge", where);
      return;
    case "resistance":
      str(m, "damage_type", where);
      return;
    case "advantage":
      str(m, "on", where);
      return;
    default:
      fail(`${where} has an unknown kind`);
  }
}

function checkDraft(d: unknown): asserts d is InventionDraft {
  if (!isRecord(d)) fail("draft is not an object");

  const item = d.item;
  if (!isRecord(item)) fail("draft.item is not an object");
  checkOneOf(item, "draft.item");
  str(item, "name", "draft.item");
  checkRarity(item, "rarity", "draft.item");
  checkItemType(item, "item_type", "draft.item");
  num(item, "value_cp", "draft.item");
  if (isRecord(item.new)) {
    str(item.new, "rules_text", "draft.item.new");
    str(item.new, "flavor", "draft.item.new");
  }

  if (!Array.isArray(d.mechanics)) fail("draft.mechanics is not a list");
  d.mechanics.forEach(checkMechanic);

  if (num(d, "quantity", "draft") < 1) fail("draft.quantity is below 1");

  const recipe = d.recipe;
  if (!isRecord(recipe)) fail("draft.recipe is not an object");
  str(recipe, "name", "draft.recipe");
  str(recipe, "description", "draft.recipe");
  num(recipe, "dc", "draft.recipe");
  num(recipe, "crafting_time", "draft.recipe");
  if (typeof recipe.requires_tools !== "boolean") fail("draft.recipe.requires_tools is not true or false");
  strOrNull(recipe, "special_requirement", "draft.recipe");
  if (typeof recipe.requires_proficiency !== "boolean") fail("draft.recipe.requires_proficiency is not true or false");
  if (!["minutes", "hours", "days"].includes(str(recipe, "crafting_time_unit", "draft.recipe"))) {
    fail("draft.recipe.crafting_time_unit is not a unit");
  }

  if (!Array.isArray(d.ingredients) || d.ingredients.length < 1) fail("draft.ingredients is empty");
  d.ingredients.forEach((g: unknown, i: number) => {
    const where = `draft.ingredients[${i}]`;
    if (!isRecord(g)) fail(`${where} is not an object`);
    checkOneOf(g, where);
    str(g, "name", where);
    checkRarity(g, "rarity", where);
    num(g, "value_cp", where);
    num(g, "quantity", where);
  });

  num(d, "materials_value_cp", "draft");
  num(d, "value_multiple", "draft");
  num(d, "value_limit_cp", "draft");
  checkRarity(d, "rarity_ceiling", "draft");
  strList(d, "adjustments", "draft");
  strList(d, "warnings", "draft");
}

const STATUSES: readonly InventionStatus[] = ["draft", "pending", "approved"];

/** Reads a `crafting_inventions` row. Throws on anything the table does not promise, so a changed server shows up loudly. */
export function parseInvention(row: unknown): CraftingInvention {
  if (!isRecord(row)) fail("row is not an object");
  for (const key of ["id", "campaign_id", "party_member_id", "user_id", "discipline", "created_at", "updated_at"]) {
    str(row, key, "row");
  }
  if (row.mode !== "materials" && row.mode !== "idea") fail("row.mode is not a mode");
  if (!STATUSES.includes(row.status as InventionStatus)) fail("row.status is not a status");
  num(row, "revision", "row");
  strOrNull(row, "wish", "row");
  strOrNull(row, "dm_note", "row");
  strOrNull(row, "recipe_id", "row");
  strOrNull(row, "decided_by", "row");
  strOrNull(row, "decided_at", "row");
  if (!Array.isArray(row.bench)) fail("row.bench is not a list");
  if (!isRecord(row.ai_provenance)) fail("row.ai_provenance is not an object");
  checkDraft(row.draft);
  return row as unknown as CraftingInvention;
}

/** One game-ready line for a declared mechanic. */
export function inventionMechanicLine(m: InventionMechanic): string {
  switch (m.kind) {
    case "minor":
      return m.text;
    case "attack_bonus":
      return `+${m.value} to attack and damage rolls`;
    case "ac_bonus":
      return `+${m.value} to Armor Class`;
    case "save_bonus":
      return `+${m.value} to saving throws`;
    case "extra_damage":
      return `Extra ${m.dice} ${m.damage_type} damage on a hit`;
    case "healing":
      return `Regains ${m.dice} hit points`;
    case "spell":
      return m.level === 0 ? `Casts ${m.name} (cantrip)` : `Casts ${m.name} (${ordinal(m.level)} level)`;
    case "charges":
      return m.recharge ? `${m.max} charges, recharge: ${m.recharge}` : `${m.max} charges`;
    case "resistance":
      return `Resistance to ${m.damage_type} damage`;
    case "advantage":
      return `Advantage on ${m.on}`;
  }
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Copper pieces as coins in gold, silver and copper (items are priced in gp, so platinum folds in), e.g. 4000 -> "40 GP". */
export function inventionValueText(cp: number): string {
  const c = fromCP(Math.max(0, Math.round(cp)));
  const parts = formatCoinParts(0, c.gp + c.pp * 10, 0, c.sp, c.cp);
  return parts.length > 0 ? parts.join(" ") : "0 CP";
}

/** The status chip's words, from whose screen it is. */
export function inventionStatusLabel(status: InventionStatus, viewer: "player" | "dm"): string {
  if (viewer === "player") {
    return status === "draft" ? "Draft" : status === "pending" ? "With your DM" : "In your recipes";
  }
  return status === "pending" ? "Waiting for you" : status === "draft" ? "Sent back" : "Approved";
}

/** The line posted to the campaign chat when an invention is approved. */
export function inventionChatMessage(characterName: string, itemName: string): string {
  return `🛠️ **${characterName}** invented **${itemName}**.`;
}

/** An ingredient the DM accepts along with the draft (a material that does not exist yet). */
export function ingredientIsNew(i: InventionIngredient): boolean {
  return i.new !== null;
}

/** An output that does not exist yet. */
export function outputIsNew(d: { item: InventionOutput }): boolean {
  return d.item.new !== null;
}

/** "1 day", "5 days": the unit agrees with the number. */
export function inventionTimeText(time: number, unit: "minutes" | "hours" | "days"): string {
  return `${time} ${time === 1 ? unit.slice(0, -1) : unit}`;
}

/** The recipe description without a trailing "Also needs: ..." line, which the card shows on its own. */
export function recipeDescriptionText(recipe: { description: string; special_requirement: string | null }): string {
  if (!recipe.special_requirement) return recipe.description;
  return recipe.description.replace(/\s*Also needs:[^\n]*\s*$/i, "").trim();
}

/** "DC 21, needs proficiency with Mason's Tools, 50 days" or "DC 12, Cook's Utensils, 2 hours". */
export function inventionRequirementLine(
  recipe: { dc: number; crafting_time: number; crafting_time_unit: "minutes" | "hours" | "days"; requires_proficiency: boolean; requires_tools: boolean },
  tool: string,
): string {
  const parts = [`DC ${recipe.dc}`];
  if (recipe.requires_proficiency) parts.push(`needs proficiency with ${tool}`);
  else if (recipe.requires_tools) parts.push(tool);
  parts.push(inventionTimeText(recipe.crafting_time, recipe.crafting_time_unit));
  return parts.join(", ");
}
