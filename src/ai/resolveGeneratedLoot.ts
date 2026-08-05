import type { LootEntryAiResult } from "./types";
import { ITEM_RARITIES, ITEM_TYPES, type ItemRarity, type ItemType } from "@/types/item.types";
import { parseExpression, maxExpression } from "@/lib/dice/dice";

/**
 * App-side half of #602: the loot generator returns item *names*, not ids.
 * This resolves each generated entry against the DM's own vault and reports,
 * per entry, whether it can become a real `LootEntry`.
 *
 * Same resolution-guard principle as resolveGeneratedEntities and
 * resolveGeneratedCombatants (#337/#595): an unmatched name is NEVER dropped
 * and NEVER stubbed into a placeholder item row. It comes back as an
 * `unresolved` entry so the panel can show the DM exactly what the model
 * wrote and what happened to it.
 *
 * The vault pool passed in is the MERGED catalogue from `useItems` — the DM's
 * own items plus the library items their enabled sources make visible — so a
 * name can resolve to a shared row whose id is a text slug. Those are turned
 * into owned uuid rows by `useEnsureOwnedItem` at create time, not here: this
 * module is pure, and cloning is a write.
 */

/** Minimal item shape this module needs — `useItems` rows satisfy it. */
export interface LootItemPoolRow {
  id: string;
  name: string;
  rarity: string;
  item_type: string;
}

export type ResolvedLootEntry =
  | {
    kind: "item";
    /** The vault row the model's `item_name` matched. */
    item: LootItemPoolRow;
    /** The name as the model wrote it — may differ in case/whitespace from `item.name`. */
    generatedName: string;
    dropChance: number;
    dice: string | null;
    fixedQty: number | null;
    notes: string | null;
  }
  | {
    kind: "currency";
    label: string | null;
    dropChance: number;
    pp: number; gp: number; ep: number; sp: number; cp: number;
    notes: string | null;
  }
  | {
    kind: "random";
    rarity: ItemRarity;
    itemTypeFilter: ItemType | null;
    dropChance: number;
    dice: string | null;
    fixedQty: number | null;
    notes: string | null;
  }
  | {
    kind: "unresolved";
    /** What the model asked for, kept verbatim for the DM to read. */
    generatedName: string;
    /** Why it could not become a real entry — shown in the panel. */
    reason: string;
  };

/** Trim + lowercase; first pool row with a given name wins a collision — the
 *  merged catalogue already puts the DM's own shadowing row first. */
function buildNameIndex(pool: LootItemPoolRow[]): Map<string, LootItemPoolRow> {
  const index = new Map<string, LootItemPoolRow>();
  for (const item of pool) {
    const key = item.name.trim().toLowerCase();
    if (!index.has(key)) index.set(key, item);
  }
  return index;
}

/** 1–100 integer, clamped rather than rejected: a model that returns 0 or 140
 *  meant "never"/"always", and a whole entry is not worth discarding over a
 *  bounds slip the DM can see and edit afterwards. */
function normalizeDropChance(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 100;
  return Math.min(100, Math.max(1, n));
}

/** Non-empty trimmed string, or null. */
function cleanString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A quantity dice expression the roller can actually use, or null.
 *
 * Applies exactly the two conditions `validateQuantity` (lootTable.types.ts)
 * blocks a save on — unparseable, or unable to roll positive ("1d4-10") — so
 * a generated table can never carry an entry that always hits and always
 * drops nothing (#487). Rejected expressions fall back to a fixed quantity
 * rather than failing the entry: the DM asked for loot, not for a lecture
 * about dice syntax.
 */
function cleanDice(raw: unknown): string | null {
  const text = cleanString(raw);
  if (!text) return null;
  const parsed = parseExpression(text);
  if (!parsed || maxExpression(parsed) <= 0) return null;
  return text;
}

/** Positive integer, or null — a fixed quantity of 0 would make the entry
 *  always drop nothing, which validateEntries rejects at save time anyway. */
function cleanQty(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

/** Whole non-negative coin amount, or 0. */
function cleanCoin(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw);
}

function isItemRarity(value: unknown): value is ItemRarity {
  return typeof value === "string" && (ITEM_RARITIES as readonly string[]).includes(value);
}

function isItemType(value: unknown): value is ItemType {
  return typeof value === "string" && (ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * Resolve one generated entry. Quantity handling mirrors `validateQuantity` in
 * lootTable.types.ts: a usable dice expression wins, otherwise a fixed
 * quantity, otherwise a fixed 1 — never both set, never neither. "Usable" is
 * doing real work there; see `cleanDice`.
 */
function resolveEntry(
  entry: LootEntryAiResult,
  nameIndex: Map<string, LootItemPoolRow>,
): ResolvedLootEntry {
  const dropChance = normalizeDropChance(entry.drop_chance);
  const notes = cleanString(entry.notes);
  const dice = cleanDice(entry.dice);
  const fixedQty = dice ? null : (cleanQty(entry.fixed_qty) ?? 1);

  if (entry.type === "currency") {
    return {
      kind: "currency",
      label: cleanString(entry.currency_label),
      dropChance,
      pp: cleanCoin(entry.pp), gp: cleanCoin(entry.gp), ep: cleanCoin(entry.ep),
      sp: cleanCoin(entry.sp), cp: cleanCoin(entry.cp),
      notes,
    };
  }

  if (entry.type === "random") {
    // A random entry with no valid rarity cannot be saved (validateEntries
    // blocks it), and there is no sensible default — "which rarity did you
    // mean" is exactly the question the DM has to answer.
    if (!isItemRarity(entry.rarity)) {
      return {
        kind: "unresolved",
        generatedName: `Random ${cleanString(entry.rarity) ?? "item"}`,
        reason: "the random pick had no usable rarity",
      };
    }
    return {
      kind: "random",
      rarity: entry.rarity,
      // An unrecognised filter is dropped rather than rejecting the entry: a
      // random pick with no type filter is still a valid, useful entry.
      itemTypeFilter: isItemType(entry.item_type_filter) ? entry.item_type_filter : null,
      dropChance,
      dice,
      fixedQty,
      notes,
    };
  }

  const generatedName = cleanString(entry.item_name);
  if (!generatedName) {
    return { kind: "unresolved", generatedName: "(unnamed item)", reason: "the entry named no item" };
  }

  const item = nameIndex.get(generatedName.toLowerCase());
  if (!item) {
    return {
      kind: "unresolved",
      generatedName,
      reason: "not in your Vault or enabled sources",
    };
  }

  return { kind: "item", item, generatedName, dropChance, dice, fixedQty, notes };
}

/**
 * Resolve every generated entry against the vault pool, in the model's own
 * order. Nothing is filtered out here — the caller decides what to do with
 * `unresolved` entries, and the panel shows them.
 */
export function resolveGeneratedLoot(
  entries: LootEntryAiResult[],
  pool: LootItemPoolRow[],
): ResolvedLootEntry[] {
  const nameIndex = buildNameIndex(pool);
  const seenItemIds = new Set<string>();

  return entries.map((entry) => {
    const resolved = resolveEntry(entry, nameIndex);
    // A model that lists the same sword twice produces two entries that each
    // roll independently — which reads as a bug in the table, not as variety.
    // The duplicate is surfaced rather than merged: the DM may well have
    // wanted two chances at it, and silently collapsing entries is the kind of
    // edit that gets noticed only mid-session.
    if (resolved.kind === "item") {
      if (seenItemIds.has(resolved.item.id)) {
        return {
          kind: "unresolved" as const,
          generatedName: resolved.generatedName,
          reason: "already listed by an earlier entry",
        };
      }
      seenItemIds.add(resolved.item.id);
    }
    return resolved;
  });
}
