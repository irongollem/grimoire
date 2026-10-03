import { describe, expect, it } from "vitest";
import { PROVISIONS } from "@/data/provisions";

// The Workshop's crafted weapons are seeded into library_items beside the SRD
// ones, so they must carry the same structured fields. A range written only
// into the description ("Range 80/320.") is invisible to the item sheet and to
// the encounter runner's attack line; that is how the crafted Shortbow shipped
// without one.
describe("bundled crafted weapons", () => {
  const weapons = PROVISIONS.filter((item) => item.item_type === "weapon");

  it("gives every ammunition or thrown weapon a structured range", () => {
    const reach = weapons.filter((w) => w.properties.includes("ammunition") || w.properties.includes("thrown"));
    expect(reach.length).toBeGreaterThan(0);
    for (const weapon of reach) expect(weapon.weapon_range, weapon.name).toMatch(/^\d+\/\d+ ft\.$/);
  });

  it("names every weapon's category the way the Open5e import does", () => {
    for (const weapon of weapons) {
      expect(weapon.subtype, weapon.name).toMatch(/^(Simple|Martial) (Melee|Ranged) Weapons$/);
    }
  });
});
