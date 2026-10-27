import { describe, expect, it } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import { burdenLevel, carryColorClass, packSections, packSlices, packWeights, stashRows } from "./pack";

let n = 0;
function row(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  n += 1;
  return {
    id: `r${n}`,
    campaign_id: "c",
    user_id: "u",
    item_id: null,
    library_item_id: null,
    name: `thing ${n}`,
    quantity: 1,
    carried_by: "m1",
    location: "backpack",
    slot: null,
    is_container: false,
    container_id: null,
    is_attuned: false,
    is_equipped: false,
    notes: null,
    current_charges: null,
    updated_at: "",
    is_identified: true,
    quality: "standard",
    sort_order: 0,
    curse_revealed: false,
    ...over,
  } as PartyInventoryItem;
}

const oneEach = () => 1;

describe("packSlices", () => {
  it("keeps only this character's rows and sorts them by place", () => {
    const rows = [
      row({ location: "equipped", slot: "other" }),
      row({ location: "belt" }),
      row({ location: "backpack" }),
      row({ carried_by: "m2" }),
      row({ carried_by: null }),
      row({ location: "backpack", is_attuned: true }),
    ];
    const s = packSlices(rows, "m1");
    expect(s.items).toHaveLength(4);
    expect(s.equipped).toHaveLength(1);
    expect(s.otherEquipped).toHaveLength(1);
    expect(s.belt).toHaveLength(1);
    expect(s.backpack).toHaveLength(2);
    expect(s.attuned).toHaveLength(1);
    expect(stashRows(rows)).toHaveLength(1);
  });

  it("treats an equipped row with no slot as 'other', and one in a named slot as not", () => {
    const loose = row({ location: "equipped", slot: null });
    const sword = row({ location: "equipped", slot: "main_hand" });
    expect(packSlices([loose, sword], "m1").otherEquipped).toEqual([loose]);
  });

  it("lists a stored container with the containers, not among the stored rows", () => {
    const bag = row({ is_container: true, location: "stored" });
    const s = packSlices([bag], "m1");
    expect(s.stored).toEqual([]);
    expect(s.containers).toEqual([bag]);
  });

  it("keeps a row that left its container out of that container's contents", () => {
    const bag = row({ is_container: true });
    const moved = row({ location: "backpack", container_id: bag.id });
    expect(packSlices([bag, moved], "m1").itemsIn(bag.id)).toEqual([]);
  });

  it("lands a row whose container is gone in stored", () => {
    const bag = row({ is_container: true });
    const inBag = row({ location: "container", container_id: bag.id });
    const orphan = row({ location: "container", container_id: "missing" });
    const away = row({ location: "stored" });
    const s = packSlices([bag, inBag, orphan, away], "m1");
    expect(s.stored.map((i) => i.id).sort()).toEqual([orphan.id, away.id].sort());
    expect(s.itemsIn(bag.id)).toEqual([inBag]);
  });
});

describe("packWeights", () => {
  it("counts a container's own weight only when it sits in the backpack or on the belt", () => {
    const inPack = row({ is_container: true, location: "backpack" });
    const worn = row({ is_container: true, location: "equipped" });
    const s = packSlices([inPack, worn], "m1");
    const w = packWeights(s, oneEach, () => false);
    // worn container: its own 1 lb is in `equipped`; in-pack container adds its own 1 lb.
    expect(w.equipped).toBe(1);
    expect(w.total).toBe(2);
  });

  it("counts a belt container's own weight too", () => {
    const belted = row({ is_container: true, location: "belt" });
    expect(packWeights(packSlices([belted], "m1"), oneEach, () => false).total).toBe(1);
  });

  it("counts container contents, but 0 for an extradimensional one", () => {
    const bag = row({ is_container: true, location: "backpack" });
    const hole = row({ is_container: true, location: "backpack" });
    const rows = [
      bag,
      hole,
      row({ location: "container", container_id: bag.id }),
      row({ location: "container", container_id: bag.id }),
      row({ location: "container", container_id: hole.id }),
    ];
    const w = packWeights(packSlices(rows, "m1"), oneEach, (c) => c.id === hole.id);
    expect(w.containerContents.get(bag.id)).toBe(2);
    expect(w.containerContents.get(hole.id)).toBe(0);
    // two containers' own weight + two items in the bag
    expect(w.total).toBe(4);
  });

  it("does not count a stored container or what is in it", () => {
    const bag = row({ is_container: true, location: "stored" });
    const rows = [bag, row({ location: "container", container_id: bag.id })];
    expect(packWeights(packSlices(rows, "m1"), oneEach, () => false).total).toBe(0);
  });

  it("rounds to a tenth", () => {
    const rows = [row({ location: "belt" }), row({ location: "belt" }), row({ location: "belt" })];
    const w = packWeights(packSlices(rows, "m1"), () => 0.33, () => false);
    expect(w.total).toBe(1);
    expect(w.belt).toBe(1);
  });
});

describe("burden", () => {
  // Thirds of capacity: from 33.33 encumbered, from 66.67 heavily, from 100 over.
  it.each([
    [0, "unencumbered", "bg-tone-success"],
    [33.32, "unencumbered", "bg-tone-success"],
    [33.33, "encumbered", "bg-tone-caution/70"],
    [66.66, "encumbered", "bg-tone-caution/70"],
    [66.67, "heavily_encumbered", "bg-tone-caution"],
    [99.99, "heavily_encumbered", "bg-tone-caution"],
    [100, "over_encumbered", "bg-destructive"],
  ] as const)("%s%% reads %s and the bar agrees", (percent, level, colour) => {
    expect(burdenLevel(percent)).toBe(level);
    expect(carryColorClass(percent)).toBe(colour);
  });
});

describe("packSections", () => {
  const bag = row({ id: "bag", name: "Bag of Holding", is_container: true, location: "belt" });
  const rows = [
    row({ name: "Longsword", location: "equipped", slot: "main_hand" }),
    row({ name: "Rope", location: "backpack" }),
    row({ name: "Coin", location: "container", container_id: "bag" }),
    row({ name: "Heirloom", location: "stored" }),
    bag,
  ];

  it("lays a character out as Worn, Belt, Backpack, containers, Stored, dropping empty runs", () => {
    const sections = packSections(packSlices(rows, "m1"));
    expect(sections.map((s) => s.label)).toEqual(["Worn", "Backpack", "Bag of Holding", "Stored elsewhere"]);
    expect(sections[2].rows.map((r) => r.name)).toEqual(["Coin"]);
    expect(sections[2].container?.id).toBe("bag");
  });

  it("keeps a worn container out of the Worn run, since it has a section of its own", () => {
    const worn = row({ id: "pack", name: "Haversack", is_container: true, location: "equipped" });
    const sections = packSections(packSlices([worn], "m1"));
    expect(sections.map((s) => s.label)).toEqual(["Haversack"]);
  });

  it("keeps an empty container as a section so it can still be given or removed", () => {
    const sections = packSections(packSlices([bag], "m1"));
    expect(sections.map((s) => s.label)).toEqual(["Bag of Holding"]);
  });

  it("flattens the loose locations into one headless run for the stash", () => {
    const stash = rows.map((r) => ({ ...r, carried_by: null }));
    const sections = packSections(packSlices(stash, null), true);
    expect(sections[0].label).toBeNull();
    expect(sections[0].rows.map((r) => r.name).sort()).toEqual(["Heirloom", "Longsword", "Rope"]);
    expect(sections.map((s) => s.label)).toEqual([null, "Bag of Holding"]);
  });
});
