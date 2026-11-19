import type { PartyInventoryItem, PartyInventoryUpdate } from "@/types/inventory.types";

/** One inventory write: the row and what changes on it. */
export interface InventoryPatch {
  id: string;
  update: PartyInventoryUpdate;
}

export interface DrawPlan {
  /** What was in the main hand and goes back to the pack, or null when the hand was empty. */
  putAway: InventoryPatch | null;
  draw: InventoryPatch;
}

/**
 * Drawing a weapon: it goes to the main hand and whatever the main hand held goes back to the pack. The off hand is left
 * alone. One object may be handled for free during a turn (PHB 2014 ch. 9 "Other Activity on Your Turn"; SRD 5.2
 * "Interacting with Things"). Two-handedness is not modelled.
 */
export function planDraw(carried: PartyInventoryItem[], drawId: string): DrawPlan | null {
  if (!carried.some((i) => i.id === drawId)) return null;
  const inHand = carried.find((i) => i.slot === "main_hand" && i.id !== drawId);
  return {
    putAway: inHand ? { id: inHand.id, update: { location: "backpack", slot: null, is_equipped: false } } : null,
    draw: { id: drawId, update: { location: "equipped", slot: "main_hand", is_equipped: true } },
  };
}

/** The margin line for a draw: `Rosie draws Longbow`, or with something put away `Rosie puts away Rapier and draws Longbow`. */
export function drawLine(name: string, drawn: string, putAway: string | null): string {
  return putAway === null ? `${name} draws ${drawn}` : `${name} puts away ${putAway} and draws ${drawn}`;
}
