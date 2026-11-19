import { describe, expect, it } from "vitest";
import { drawLine, planDraw } from "./drawWeapon";
import type { PartyInventoryItem } from "@/types/inventory.types";

const row = (id: string, slot: string | null): PartyInventoryItem => ({ id, slot, name: id }) as unknown as PartyInventoryItem;

describe("planDraw", () => {
  // Bug caught: the old weapon staying in hand beside the new one.
  it("puts the main hand's weapon back in the pack and draws into the main hand", () => {
    const plan = planDraw([row("rapier", "main_hand"), row("bow", null)], "bow");
    expect(plan?.putAway).toEqual({ id: "rapier", update: { location: "backpack", slot: null, is_equipped: false } });
    expect(plan?.draw).toEqual({ id: "bow", update: { location: "equipped", slot: "main_hand", is_equipped: true } });
  });

  // Bug caught: a put-away written for an empty hand (it would unequip something else), or the off hand disturbed.
  it("puts nothing away when the main hand is empty, and leaves the off hand alone", () => {
    const plan = planDraw([row("shield", "off_hand"), row("bow", null)], "bow");
    expect(plan?.putAway).toBeNull();
  });

  // Bug caught: drawing a row the character does not carry.
  it("refuses a row that is not carried", () => {
    expect(planDraw([row("rapier", "main_hand")], "ghost")).toBeNull();
  });
});

describe("drawLine", () => {
  it("names what was drawn, and what was put away", () => {
    expect(drawLine("Rosie", "Longbow", null)).toBe("Rosie draws Longbow");
    expect(drawLine("Rosie", "Longbow", "Rapier")).toBe("Rosie puts away Rapier and draws Longbow");
  });
});
