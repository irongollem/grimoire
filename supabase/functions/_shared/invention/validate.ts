import {
  bandFor,
  budgetFor,
  canAttune,
  magicDcFor,
  MUNDANE_DC,
  diceAverage,
  laneFor,
  MAGIC_ONLY_TYPES,
  parseDice,
  rarityCeiling,
  rarityIndex,
  rarityLabel,
  timeFloorFor,
  toMinutes,
} from "./budget.ts";
import { formatCostCp, unitValueCp } from "./price.ts";
import { scanProse } from "./prose.ts";
import {
  ITEM_RARITIES,
  ITEM_TYPES,
  type CraftingDiscipline,
  type DamageRoll,
  type InventionBenchEntry,
  type InventionDraft,
  type InventionIngredient,
  type InventionItemRef,
  type InventionMechanic,
  type InventionMode,
  type InventionNewItem,
  type InventionNewMaterial,
  type InventionOutput,
  type InventionRecipe,
  type ItemRarity,
  type ItemType,
} from "./types.ts";

export { formatCostCp, unitValueCp } from "./price.ts";
export { laneFor, rarityCeiling, RARITY_ORDER } from "./budget.ts";
export type { InventionDraft } from "./types.ts";

export interface InventionCandidate {
  key: string;
  ref: InventionItemRef;
  name: string;
  rarity: ItemRarity;
  item_type: ItemType;
  cost: string | null;
  requires_attunement: boolean;
  charges: number | null;
  spell_count: number;
}

export interface InventionContext {
  mode: InventionMode;
  discipline: CraftingDiscipline;
  valueMultiple: number;
  bench: InventionBenchEntry[];
  outputCandidates: InventionCandidate[];
  materialCandidates: InventionCandidate[];
}

export type InventionVerdict =
  | { kind: "draft"; draft: InventionDraft }
  | { kind: "nothing"; reason: string }
  | { kind: "invalid"; errors: string[] };

type Obj = Record<string, unknown>;

const NAME_MAX = 120;
const SHORT_MAX = 500;
const DESCRIPTION_MAX = 1000;
const PROSE_MAX = 2000;
const MAX_INGREDIENTS = 8;
const MAX_NEW_MATERIALS = 2;
const MAX_INGREDIENT_QTY = 20;
const MAX_OUTPUT_QTY = 100;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function absent(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}
function clip(s: string, max: number): string {
  return s.trim().slice(0, max).trim();
}
function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}
function asRarity(v: unknown): ItemRarity | null {
  return typeof v === "string" && (ITEM_RARITIES as readonly string[]).includes(v) ? (v as ItemRarity) : null;
}
function asItemType(v: unknown): ItemType | null {
  return typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v) ? (v as ItemType) : null;
}
function money(cp: number): string {
  return formatCostCp(cp);
}

/** A string field that may be left out: absent gives an explicit null, a wrong type is an error. */
function optionalText(o: Obj, key: string, max: number, label: string, errors: string[]): string | null {
  const v = o[key];
  if (absent(v)) return null;
  if (typeof v !== "string") {
    errors.push(`${label} must be text.`);
    return null;
  }
  const t = clip(v, max);
  return t === "" ? null : t;
}

function requiredText(o: Obj, key: string, max: number, label: string, errors: string[], allowEmpty: boolean): string {
  const v = o[key];
  if (typeof v !== "string") {
    errors.push(`${label} is missing.`);
    return "";
  }
  const t = clip(v, max);
  if (t === "" && !allowEmpty) errors.push(`${label} is empty.`);
  return t;
}

// ── Mechanics ──────────────────────────────────────────────────────────────

function parseMechanics(raw: unknown, errors: string[]): InventionMechanic[] {
  if (absent(raw)) return [];
  if (!Array.isArray(raw)) {
    errors.push("The mechanics must be a list.");
    return [];
  }
  const out: InventionMechanic[] = [];
  raw.forEach((entry, i) => {
    const at = `Mechanic ${i + 1}`;
    if (!isObj(entry) || typeof entry.kind !== "string") {
      errors.push(`${at} is not a typed effect.`);
      return;
    }
    const text = (key: string): string | null => {
      const v = entry[key];
      const t = typeof v === "string" ? clip(v, SHORT_MAX) : "";
      if (t === "") {
        errors.push(`${at} (${entry.kind}) needs a ${key}.`);
        return null;
      }
      return t;
    };
    const dice = (): string | null => {
      const d = text("dice");
      if (d !== null && parseDice(d) === null) {
        errors.push(`${at} has dice "${d}" that cannot be read; use a form like 1d6 or 2d4+2.`);
        return null;
      }
      return d;
    };
    switch (entry.kind) {
      case "minor": {
        const t = text("text");
        if (t !== null) out.push({ kind: "minor", text: t });
        break;
      }
      case "attack_bonus":
      case "ac_bonus":
      case "save_bonus": {
        const value = intIn(entry.value, 1, 1000);
        if (value === null) errors.push(`${at} (${entry.kind}) needs a whole number of 1 or more.`);
        else out.push({ kind: entry.kind, value });
        break;
      }
      case "extra_damage": {
        const d = dice();
        const t = text("damage_type");
        if (d !== null && t !== null) out.push({ kind: "extra_damage", dice: d, damage_type: t });
        break;
      }
      case "healing": {
        const d = dice();
        if (d !== null) out.push({ kind: "healing", dice: d });
        break;
      }
      case "spell": {
        const name = text("name");
        const level = intIn(entry.level, 0, 9);
        if (level === null) errors.push(`${at} (spell) needs a level from 0 to 9.`);
        if (name !== null && level !== null) out.push({ kind: "spell", name, level });
        break;
      }
      case "charges": {
        const max = intIn(entry.max, 1, 1000);
        if (max === null) {
          errors.push(`${at} (charges) needs a whole number of 1 or more.`);
          break;
        }
        const recharge = typeof entry.recharge === "string" && clip(entry.recharge, SHORT_MAX) !== "" ? clip(entry.recharge, SHORT_MAX) : null;
        out.push({ kind: "charges", max, recharge });
        break;
      }
      case "resistance": {
        const t = text("damage_type");
        if (t !== null) out.push({ kind: "resistance", damage_type: t });
        break;
      }
      case "advantage": {
        const t = text("on");
        if (t !== null) out.push({ kind: "advantage", on: t });
        break;
      }
      default:
        errors.push(`${at} has an unknown kind "${clip(entry.kind, 40)}".`);
    }
  });
  return out;
}

function checkMechanicBudget(rarity: ItemRarity, mechanics: readonly InventionMechanic[]): string[] {
  const b = budgetFor(rarity);
  const label = rarityLabel(rarity);
  const errors: string[] = [];
  const effects = mechanics.filter((m) => m.kind !== "charges");
  if (effects.length > b.effectsMax) {
    errors.push(`A ${label} item may carry at most ${b.effectsMax} effect${b.effectsMax === 1 ? "" : "s"}, not ${effects.length}.`);
  }
  if (b.minorOnly && effects.some((m) => m.kind !== "minor")) {
    errors.push("A mundane item may only carry a minor, flavorful effect.");
  }
  const chargeEntries = mechanics.filter((m) => m.kind === "charges");
  if (chargeEntries.length > 1) errors.push("Declare charges once.");
  let damageAvg = 0;
  let healAvg = 0;
  const resisted = new Set<string>();
  for (const m of mechanics) {
    switch (m.kind) {
      case "attack_bonus":
      case "ac_bonus":
      case "save_bonus":
        if (m.value > b.bonusMax) {
          errors.push(b.bonusMax === 0 ? `A ${label} item cannot carry a bonus.` : `A ${label} item may carry a bonus of at most +${b.bonusMax}, not +${m.value}.`);
        }
        break;
      case "extra_damage": {
        const d = parseDice(m.dice);
        if (d) damageAvg += diceAverage(d);
        break;
      }
      case "healing": {
        const d = parseDice(m.dice);
        if (d) healAvg += diceAverage(d);
        break;
      }
      case "spell":
        if (b.spellLevelMax === null || m.level > b.spellLevelMax) {
          errors.push(b.spellLevelMax === null ? `A ${label} item cannot cast spells.` : `A ${label} item may cast spells of level ${b.spellLevelMax} or lower, not ${m.name} at level ${m.level}.`);
        }
        break;
      case "charges":
        if (m.max > b.chargesMax) {
          errors.push(b.chargesMax === 0 ? `A ${label} item cannot have charges.` : `A ${label} item may have at most ${b.chargesMax} charges, not ${m.max}.`);
        }
        break;
      case "resistance":
        resisted.add(m.damage_type.toLowerCase());
        break;
      case "advantage":
        if (!b.advantage) errors.push(`A ${label} item cannot grant advantage.`);
        break;
      default:
        break;
    }
  }
  if (damageAvg > b.extraDamageAvgMax) {
    errors.push(b.extraDamageAvgMax === 0 ? `A ${label} item cannot add damage.` : `Extra damage averages ${damageAvg}, over the ${b.extraDamageAvgMax} a ${label} item allows.`);
  }
  if (healAvg > b.healingAvgMax) {
    errors.push(b.healingAvgMax === 0 ? `A ${label} item cannot heal.` : `Healing averages ${healAvg}, over the ${b.healingAvgMax} a ${label} item allows.`);
  }
  if (resisted.size > b.resistanceTypes) {
    errors.push(b.resistanceTypes === 0 ? `A ${label} item cannot grant resistance.` : `A ${label} item may grant resistance to at most ${b.resistanceTypes} damage type${b.resistanceTypes === 1 ? "" : "s"}.`);
  }
  return errors;
}

// ── Ingredients ────────────────────────────────────────────────────────────

interface IngredientResult {
  ingredients: InventionIngredient[];
}

function benchIngredients(bench: readonly InventionBenchEntry[], errors: string[]): IngredientResult {
  const ingredients: InventionIngredient[] = [];
  if (bench.length === 0) errors.push("The bench is empty.");
  if (bench.length > MAX_INGREDIENTS) errors.push(`The bench holds more than ${MAX_INGREDIENTS} different materials.`);
  for (const row of bench) {
    const ref: InventionItemRef | null = row.item_id !== null ? { item_id: row.item_id } : row.library_item_id !== null ? { library_item_id: row.library_item_id } : null;
    if (ref === null || !Number.isInteger(row.dishes) || row.dishes < 1) {
      errors.push(`The bench row "${row.name}" is not a usable material.`);
      continue;
    }
    ingredients.push({ ref, new: null, name: row.name, rarity: row.rarity, value_cp: unitValueCp(row.cost, row.rarity), quantity: row.dishes });
  }
  return { ingredients };
}

function cleanMaterialBand(rarity: ItemRarity, value: number): number {
  const band = bandFor(rarity);
  const low = Math.max(value, band.min);
  return band.max === null ? low : Math.min(low, band.max);
}

function ideaIngredients(
  raw: unknown,
  candidates: readonly InventionCandidate[],
  errors: string[],
  adjustments: string[],
): IngredientResult {
  const ingredients: InventionIngredient[] = [];
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push("The ingredients must be a list with at least one material.");
    return { ingredients };
  }
  let newCount = 0;
  raw.forEach((entry, i) => {
    const at = `Ingredient ${i + 1}`;
    if (!isObj(entry)) {
      errors.push(`${at} is not an object.`);
      return;
    }
    const quantity = intIn(entry.quantity, 1, MAX_INGREDIENT_QTY);
    if (quantity === null) {
      errors.push(`${at} needs a quantity from 1 to ${MAX_INGREDIENT_QTY}.`);
      return;
    }
    if (typeof entry.candidate_id === "string") {
      const c = candidates.find((x) => x.key === entry.candidate_id);
      if (!c) {
        errors.push(`${at} names "${clip(entry.candidate_id, 40)}", which is not a listed material.`);
        return;
      }
      ingredients.push({ ref: c.ref, new: null, name: c.name, rarity: c.rarity, value_cp: unitValueCp(c.cost, c.rarity), quantity });
      return;
    }
    if (!isObj(entry.new)) {
      errors.push(`${at} needs either a candidate_id or a new material.`);
      return;
    }
    newCount++;
    const n = entry.new;
    const name = requiredText(n, "name", NAME_MAX, `${at} name`, errors, false);
    const rawRarity = asRarity(n.rarity);
    if (rawRarity === null) errors.push(`${at} has an unknown rarity.`);
    const rawValue = typeof n.value_cp === "number" && Number.isFinite(n.value_cp) ? Math.round(n.value_cp) : null;
    if (rawValue === null) errors.push(`${at} needs a value_cp number.`);
    const description = optionalText(n, "description", DESCRIPTION_MAX, `${at} description`, errors);
    if (name === "" || rawRarity === null || rawValue === null) return;
    const rarity: ItemRarity = rawRarity === "artifact" ? "legendary" : rawRarity;
    const match = candidates.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (match) {
      adjustments.push(`Matched to the existing ${match.name}.`);
      ingredients.push({ ref: match.ref, new: null, name: match.name, rarity: match.rarity, value_cp: unitValueCp(match.cost, match.rarity), quantity });
      return;
    }
    const value = cleanMaterialBand(rarity, rawValue);
    if (value !== rawValue) adjustments.push(`${name} priced at ${money(value)} to fit ${rarityLabel(rarity)}.`);
    const material: InventionNewMaterial = {
      name,
      item_type: "crafting_material",
      rarity,
      cost: formatCostCp(value),
      value_cp: value,
      description: description === null ? "" : description,
      tags: [],
    };
    ingredients.push({ ref: null, new: material, name, rarity, value_cp: value, quantity });
  });
  if (newCount > MAX_NEW_MATERIALS) errors.push(`At most ${MAX_NEW_MATERIALS} new materials may be invented.`);

  const merged: InventionIngredient[] = [];
  for (const ing of ingredients) {
    const same = merged.find((m) => sameIngredient(m, ing));
    if (same) {
      if (same.quantity + ing.quantity > MAX_INGREDIENT_QTY) {
        adjustments.push(`${same.name} limited to ${MAX_INGREDIENT_QTY}.`);
        same.quantity = MAX_INGREDIENT_QTY;
      } else {
        same.quantity += ing.quantity;
      }
    } else {
      merged.push({ ...ing });
    }
  }
  if (merged.length > MAX_INGREDIENTS) errors.push(`At most ${MAX_INGREDIENTS} different ingredients may be listed.`);
  return { ingredients: merged };
}

function refKey(r: InventionItemRef | null): string | null {
  if (r === null) return null;
  return "item_id" in r ? `i:${r.item_id}` : `l:${r.library_item_id}`;
}
function sameIngredient(a: InventionIngredient, b: InventionIngredient): boolean {
  const ka = refKey(a.ref);
  const kb = refKey(b.ref);
  if (ka !== null || kb !== null) return ka === kb;
  return a.name.toLowerCase() === b.name.toLowerCase();
}

// ── Existing and new outputs ───────────────────────────────────────────────

interface Fit {
  quantity: number;
  value: number;
}

function laneErrors(ctx: InventionContext, type: ItemType, rarity: ItemRarity): string[] {
  const errors: string[] = [];
  if (!laneFor(ctx.discipline).includes(type)) {
    errors.push(`${ctx.discipline} cannot make an item of type ${type.replace(/_/g, " ")}.`);
  }
  if (MAGIC_ONLY_TYPES.includes(type) && rarityIndex(rarity) < rarityIndex("common")) {
    errors.push(`A ${type.replace(/_/g, " ")} cannot be mundane.`);
  }
  return errors;
}

function checkCandidate(c: InventionCandidate, ceiling: ItemRarity, ctx: InventionContext): string[] {
  const errors: string[] = [];
  if (rarityIndex(c.rarity) > rarityIndex(ceiling)) {
    errors.push(`${c.name} is ${rarityLabel(c.rarity)}, rarer than these materials allow (${rarityLabel(ceiling)}).`);
  }
  errors.push(...laneErrors(ctx, c.item_type, c.rarity));
  const b = budgetFor(c.rarity);
  if (c.requires_attunement && !canAttune(c.rarity)) errors.push(`${c.name} needs attunement, which ${rarityLabel(c.rarity)} items cannot.`);
  if (c.charges !== null && c.charges > b.chargesMax) errors.push(`${c.name} has more charges than a ${rarityLabel(c.rarity)} item allows.`);
  if (c.spell_count > 0) errors.push(`${c.name} casts spells, which an invention cannot reuse.`);
  const plus = /\+(\d+)/.exec(c.name);
  if (plus && Number(plus[1]) > b.bonusMax) errors.push(`${c.name} carries a bonus beyond what a ${rarityLabel(c.rarity)} item allows.`);
  return errors;
}

/** Reduces the quantity of an existing item to fit; null when even one is too dear. */
function fitExisting(unit: number, quantity: number, limit: number): Fit | null {
  if (unit * quantity <= limit) return { quantity, value: unit };
  const q = Math.floor(limit / unit);
  return q >= 1 ? { quantity: q, value: unit } : null;
}

function fitNew(value: number, quantity: number, limit: number, rarity: ItemRarity): Fit | null {
  if (value * quantity <= limit) return { quantity, value };
  if (quantity > 1 && Math.floor(limit / value) >= 1) return { quantity: Math.floor(limit / value), value };
  const lowered = Math.floor(limit / 1);
  const band = bandFor(rarity);
  return lowered >= band.min && lowered <= value ? { quantity: 1, value: lowered } : null;
}

function parseDamageDice(raw: unknown, type: unknown, errors: string[]): DamageRoll[] | null {
  if (absent(raw)) return null;
  if (typeof raw !== "string" || parseDice(raw) === null) {
    errors.push("The weapon damage dice cannot be read; use a form like 1d8.");
    return null;
  }
  const d = parseDice(raw);
  if (d && d.count * d.sides > 12) errors.push("The weapon damage may roll at most 12 (1d12 or 2d6).");
  return [{ dice: raw.replace(/\s+/g, ""), type: typeof type === "string" ? clip(type, 40) : "" }];
}

// ── The entry point ────────────────────────────────────────────────────────

export function validateInvention(raw: unknown, ctx: InventionContext): InventionVerdict {
  if (!isObj(raw)) return { kind: "invalid", errors: ["The answer must be a JSON object."] };

  if (raw.nothing === true) {
    if (ctx.mode !== "materials") return { kind: "invalid", errors: ["An idea must produce a draft; answering with nothing is not allowed."] };
    const reason = typeof raw.reason === "string" && clip(raw.reason, 300) !== "" ? clip(raw.reason, 300) : "Nothing sensible can be made from these materials.";
    return { kind: "nothing", reason };
  }

  const errors: string[] = [];
  const adjustments: string[] = [];

  // Ingredients decide the ceiling and the budget of value.
  const { ingredients } =
    ctx.mode === "materials"
      ? benchIngredients(ctx.bench, errors)
      : ideaIngredients(raw.ingredients, ctx.materialCandidates, errors, adjustments);
  const ceiling = rarityCeiling(ingredients.map((i) => i.rarity));
  const materialsValue = ingredients.reduce((s, i) => s + i.value_cp * i.quantity, 0);
  const limit = Math.floor(materialsValue * ctx.valueMultiple);

  const quantityRaw = intIn(raw.quantity, 1, MAX_OUTPUT_QTY);
  if (quantityRaw === null) errors.push(`The quantity must be a whole number from 1 to ${MAX_OUTPUT_QTY}.`);

  const outputRaw = raw.output;
  if (!isObj(outputRaw)) {
    errors.push("The output is missing.");
    return { kind: "invalid", errors };
  }

  // Recipe text is validated up front so every problem is reported in one round.
  const recipeRaw = isObj(raw.recipe) ? raw.recipe : null;
  if (recipeRaw === null) errors.push("The recipe is missing.");
  const recipeName = recipeRaw ? requiredText(recipeRaw, "name", NAME_MAX, "The recipe name", errors, false) : "";
  const recipeDescription = recipeRaw ? requiredText(recipeRaw, "description", DESCRIPTION_MAX, "The recipe description", errors, true) : "";
  const timeRaw = recipeRaw ? recipeRaw.crafting_time : undefined;
  const unitRaw = recipeRaw ? recipeRaw.crafting_time_unit : undefined;
  const unit: InventionRecipe["crafting_time_unit"] | null = unitRaw === "minutes" || unitRaw === "hours" || unitRaw === "days" ? unitRaw : null;
  if (recipeRaw && (typeof timeRaw !== "number" || !Number.isFinite(timeRaw) || unit === null)) {
    errors.push("The recipe needs a crafting_time number and a unit of minutes, hours or days.");
  }

  let output: InventionOutput | null = null;
  let mechanics: InventionMechanic[] = [];
  let quantity = quantityRaw === null ? 1 : quantityRaw;
  let existing: InventionCandidate | null = null;

  if (typeof outputRaw.candidate_id === "string") {
    const c = ctx.outputCandidates.find((x) => x.key === outputRaw.candidate_id);
    if (!c) errors.push(`The output names "${clip(outputRaw.candidate_id, 40)}", which is not a listed item.`);
    else existing = c;
  } else if (!isObj(outputRaw.new)) {
    errors.push("The output needs either a candidate_id or a new item.");
  }

  let newSource: Obj | null = isObj(outputRaw.new) ? outputRaw.new : null;
  // Prefer what exists: a new item that is just a listed one becomes that one.
  if (existing === null && newSource !== null && typeof newSource.name === "string") {
    const wanted = clip(newSource.name, NAME_MAX).toLowerCase();
    const match = wanted === "" ? undefined : ctx.outputCandidates.find((c) => c.name.trim().toLowerCase() === wanted);
    if (match && checkCandidate(match, ceiling, ctx).length === 0 && fitExisting(unitValueCp(match.cost, match.rarity), quantity, limit) !== null) {
      existing = match;
      newSource = null;
      adjustments.push(`Matched to the existing ${match.name}.`);
    }
  }

  let outRarity: ItemRarity = "common";

  if (existing !== null) {
    errors.push(...checkCandidate(existing, ceiling, ctx));
    const unit1 = unitValueCp(existing.cost, existing.rarity);
    const fit = fitExisting(unit1, quantity, limit);
    if (fit === null) {
      errors.push(`${existing.name} is worth more than these materials can pay for.`);
    } else {
      if (fit.quantity !== quantity) adjustments.push(`Quantity reduced to ${fit.quantity} to fit the value of the materials.`);
      quantity = fit.quantity;
    }
    outRarity = existing.rarity;
    output = { ref: existing.ref, new: null, name: existing.name, rarity: existing.rarity, item_type: existing.item_type, value_cp: unit1 };
  } else if (newSource !== null) {
    const n = newSource;
    const name = requiredText(n, "name", NAME_MAX, "The item name", errors, false);
    const type = asItemType(n.item_type);
    if (type === null) errors.push("The item type is not one the game knows.");
    const rarityIn = asRarity(n.rarity);
    if (rarityIn === null) errors.push("The item rarity is not one the game knows.");
    const valueIn = typeof n.value_cp === "number" && Number.isFinite(n.value_cp) ? Math.round(n.value_cp) : null;
    if (valueIn === null) errors.push("The item needs a value_cp number.");
    const flavor = requiredText(n, "flavor", PROSE_MAX, "The flavor text", errors, true);
    const rulesText = requiredText(n, "rules_text", PROSE_MAX, "The rules text", errors, true);
    const subtype = optionalText(n, "subtype", NAME_MAX, "The subtype", errors);
    const attunementReq = optionalText(n, "attunement_requirements", SHORT_MAX, "The attunement requirement", errors);
    const recharge = optionalText(n, "recharge", SHORT_MAX, "The recharge", errors);
    const armorClass = optionalText(n, "armor_class", 40, "The armor class", errors);
    if (!absent(n.weight) && (typeof n.weight !== "number" || !Number.isFinite(n.weight) || n.weight < 0)) errors.push("The weight must be a number of 0 or more.");
    const weight = typeof n.weight === "number" && Number.isFinite(n.weight) && n.weight >= 0 ? n.weight : null;
    if (!absent(n.requires_attunement) && typeof n.requires_attunement !== "boolean") errors.push("requires_attunement must be true or false.");
    let attune = n.requires_attunement === true;
    const chargesIn = absent(n.charges) ? null : intIn(n.charges, 0, 1000);
    if (!absent(n.charges) && chargesIn === null) errors.push("The charges must be a whole number.");
    let properties: string[] = [];
    if (!absent(n.properties)) {
      if (Array.isArray(n.properties) && n.properties.every((p) => typeof p === "string")) {
        properties = (n.properties as string[]).map((p) => clip(p, 60)).filter((p) => p !== "").slice(0, 12);
      } else errors.push("The properties must be a list of text.");
    }
    mechanics = parseMechanics(raw.mechanics, errors);
    const damageRolls = parseDamageDice(n.damage_dice, n.damage_type, errors);
    if (armorClass !== null) {
      const lead = /^\s*(\d+)/.exec(armorClass);
      if (lead && Number(lead[1]) > 18) errors.push("The armor class may be at most 18.");
    }

    if (name !== "" && type !== null && rarityIn !== null && valueIn !== null) {
      let rarity = rarityIn;
      if (rarityIndex(rarity) > rarityIndex(ceiling)) {
        adjustments.push(`Rarity lowered to ${rarityLabel(ceiling)}, the rarest these materials allow.`);
        rarity = ceiling;
      }
      outRarity = rarity;
      errors.push(...laneErrors(ctx, type, rarity));
      errors.push(...checkMechanicBudget(rarity, mechanics));

      if (attune && !canAttune(rarity)) {
        attune = false;
        adjustments.push(`Attunement removed, since ${rarityLabel(rarity)} items cannot need it.`);
      }
      const declared = mechanics.find((m) => m.kind === "charges");
      const charges = declared && declared.kind === "charges" ? declared.max : null;
      if (chargesIn !== charges) {
        adjustments.push(charges === null ? "Charges removed, since no charges effect is declared." : `Charges set to ${charges} to match the declared effect.`);
      }
      const itemRecharge = charges === null ? null : declared && declared.kind === "charges" && declared.recharge !== null ? declared.recharge : recharge;

      const clamped = cleanMaterialBand(rarity, valueIn);
      if (clamped !== valueIn) adjustments.push(`Value set to ${money(clamped)} to fit a ${rarityLabel(rarity)} item.`);
      const fit = fitNew(clamped, quantity, limit, rarity);
      let finalValue = clamped;
      if (fit === null) {
        errors.push(`These materials are not worth enough for a ${rarityLabel(rarity)} item.`);
      } else {
        if (fit.quantity !== quantity) adjustments.push(`Quantity reduced to ${fit.quantity} to fit the value of the materials.`);
        if (fit.value !== clamped) adjustments.push(`Value lowered to ${money(fit.value)} to fit the materials.`);
        quantity = fit.quantity;
        finalValue = fit.value;
      }

      const item: InventionNewItem = {
        name,
        item_type: type,
        subtype,
        rarity,
        cost: formatCostCp(finalValue),
        value_cp: finalValue,
        weight,
        flavor,
        rules_text: rulesText,
        description: [flavor, rulesText].filter((s) => s !== "").join("\n\n"),
        requires_attunement: attune,
        attunement_requirements: attune ? attunementReq : null,
        charges,
        recharge: itemRecharge,
        damage_rolls: damageRolls,
        armor_class: armorClass,
        properties,
        tags: [],
      };
      output = { ref: null, new: item, name, rarity, item_type: type, value_cp: finalValue };
    }
  }

  // Recipe: DC from rarity, time floored.
  let recipe: InventionRecipe | null = null;
  if (output !== null && recipeRaw && recipeName !== "" && unit !== null && typeof timeRaw === "number" && Number.isFinite(timeRaw)) {
    let time = Math.min(10000, Math.max(1, Math.round(timeRaw)));
    let timeUnit = unit;
    const floor = timeFloorFor(outRarity);
    if (toMinutes(time, timeUnit) < toMinutes(floor.value, floor.unit)) {
      time = floor.value;
      timeUnit = floor.unit;
      adjustments.push(`Crafting time raised to ${floor.value} ${floor.unit === "hours" && floor.value === 1 ? "hour" : floor.unit}.`);
    }
    let dc = magicDcFor(outRarity);
    const magic = dc !== null;
    if (dc === null) {
      const given = recipeRaw.dc;
      if (typeof given !== "number" || !Number.isInteger(given)) {
        dc = MUNDANE_DC.fallback;
      } else {
        dc = Math.min(MUNDANE_DC.max, Math.max(MUNDANE_DC.min, given));
        if (dc !== given) adjustments.push(`Crafting DC set to ${dc}, within the ${MUNDANE_DC.min} to ${MUNDANE_DC.max} a mundane item allows.`);
      }
    }
    const special = optionalText(recipeRaw, "special_requirement", 120, "The special requirement", errors);
    const proficient = magic || recipeRaw.requires_proficiency === true;
    const description = special === null ? recipeDescription : [recipeDescription, `Also needs: ${special}.`].filter((t) => t !== "").join("\n");
    recipe = { name: recipeName, description, dc, requires_proficiency: proficient, requires_tools: true, special_requirement: special, crafting_time: time, crafting_time_unit: timeUnit };
  }

  if (errors.length > 0 || output === null || recipe === null) {
    return { kind: "invalid", errors: errors.length > 0 ? [...new Set(errors)] : ["The draft could not be built."] };
  }

  const warnings =
    output.new !== null
      ? scanProse({
          name: output.new.name,
          flavor: output.new.flavor,
          // A minor effect's own words are rules too: "+5 AC" written as a minor effect must warn.
          rulesText: [output.new.rules_text, ...mechanics.flatMap((m) => (m.kind === "minor" ? [m.text] : []))].join("\n"),
          baseDice: output.new.damage_rolls ? output.new.damage_rolls.map((d) => d.dice).join(" ") : null,
          mechanics,
        })
      : [];

  return {
    kind: "draft",
    draft: {
      item: output,
      mechanics,
      quantity,
      recipe,
      ingredients,
      materials_value_cp: materialsValue,
      value_multiple: ctx.valueMultiple,
      value_limit_cp: limit,
      rarity_ceiling: ceiling,
      adjustments,
      warnings,
    },
  };
}
