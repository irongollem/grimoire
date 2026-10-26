import { describe, expect, it } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { ItemRarity } from "@/types/item.types";
import {
  answerSentence,
  highlightParts,
  isSearchActive,
  matchesText,
  rowMatches,
  runPackSearch,
  wherePhrase,
  type PackFilters,
  type PackSearchContext,
} from "./packSearch";

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
    carried_by: "ilse",
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

const members = [
  { id: "ilse", name: "Ilse Brandt" },
  { id: "dorn", name: "Dorn" },
  { id: "mara", name: "Mara Voss" },
];
const none: PackFilters = { query: "", attuned: false, magic: false, cursed: false };
const rarities = new Map<string, ItemRarity>();
const cursed = new Set<string>();
const ctx: PackSearchContext = {
  rarityOf: (r) => rarities.get(r.id) ?? null,
  isCursed: (r) => cursed.has(r.id),
};

describe("matching", () => {
  it("is a case-insensitive substring of the name, so heal finds Amulet of Health", () => {
    expect(matchesText({ name: "Amulet of Health", notes: null }, "HEAL")).toBe(true);
    expect(matchesText({ name: "Amulet of Health", notes: null }, "heal")).toBe(true);
    expect(matchesText({ name: "Rope", notes: null }, "heal")).toBe(false);
  });

  it("reads notes, plain or tiptap JSON", () => {
    const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Stolen from the vault" }] }] });
    expect(matchesText({ name: "Ring", notes: doc }, "stolen")).toBe(true);
    expect(matchesText({ name: "Ring", notes: "from Grandma" }, "grandma")).toBe(true);
  });

  it("narrows with every chip at once", () => {
    const a = row({ is_attuned: true });
    const b = row({ is_attuned: false });
    rarities.set(a.id, "rare");
    rarities.set(b.id, "rare");
    expect(rowMatches(a, { ...none, attuned: true, magic: true }, ctx)).toBe(true);
    expect(rowMatches(b, { ...none, attuned: true, magic: true }, ctx)).toBe(false);
  });

  it("does not count mundane or common gear, or a row with no catalogue entry, as magic", () => {
    const rope = row({});
    const free = row({});
    const potion = row({});
    rarities.set(rope.id, "mundane");
    rarities.set(potion.id, "common");
    const f = { ...none, magic: true };
    expect(rowMatches(rope, f, ctx)).toBe(false);
    expect(rowMatches(potion, f, ctx)).toBe(false);
    expect(rowMatches(free, f, ctx)).toBe(false);
    const wand = row({});
    rarities.set(wand.id, "uncommon");
    expect(rowMatches(wand, f, ctx)).toBe(true);
  });

  it("filters to cursed rows through the predicate it is given", () => {
    const c = row({});
    cursed.add(c.id);
    expect(rowMatches(c, { ...none, cursed: true }, ctx)).toBe(true);
    expect(rowMatches(row({}), { ...none, cursed: true }, ctx)).toBe(false);
  });

  it("is inactive with no query and no chip", () => {
    expect(isSearchActive(none)).toBe(false);
    expect(isSearchActive({ ...none, query: "  " })).toBe(false);
    expect(isSearchActive({ ...none, magic: true })).toBe(true);
  });
});

describe("highlightParts", () => {
  it("marks every hit and keeps the original casing", () => {
    expect(highlightParts("Potion of Healing", "heal")).toEqual([
      { text: "Potion of ", hit: false },
      { text: "Heal", hit: true },
      { text: "ing", hit: false },
    ]);
  });
  it("returns the text whole with no query", () => {
    expect(highlightParts("Rope", " ")).toEqual([{ text: "Rope", hit: false }]);
  });
});

describe("wherePhrase", () => {
  const bag = row({ id: "bag", name: "Bag of Holding", is_container: true });
  it("speaks in the DM's words", () => {
    expect(wherePhrase(row({ location: "equipped", is_attuned: true }), [])).toBe("worn and attuned");
    expect(wherePhrase(row({ location: "equipped" }), [])).toBe("worn");
    expect(wherePhrase(row({ location: "belt" }), [])).toBe("belt");
    expect(wherePhrase(row({ location: "stored" }), [])).toBe("stored elsewhere");
    expect(wherePhrase(row({ location: "container", container_id: "bag" }), [bag])).toBe("in the Bag of Holding");
  });
  it("calls a row whose container is gone stored elsewhere", () => {
    expect(wherePhrase(row({ location: "container", container_id: "gone" }), [])).toBe("stored elsewhere");
  });
});

describe("runPackSearch", () => {
  const bag = row({ id: "bag2", name: "Bag of Holding", carried_by: "dorn", is_container: true, location: "belt" });
  const rows = [
    row({ name: "Potion of Healing", quantity: 2, carried_by: "ilse", location: "belt" }),
    row({ name: "potion of healing", carried_by: "dorn", location: "container", container_id: "bag2" }),
    row({ name: "Potion of Healing", carried_by: "mara", location: "belt" }),
    row({ name: "Amulet of Health", carried_by: null, location: "backpack" }),
    row({ name: "Rope", carried_by: "mara" }),
    bag,
  ];

  it("groups by name across packs, totals them and says where each one is", () => {
    const r = runPackSearch(rows, members, { ...none, query: "healing" }, ctx);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].total).toBe(4);
    expect(r.lines[0].where).toEqual(["Ilse ×2, belt", "Dorn, in the Bag of Holding", "Mara, belt"]);
    expect(r.things).toBe(4);
    expect(r.packs).toBe(3);
    expect(answerSentence(r)).toBe("4 things, in 3 packs. Nobody else has any.");
  });

  it("finds heal in both Healing and Health, one line each, the stash first by name", () => {
    const r = runPackSearch(rows, members, { ...none, query: "heal" }, ctx);
    expect(r.lines.map((l) => l.name)).toEqual(["Amulet of Health", "Potion of Healing"]);
    expect(r.lines[0].where).toEqual(["the stash"]);
    expect(r.packs).toBe(4);
    expect(answerSentence(r)).toBe("5 things, in 4 packs.");
  });

  it("merges two stacks in the same place", () => {
    const two = [row({ name: "Arrow", quantity: 5, carried_by: "ilse" }), row({ name: "Arrow", quantity: 3, carried_by: "ilse" })];
    expect(runPackSearch(two, members, { ...none, query: "arrow" }, ctx).lines[0].where).toEqual(["Ilse ×8, backpack"]);
  });

  it("uses the whole name when it has no space, and singular words for one thing", () => {
    const r = runPackSearch([rows[1], bag], members, { ...none, query: "healing" }, ctx);
    expect(r.lines[0].where).toEqual(["Dorn, in the Bag of Holding"]);
    expect(answerSentence(r)).toBe("1 thing, in 1 pack. Nobody else has any.");
  });

  it("answers nothing when nothing matches", () => {
    const r = runPackSearch(rows, members, { ...none, query: "dragon" }, ctx);
    expect(r.lines).toEqual([]);
    expect(r.matchIds.size).toBe(0);
    expect(answerSentence(r)).toBe("Nothing in any pack matches.");
  });

  it("does nothing with no filter", () => {
    expect(runPackSearch(rows, members, none, ctx).active).toBe(false);
  });
});
