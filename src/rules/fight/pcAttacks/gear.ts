// What an ally's ranged and thrown attacks use up (#1021), worked out the way the browser's runner does it
// (`useAmmoConsumption`, `useThrownWeapon`) but pure, so the server can offer only the attacks an ally still has the
// means to make and say what a swing spent. Pure and edge-importable (relative `.ts` imports only).
//
// RULE ammunition (PHB 2014 "Ammunition", SRD 5.1 weapon properties): each attack with an ammunition weapon uses up one
// piece of ammunition, drawn from the quiver or case; a thrown weapon leaves the hand when it is thrown (PHB 2014
// "Thrown"). Which stack a piece comes from, and a weapon with its own charges, are the app's bookkeeping
// (`useAmmoConsumption`): a quiver or container first, then the belt, then the backpack.
//
// These are the rules for every caller: the browser's runner and the player's combat tab (`useAmmoConsumption`,
// `useThrownWeapon`) are thin wrappers that only run the writes this module works out, so the rules live once.
// An item is found through `inventoryItemRef`, so a stack sourced from the shared library resolves its item as a campaign
// item's does (the browser used to look only at `item_id`, which left a library arrow stack's tags and charges unread).

import { inventoryItemRef } from "../../../lib/itemRef.ts";
import type { PartyInventoryItem } from "../../../types/inventory.types.ts";
import type { Item } from "../../../types/item.types.ts";
import type { PcRangedAttackRow, PcThrownAttackRow } from "../../../types/pcAttack.types.ts";
import type { PcCarriedRow } from "./rows.ts";
import { AMMO_TAGS, ANY_AMMO_TAG, ammoTagFromName, type AmmoTag, type WeaponAmmoTag } from "../../ammunition.ts";
import type { PlayerSheets } from "../playerSheet.ts";

/** One write to an inventory row. The numbers are absolute (the row as it should read), so a write that is retried lands once. */
export type GearWrite =
  | { kind: "quantity"; inventoryId: string; quantity: number }
  | { kind: "charges"; inventoryId: string; charges: number }
  | { kind: "remove"; inventoryId: string };

/** A weapon that has left an ally's hands and lies on the ground, as the chat's thrown-weapon drop carries it. */
export interface ThrownDrop {
  name: string;
  /** The catalogue reference (`inventoryItemRef`) the dropped weapon keeps, or null for free text. */
  itemRef: string | null;
  rarity: string;
  imageUrl: string | null;
  description: string | null;
  quality: PartyInventoryItem["quality"];
}

/** What one attack used up: the inventory writes it leads to and, for a thrown weapon, the one that lies on the ground. */
export interface AllySpend {
  memberId: string;
  /** The attack's name on the ally's block. */
  action: string;
  writes: GearWrite[];
  drop: ThrownDrop | null;
}

/** The carried rows the ammunition rules read, and how an item is found for one. */
export interface CarriedGear {
  inventory: readonly PartyInventoryItem[];
  itemOf: (inv: PcCarriedRow) => Item | undefined;
}

/** The gear one member carries, from what the server read. */
export function carriedGearOf(sheets: PlayerSheets, memberId: string): CarriedGear {
  return {
    inventory: sheets.inventory.filter((inv) => inv.carried_by === memberId),
    itemOf: (inv) => {
      const ref = inventoryItemRef(inv);
      return ref === null ? undefined : sheets.items.find((item) => item.id === ref);
    },
  };
}

/** An ammunition stack's own kind: the item's tags when it has one, else its name (the tag `weaponAmmoTag` wants to match). */
function stackTag(inv: PartyInventoryItem, gear: CarriedGear): AmmoTag | null {
  const item = gear.itemOf(inv);
  if (item !== undefined) {
    if (item.tags.includes("firearm")) return "firearm-bullet";
    return AMMO_TAGS.find((t) => item.tags.includes(t)) ?? null;
  }
  return ammoTagFromName(inv.name);
}

/** Pieces left in a stack: a charged stack counts its charges, a plain one its quantity. */
export function remainingOf(inv: PartyInventoryItem, gear: CarriedGear): number {
  const maxCharges = gear.itemOf(inv)?.charges ?? null;
  if (inv.current_charges !== null) return inv.current_charges;
  if (maxCharges !== null) return maxCharges;
  return inv.quantity;
}

/** The stack the next piece of `tag` ammunition comes from: a quiver or container, then the belt, then the backpack; null when none is left. */
export function availableAmmoFor(tag: WeaponAmmoTag, gear: CarriedGear): PartyInventoryItem | null {
  const containers = new Set(gear.inventory.filter((i) => i.is_container).map((i) => i.id));
  const candidates = gear.inventory.filter((inv) => {
    const own = stackTag(inv, gear);
    if (own === null) return false;
    // The generic "any" tag (the weapon needs ammunition, of a kind nobody could tell) matches any recognised stack.
    if (tag !== ANY_AMMO_TAG && own !== tag) return false;
    return remainingOf(inv, gear) > 0;
  });
  const inContainer = candidates.filter((i) => i.location === "container" && containers.has(i.container_id ?? ""));
  const onBelt = candidates.filter((i) => i.location === "belt");
  const inBackpack = candidates.filter((i) => i.location === "backpack");
  return inContainer[0] ?? onBelt[0] ?? inBackpack[0] ?? null;
}

/** A self-charged weapon's full magazine; 0 for a weapon with none (or one not carried). */
export function weaponMaxCharges(weaponId: string, gear: CarriedGear): number {
  const inv = gear.inventory.find((i) => i.id === weaponId);
  return inv === undefined ? 0 : (gear.itemOf(inv)?.charges ?? 0);
}

/** Charges a self-charged weapon (an internal magazine) has left: what it records, else `maxCharges` (a weapon never fired is full). */
export function weaponChargesLeft(weaponId: string, gear: CarriedGear, maxCharges: number = weaponMaxCharges(weaponId, gear)): number {
  const inv = gear.inventory.find((i) => i.id === weaponId);
  if (inv === undefined) return 0;
  return inv.current_charges !== null ? inv.current_charges : maxCharges;
}

/** The write for one shot from a self-charged weapon. */
export function chargeWrite(weaponId: string, gear: CarriedGear, maxCharges: number = weaponMaxCharges(weaponId, gear)): GearWrite {
  return { kind: "charges", inventoryId: weaponId, charges: Math.max(0, weaponChargesLeft(weaponId, gear, maxCharges) - 1) };
}

/** Whether the ally can still make this ranged attack: ammunition in a stack, or charges in the weapon. */
export function rangedAttackAvailable(row: PcRangedAttackRow, gear: CarriedGear): boolean {
  if (row.ammoTag === null) return weaponChargesLeft(row.weaponInvId, gear) > 0;
  return availableAmmoFor(row.ammoTag, gear) !== null;
}

/** Whether the ally still has a weapon to throw: the row's stack holds at least one. */
export function thrownAttackAvailable(row: PcThrownAttackRow, gear: CarriedGear): boolean {
  const inv = gear.inventory.find((i) => i.id === row.weaponInvId);
  return inv !== undefined && inv.quantity > 0;
}

/** One unit taken from a plain stack; the last unit takes the row away. */
export function takeUnit(inv: PartyInventoryItem): GearWrite {
  return inv.quantity > 1 ? { kind: "quantity", inventoryId: inv.id, quantity: inv.quantity - 1 } : { kind: "remove", inventoryId: inv.id };
}

/** One piece of ammunition taken from a stack: a charged stack loses a charge, a plain one a unit. */
function takeAmmo(inv: PartyInventoryItem, gear: CarriedGear): GearWrite {
  if (gear.itemOf(inv)?.charges !== null && gear.itemOf(inv)?.charges !== undefined) {
    return { kind: "charges", inventoryId: inv.id, charges: Math.max(0, remainingOf(inv, gear) - 1) };
  }
  return takeUnit(inv);
}

/** The write for one piece of `tag` ammunition from the stack it comes from; null when none is left. */
export function ammoWrite(tag: WeaponAmmoTag, gear: CarriedGear): GearWrite | null {
  const stack = availableAmmoFor(tag, gear);
  return stack === null ? null : takeAmmo(stack, gear);
}

/** What a ranged attack used up; null when nothing could be found to use (the attack was offered with the means to make it). */
export function rangedSpend(memberId: string, action: string, row: PcRangedAttackRow, gear: CarriedGear): AllySpend | null {
  if (row.ammoTag === null) {
    const charges = weaponChargesLeft(row.weaponInvId, gear);
    return charges <= 0 ? null : { memberId, action, writes: [chargeWrite(row.weaponInvId, gear)], drop: null };
  }
  const write = ammoWrite(row.ammoTag, gear);
  return write === null ? null : { memberId, action, writes: [write], drop: null };
}

/** What a thrown attack used up: one weapon from its stack, and that weapon on the ground. */
export function thrownSpend(memberId: string, action: string, row: PcThrownAttackRow, gear: CarriedGear): AllySpend | null {
  const inv = gear.inventory.find((i) => i.id === row.weaponInvId);
  if (inv === undefined || inv.quantity <= 0) return null;
  return { memberId, action, writes: [takeUnit(inv)], drop: thrownDropOf(inv, gear.itemOf(inv) ?? null) };
}

/** The weapon of a throw as it lies on the ground: the resolved reference (a library weapon keeps its catalogue link), never the raw column. */
export function thrownDropOf(inv: PartyInventoryItem, item: Item | null): ThrownDrop {
  return {
    name: inv.name,
    itemRef: inventoryItemRef(inv),
    rarity: item?.rarity ?? "mundane",
    imageUrl: item?.image_url ?? null,
    description: item?.description ?? null,
    quality: inv.quality,
  };
}

/**
 * The inventory as it reads once `spend` is done, written into `inventory` itself. A turn that comes after another in the
 * same request must find the stack the earlier one left, not the one both started from (two throws of one stack would
 * otherwise each write "one fewer than it began with").
 */
export function settleSpend(inventory: PartyInventoryItem[], spend: AllySpend): void {
  for (const write of spend.writes) {
    const at = inventory.findIndex((inv) => inv.id === write.inventoryId);
    if (at === -1) continue;
    if (write.kind === "remove") inventory.splice(at, 1);
    else if (write.kind === "quantity") inventory[at] = { ...inventory[at], quantity: write.quantity };
    else inventory[at] = { ...inventory[at], current_charges: write.charges };
  }
}
