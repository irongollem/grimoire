import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { inventoryItemRef } from "@/lib/itemRef";
import { parseWeightLb } from "@/lib/utils";

/**
 * A character's pack, cut out of the campaign's inventory rows. Pure so the character
 * page, the player's own inventory and the Party page's Packs view all count a pack the
 * same way.
 */
export interface PackSlices {
  /** Every row this character carries. */
  items: PartyInventoryItem[];
  equipped: PartyInventoryItem[];
  /** Equipped rows that sit in no paper-doll slot. */
  otherEquipped: PartyInventoryItem[];
  belt: PartyInventoryItem[];
  backpack: PartyInventoryItem[];
  /** Stored rows plus rows whose container is gone, so nothing carried is ever invisible. */
  stored: PartyInventoryItem[];
  containers: PartyInventoryItem[];
  attuned: PartyInventoryItem[];
  itemsIn: (containerId: string) => PartyInventoryItem[];
}

export function packSlices(rows: PartyInventoryItem[], memberId: string | null): PackSlices {
  const items = rows.filter((i) => i.carried_by === memberId);
  const equipped = items.filter((i) => i.location === "equipped");
  const containers = items.filter((i) => i.is_container);
  const containerIds = new Set(containers.map((c) => c.id));
  const stored = items.filter((i) => i.location === "stored" && !i.is_container);
  const orphaned = items.filter(
    (i) =>
      i.location === "container" &&
      !i.is_container &&
      !containerIds.has(i.container_id ?? ""),
  );
  return {
    items,
    equipped,
    otherEquipped: equipped.filter((i) => i.slot === "other" || !i.slot),
    belt: items.filter((i) => i.location === "belt" && !i.is_container),
    backpack: items.filter((i) => i.location === "backpack" && !i.is_container),
    stored: [...stored, ...orphaned],
    containers,
    attuned: items.filter((i) => i.is_attuned),
    itemsIn: (containerId) =>
      items.filter((i) => i.location === "container" && i.container_id === containerId),
  };
}

/** Rows no one carries: the party stash. */
export function stashRows(rows: PartyInventoryItem[]): PartyInventoryItem[] {
  return rows.filter((i) => i.carried_by === null);
}

/** Pounds, rounded to a tenth. */
export function sumWeight(items: PartyInventoryItem[], weightOf: (inv: PartyInventoryItem) => number): number {
  return Math.round(items.reduce((acc, i) => acc + weightOf(i), 0) * 10) / 10;
}

export interface PackWeights {
  equipped: number;
  belt: number;
  backpack: number;
  /** Contents of each container, 0 for an extradimensional one. */
  containerContents: Map<string, number>;
  total: number;
}

export function packWeights(
  slices: PackSlices,
  weightOf: (inv: PartyInventoryItem) => number,
  isExtradimensional: (container: PartyInventoryItem) => boolean,
): PackWeights {
  const equipped = sumWeight(slices.equipped, weightOf);
  const belt = sumWeight(slices.belt, weightOf);
  const backpack = sumWeight(slices.backpack, weightOf);
  const containerContents = new Map<string, number>();
  for (const c of slices.containers) {
    containerContents.set(c.id, isExtradimensional(c) ? 0 : sumWeight(slices.itemsIn(c.id), weightOf));
  }
  // Only containers actually carried count toward encumbrance: one set aside as
  // "stored" (and its contents) does not.
  const carried = slices.containers.filter((c) => c.location !== "stored");
  const containerTotal = carried.reduce((acc, c) => {
    let w = containerContents.get(c.id) ?? 0;
    // The container's OWN weight counts only when it sits directly in the pack or on the
    // belt: an equipped container is already in `equipped`, and a nested one is already
    // inside its parent's contents.
    if (c.location === "backpack" || c.location === "belt") w += weightOf(c);
    return acc + w;
  }, 0);
  return {
    equipped,
    belt,
    backpack,
    containerContents,
    total: Math.round((equipped + belt + backpack + containerTotal) * 10) / 10,
  };
}

export type BurdenLevel = "unencumbered" | "encumbered" | "heavily_encumbered" | "over_encumbered";

/** Bands are proportional thirds of the effective capacity (which honours an override). */
export const ENCUMBERED_AT = 33.33;
export const HEAVY_AT = 66.67;

export function burdenLevel(percent: number): BurdenLevel {
  if (percent >= 100) return "over_encumbered";
  if (percent >= HEAVY_AT) return "heavily_encumbered";
  if (percent >= ENCUMBERED_AT) return "encumbered";
  return "unencumbered";
}

/** Bar colour for a carry percentage; the same thresholds as the label so they never disagree. */
export function carryColorClass(percent: number): string {
  if (percent >= 100) return "bg-destructive";
  if (percent >= HEAVY_AT) return "bg-tone-caution";
  if (percent >= ENCUMBERED_AT) return "bg-tone-caution/70";
  return "bg-tone-success";
}

/** One headed run of rows in a pack: a location, or a container with what is inside it. */
export interface PackSection {
  key: string;
  /** Null for the headless run of a flat pack (the stash). */
  label: string | null;
  /** The container row itself, when this section is a container. */
  container: PartyInventoryItem | null;
  rows: PartyInventoryItem[];
}

/**
 * A pack laid out the way a character carries it: Worn, Belt, Backpack, each container by
 * its name, Stored elsewhere. Empty runs are left out. `flat` merges the three loose
 * locations and Stored into one headless run, for the party stash, which has no belt.
 */
export function packSections(slices: PackSlices, flat = false): PackSection[] {
  const worn = slices.equipped.filter((i) => !i.is_container);
  const sections: PackSection[] = flat
    ? [{ key: "all", label: null, container: null, rows: [...worn, ...slices.belt, ...slices.backpack, ...slices.stored] }]
    : [
        { key: "worn", label: "Worn", container: null, rows: worn },
        { key: "belt", label: "Belt", container: null, rows: slices.belt },
        { key: "backpack", label: "Backpack", container: null, rows: slices.backpack },
      ];
  for (const c of slices.containers) {
    sections.push({ key: `c:${c.id}`, label: c.name, container: c, rows: slices.itemsIn(c.id) });
  }
  if (!flat) sections.push({ key: "stored", label: "Stored elsewhere", container: null, rows: slices.stored });
  return sections.filter((s) => s.rows.length > 0 || s.container !== null);
}

/** Item id (own uuid or library id) to pounds per unit, from the rows a pack resolves in. */
export function itemWeightMap(items: readonly Item[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.id, parseWeightLb(it.weight));
  return m;
}

/** Whether a container's contents weigh nothing (a bag of holding), by its catalogue tags. */
export function extradimensionalCheck(items: readonly Item[]): (container: PartyInventoryItem) => boolean {
  const byId = new Map(items.map((it) => [it.id, it] as const));
  return (c) => {
    const ref = inventoryItemRef(c);
    return (ref ? byId.get(ref)?.tags.includes("extradimensional") : false) ?? false;
  };
}
