import { describe, expect, it } from "vitest";
import { combatantKindLabel } from "./combatantKind";

describe("combatantKindLabel", () => {
  it("calls a bestiary monster a monster, not an NPC, on the player's combat list", () => {
    expect(combatantKindLabel({ type: "monster" })).toBe("Monster");
  });

  it("still calls an NPC brought into the fight an NPC, though its combatant type is monster", () => {
    expect(combatantKindLabel({ type: "monster", npc_id: "npc-1" })).toBe("NPC");
  });

  it("calls a party member a PC", () => {
    expect(combatantKindLabel({ type: "player" })).toBe("PC");
  });
});
