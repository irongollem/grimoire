import type { PartyInventoryItem, InventorySlot } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { inventoryItemRef } from "@/lib/itemRef";

/**
 * Armour Class is worked out from the character and their gear, never stored.
 *
 * What counts, in the book's terms:
 *  - Body armour on the paper doll's Body slot sets the base: light is
 *    base + Dex, medium is base + Dex (max +2), heavy is the base alone.
 *  - With no body armour the base is 10 + Dex, or the best unarmoured
 *    calculation the character has: Barbarian (10 + Dex + Con), Monk
 *    (10 + Dex + Wis, and no shield), Mage Armor (13 + Dex), Draconic
 *    Resilience, natural armour, Robe of the Archmagi (15 + Dex). A character
 *    uses one calculation, so the highest they qualify for wins.
 *  - A shield counts only in the Off hand slot.
 *  - Magic items that give a flat bonus count while worn (and attuned if they
 *    ask for it): see `BONUS_ITEMS`.
 *  - Wild Shape is not handled here: the beast's AC replaces all of this, and
 *    callers apply `wildshape_state.beast_ac` before asking.
 */

// ── Armour parsing ───────────────────────────────────────────────────────────

/**
 * How a piece of body armour applies the wearer's Dexterity modifier to AC.
 * - "none"   heavy armour: fixed base, Dex ignored.
 * - "full"   light armour: base + full Dex modifier.
 * - "capped" medium armour: base + Dex modifier, but no more than `maxDex`.
 */
export type ArmorDexMode = "none" | "full" | "capped";

export interface ParsedArmor {
  /** Base AC before any Dex contribution. */
  base: number;
  dex: ArmorDexMode;
  /** Upper bound on the Dex bonus when `dex === "capped"` (medium armour = 2). */
  maxDex: number | null;
}

/**
 * Parse an `armor_class` string into structured AC components.
 *   "18"                        heavy, base 18
 *   "11 + Dex modifier"         light, base 11
 *   "14 + Dex modifier (max 2)" medium, base 14, Dex capped at 2
 *   "+1 (12 + Dex modifier)"    magic text with the bonus written first: base 13
 *
 * Returns null when the string has no readable base, so callers can say so
 * instead of guessing one.
 */
export function parseArmorClass(armorClass: string | null | undefined): ParsedArmor | null {
  if (!armorClass) return null;
  let text = armorClass;
  let bonus = 0;
  const magic = text.match(/^\s*\+(\d+)\s*\((.*)\)\s*$/);
  if (magic) {
    bonus = parseInt(magic[1], 10);
    text = magic[2];
  }
  const baseMatch = text.match(/^\s*(\d+)/);
  if (!baseMatch) return null;
  const base = parseInt(baseMatch[1], 10) + bonus;
  if (!/dex/i.test(text)) return { base, dex: "none", maxDex: null };
  const capMatch = text.match(/max\s*(\d+)/i);
  if (capMatch) return { base, dex: "capped", maxDex: parseInt(capMatch[1], 10) };
  return { base, dex: "full", maxDex: null };
}

/** Standard shield bonus, used when a shield item has no parseable armor_class. */
const DEFAULT_SHIELD_BONUS = 2;

/** The AC a shield gives: "2", "+2", "3 (magic)" read as the first signed integer. */
export function parseShieldAcBonus(armorClass: string | null | undefined): number {
  if (!armorClass) return DEFAULT_SHIELD_BONUS;
  const match = armorClass.match(/[+-]?\s*\d+/);
  if (!match) return DEFAULT_SHIELD_BONUS;
  return parseInt(match[0].replace(/\s+/g, ""), 10);
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** The Dex modifier this armour lets through. A cap limits the bonus, never a penalty. */
function dexApplied(armor: ParsedArmor, dex: number): number {
  if (armor.dex === "none") return 0;
  const mod = abilityMod(dex);
  return armor.dex === "capped" ? Math.min(mod, armor.maxDex ?? 0) : mod;
}

/** Resolve parsed armour to a concrete AC for a given Dexterity score. */
export function armorAcFor(parsed: ParsedArmor, dex: number): number {
  return parsed.base + dexApplied(parsed, dex);
}

// ── Gear data ────────────────────────────────────────────────────────────────

/**
 * Armour the library lists without an `armor_class`, keyed by conceptual key.
 * Read from the 2014 and 2024 `library_items` rows: Elven Chain and its 2024
 * forms, Glamoured Studded Leather, Dwarven Plate and Dragon Scale Mail all
 * state their AC only in prose.
 */
const NAMED_ARMOR: Record<string, ParsedArmor> = {
  elven_chain: { base: 14, dex: "capped", maxDex: 2 },
  elven_chain_shirt: { base: 14, dex: "capped", maxDex: 2 },
  elven_chain_mail: { base: 17, dex: "none", maxDex: null },
  glamoured_studded_leather: { base: 13, dex: "full", maxDex: null },
  dwarven_plate: { base: 20, dex: "none", maxDex: null },
  dwarven_half_plate: { base: 17, dex: "capped", maxDex: 2 },
  dragon_scale_mail: { base: 15, dex: "capped", maxDex: 2 },
};

/** Ordinary armours by name, for the "Mithral Armor (Plate)" family that wears like its base. */
const BASE_ARMOR: Record<string, ParsedArmor> = {
  padded: { base: 11, dex: "full", maxDex: null },
  leather: { base: 11, dex: "full", maxDex: null },
  studded_leather: { base: 12, dex: "full", maxDex: null },
  hide: { base: 12, dex: "capped", maxDex: 2 },
  chain_shirt: { base: 13, dex: "capped", maxDex: 2 },
  scale_mail: { base: 14, dex: "capped", maxDex: 2 },
  breastplate: { base: 14, dex: "capped", maxDex: 2 },
  half_plate: { base: 15, dex: "capped", maxDex: 2 },
  ring_mail: { base: 14, dex: "none", maxDex: null },
  chain_mail: { base: 16, dex: "none", maxDex: null },
  splint: { base: 17, dex: "none", maxDex: null },
  plate: { base: 18, dex: "none", maxDex: null },
};

/** Item families whose AC is the named base armour with no change (Mithral, Armor of Resistance, ...). */
const BASE_ARMOR_FAMILY = /^(?:mithral_armor|armor_of_resistance|armor_of_vulnerability)_(.+?)(?:_armor)?$/;

/** A flat AC bonus a magic item gives while it is worn. */
interface BonusItem {
  bonus: number;
  /** Slots it must sit in. Absent: any carried copy that is attuned counts (an Ioun stone orbits you). */
  slots?: readonly InventorySlot[];
  attuned: boolean;
  /** Only while wearing no armour and using no shield (Bracers of Defense). */
  unprotectedOnly?: boolean;
}

/** Flat AC bonuses, keyed by library `conceptual_key`. Read from the item text, not parsed at runtime. */
export const BONUS_ITEMS: Record<string, BonusItem> = {
  ring_of_protection: { bonus: 1, slots: ["ring"], attuned: true },
  cloak_of_protection: { bonus: 1, slots: ["shoulders"], attuned: true },
  bracers_of_defense: { bonus: 2, slots: ["hands"], attuned: true, unprotectedOnly: true },
  ioun_stone_protection: { bonus: 1, attuned: true },
  staff_of_power: { bonus: 2, slots: ["main_hand", "off_hand"], attuned: true },
};

/** Robe of the Archmagi: an unarmoured calculation carried on an item (15 + Dex, no armour). */
const ROBE_KEY = "robe_of_the_archmagi";

function slugKey(name: string): string {
  return name.toLowerCase().replace(/\+\d+/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function itemKey(item: Item): string {
  return item.conceptual_key ?? slugKey(item.name);
}

/** The armour an item wears as, or null when its AC cannot be read. */
export function armorOfItem(item: Item): ParsedArmor | null {
  const parsed = parseArmorClass(item.armor_class);
  if (parsed) return parsed;
  const key = itemKey(item);
  const named = NAMED_ARMOR[key];
  if (named) return named;
  const family = key.match(BASE_ARMOR_FAMILY);
  return family ? (BASE_ARMOR[family[1]] ?? null) : null;
}

// ── Gear ─────────────────────────────────────────────────────────────────────

/** One thing a character has on, with the item it resolves to. */
export interface WornGear {
  slot: InventorySlot | null;
  attuned: boolean;
  item: Item;
}

/**
 * Equipped, non-ruined gear per carrier. Attunement-only gear (an Ioun stone)
 * also counts from the pack, because the stone orbits you rather than being worn.
 */
export function wornGearByMember(
  inventory: PartyInventoryItem[],
  items: Item[],
): Record<string, WornGear[]> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const result: Record<string, WornGear[]> = {};
  for (const inv of inventory) {
    // `inventoryItemRef`, not `item_id`: gear picked from the shared library is
    // referenced by `library_item_id` and never counted otherwise (#956).
    const ref = inventoryItemRef(inv);
    if (!inv.carried_by || !ref || inv.is_ruined) continue;
    const item = itemById.get(ref);
    if (!item) continue;
    const equipped = inv.location === "equipped";
    const orbiting = inv.is_attuned && BONUS_ITEMS[itemKey(item)]?.slots === undefined;
    if (!equipped && !orbiting) continue;
    (result[inv.carried_by] ??= []).push({ slot: equipped ? inv.slot : null, attuned: inv.is_attuned, item });
  }
  return result;
}

// ── The calculation ──────────────────────────────────────────────────────────

/** What the calculation reads from a character. A `PartyMember` satisfies this. */
export interface AcMember {
  id: string;
  ruleset?: RulesetKey | null;
  class?: string | null;
  subclass?: string | null;
  dex: number;
  con: number;
  wis: number;
  cha: number;
  /** An extra AC calculation the character has: "mage_armor", "natural:13+dex", "unarmored:dex+con", ... */
  ac_formula?: string | null;
  class_choices?: Record<string, unknown> | null;
}

export interface AcPart {
  label: string;
  /** What this line adds. Lines sum to the total. */
  value: number;
}

export interface AcBreakdown {
  total: number;
  parts: AcPart[];
  /** Plain-language reasons the number is not higher, for a player who has not set up their gear. */
  notes: string[];
}

interface Candidate {
  parts: AcPart[];
  /** Whether a shield may be added on top (Monk Unarmored Defense forbids it). */
  allowsShield: boolean;
  /** Built on worn body armour. */
  armored?: boolean;
}

function dexPart(member: AcMember): AcPart {
  return { label: "Dexterity", value: abilityMod(member.dex) };
}

function className(member: AcMember): string {
  return (member.class ?? "").trim().toLowerCase();
}

/** Every unarmoured calculation the character has, each valid only while no body armour is worn. */
function unarmouredCandidates(member: AcMember, gear: WornGear[]): Candidate[] {
  const out: Candidate[] = [
    { parts: [{ label: "Base", value: 10 }, dexPart(member)], allowsShield: true },
  ];
  const formula = member.ac_formula ?? "";
  const cls = className(member);

  if (cls === "barbarian" || formula === "unarmored:dex+con") {
    out.push({
      parts: [
        { label: "Unarmored Defense", value: 10 },
        dexPart(member),
        { label: "Constitution", value: abilityMod(member.con) },
      ],
      allowsShield: true,
    });
  }
  if (cls === "monk" || formula === "unarmored:dex+wis") {
    out.push({
      parts: [
        { label: "Unarmored Defense", value: 10 },
        dexPart(member),
        { label: "Wisdom", value: abilityMod(member.wis) },
      ],
      allowsShield: false,
    });
  }
  if (formula === "mage_armor") {
    out.push({ parts: [{ label: "Mage Armor", value: 13 }, dexPart(member)], allowsShield: true });
  }
  if (cls === "sorcerer" && /draconic/i.test(member.subclass ?? "")) {
    // 2014 Draconic Resilience reads 13 + Dex; the 2024 text is 10 + Dex + Cha.
    out.push(
      member.ruleset === "2024"
        ? {
            parts: [
              { label: "Draconic Resilience", value: 10 },
              dexPart(member),
              { label: "Charisma", value: abilityMod(member.cha) },
            ],
            allowsShield: true,
          }
        : { parts: [{ label: "Draconic Resilience", value: 13 }, dexPart(member)], allowsShield: true },
    );
  }
  if (gear.some((g) => g.slot === "clothes" && g.attuned && itemKey(g.item) === ROBE_KEY)) {
    out.push({ parts: [{ label: "Robe of the Archmagi", value: 15 }, dexPart(member)], allowsShield: true });
  }
  return out;
}

/** Natural armour competes with worn armour: you use whichever leaves you higher. */
function naturalCandidate(member: AcMember): Candidate | null {
  const match = (member.ac_formula ?? "").match(/^natural:(\d+)(\+dex)?$/);
  if (!match) return null;
  const parts: AcPart[] = [{ label: "Natural armor", value: parseInt(match[1], 10) }];
  if (match[2]) parts.push(dexPart(member));
  return { parts, allowsShield: true };
}

function total(parts: AcPart[]): number {
  return parts.reduce((sum, p) => sum + p.value, 0);
}

function hasDefenseStyle(member: AcMember): boolean {
  const style = member.class_choices?.fighting_style;
  return typeof style === "string" && /defense$/i.test(style.trim());
}

/**
 * A character's AC and how it is made. Pure: hand it the member and the gear
 * `wornGearByMember` found for them.
 */
export function calculateAc(member: AcMember, gear: WornGear[]): AcBreakdown {
  const notes: string[] = [];

  const bodyItem = gear.find((g) => g.slot === "body" && g.item.item_type === "armor" && armorOfItem(g.item));
  const armor = bodyItem ? armorOfItem(bodyItem.item) : null;
  if (!bodyItem && gear.some((g) => g.slot === "body" && g.item.item_type === "armor")) {
    notes.push("Your body armor has no armor class listed, so it adds nothing yet.");
  }

  const shieldGear = gear.find((g) => g.slot === "off_hand" && g.item.item_type === "shield");
  const shieldBonus = shieldGear ? parseShieldAcBonus(shieldGear.item.armor_class) : 0;
  const strayShield = gear.find((g) => g.item.item_type === "shield" && g.slot !== "off_hand" && g.slot !== null);

  // Candidate bases: worn armour, or each unarmoured calculation, plus natural armour either way.
  const candidates: Candidate[] = [];
  if (armor && bodyItem) {
    const parts: AcPart[] = [{ label: bodyItem.item.name, value: armor.base }];
    if (armor.dex !== "none") parts.push({ label: "Dexterity", value: dexApplied(armor, member.dex) });
    if (hasDefenseStyle(member)) parts.push({ label: "Defense", value: 1 });
    candidates.push({ parts, allowsShield: true, armored: true });
  } else {
    candidates.push(...unarmouredCandidates(member, gear));
  }
  const natural = naturalCandidate(member);
  if (natural) candidates.push(natural);

  let best: { candidate: Candidate; sum: number } | null = null;
  for (const candidate of candidates) {
    const sum = total(candidate.parts) + (candidate.allowsShield ? shieldBonus : 0);
    if (!best || sum > best.sum) best = { candidate, sum };
  }
  // `candidates` always holds at least the 10 + Dex base or worn armour.
  const chosen = best!.candidate;
  const parts = [...chosen.parts];

  const shieldCounts = chosen.allowsShield && shieldGear !== undefined;
  if (shieldCounts && shieldGear) parts.push({ label: shieldGear.item.name, value: shieldBonus });
  if (shieldGear && !chosen.allowsShield) {
    notes.push("Monk Unarmored Defense does not work while you use a shield.");
  }

  // Magic items with a flat bonus.
  const wearsArmor = chosen.armored === true;
  for (const g of gear) {
    const rule = BONUS_ITEMS[itemKey(g.item)];
    if (!rule) continue;
    if (rule.attuned && !g.attuned) {
      notes.push(`Attune to ${g.item.name} to use its +${rule.bonus} AC.`);
      continue;
    }
    if (rule.slots && !(g.slot && rule.slots.includes(g.slot))) continue;
    if (rule.unprotectedOnly && (wearsArmor || shieldCounts)) continue;
    parts.push({ label: g.item.name, value: rule.bonus });
  }

  // Only worth saying when the plain 10 + Dex base is all the character has: a
  // Monk, Barbarian, Mage Armor or natural armour is unarmoured on purpose, and
  // putting armour on would lower their AC or switch the feature off.
  if (!armor && candidates.length === 1) notes.push("Nothing is equipped in your Body slot.");
  if (!shieldGear && strayShield) {
    notes.push("Your shield only counts in the Off hand slot.");
  }

  return { total: total(parts), parts, notes };
}

/**
 * The AC the sheet showed before it was calculated, for the one-time notice that
 * compares the two (AcCalculatedNotice). Not a rule: it is the retired display,
 * kept only to read `party_members.ac` honestly, and goes with that column.
 *
 * The stored number was a base. Unarmoured formulas gave way to armour equipped
 * in any slot, natural armour took the higher of the two, and every equipped
 * shield added its bonus wherever it sat. (`ac_formula = 'armor'` was cleared by
 * migration 20261005085834, along with the stored number wherever armour was on.)
 */
export function previousAc(member: AcMember & { ac: number }, gear: WornGear[]): number {
  let armor: ParsedArmor | null = null;
  for (const g of gear) {
    if (g.item.item_type !== "armor") continue;
    const parsed = parseArmorClass(g.item.armor_class);
    if (parsed && (!armor || parsed.base > armor.base)) armor = parsed;
  }
  const formula = member.ac_formula ?? "";
  let base = member.ac;
  if (armor && (formula.startsWith("unarmored:") || formula === "mage_armor")) base = armorAcFor(armor, member.dex);
  else if (armor && formula.startsWith("natural:")) base = Math.max(member.ac, armorAcFor(armor, member.dex));
  const shields = gear
    .filter((g) => g.item.item_type === "shield")
    .reduce((sum, g) => sum + parseShieldAcBonus(g.item.armor_class), 0);
  return base + shields;
}

/** The breakdown as one line for a tooltip: "Chain Mail 16, Dexterity +0, Shield +2". */
export function describeAc(breakdown: AcBreakdown): string {
  return breakdown.parts
    .map((p, i) => (i === 0 ? `${p.label} ${p.value}` : `${p.label} ${p.value >= 0 ? "+" : "−"}${Math.abs(p.value)}`))
    .join(", ");
}
