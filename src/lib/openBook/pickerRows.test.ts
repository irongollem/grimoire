import { describe, expect, it } from "vitest";
import {
  NO_FILTER,
  allChaptersCount,
  buildPickerRows,
  chapterCounts,
  filterRows,
  hasActiveFilters,
  idsByType,
  placeSubtreeIds,
  planEntryWrites,
  rowKey,
  summariseSelection,
  type PickerRow,
  type PickerSources,
} from "./pickerRows";

const PARTY = ["a", "b"];
const empty: PickerSources = { locations: [], npcs: [], factions: [], pantheons: [], deities: [], notes: [] };

const sources: PickerSources = {
  locations: [
    { id: "l-coast", parent_id: null, name: "Sunken Coast", player_visible_to: ["a", "b"], is_npcs_shared: false },
    { id: "l-vault", parent_id: "l-coast", name: "Drowned Vault", player_visible_to: [], is_npcs_shared: false },
    { id: "l-bell", parent_id: "l-coast", name: "Bell Tower", player_visible_to: ["a"], is_npcs_shared: false },
    { id: "l-far", parent_id: null, name: "Far Reach", player_visible_to: ["a", "b"], is_npcs_shared: false },
  ],
  npcs: [
    { id: "n-orla", name: "Orla", location_id: "l-bell", player_visible_to: ["a", "b"], player_visible_fields: ["name"] },
    { id: "n-nobody", name: "Nobody", location_id: null, player_visible_to: null, player_visible_fields: [] },
  ],
  factions: [{ id: "f1", name: "Tide Guild", player_visible_to: ["a", "b"] }],
  pantheons: [{ id: "p1", name: "Drowned Choir", player_visible_to: ["a", "b"] }],
  deities: [{ id: "d1", name: "Orla of the Light", pantheon: { name: "Drowned Choir" }, player_visible_to: ["a"] }],
  notes: [
    { id: "no1", title: "Session 1", category: "session", player_visible_to: ["a", "b"] },
    { id: "no2", title: "The Flood", category: "lore", player_visible_to: ["a", "b"] },
  ],
};

const rows = (includeShared: boolean, entries: Parameters<typeof buildPickerRows>[1] = []) =>
  buildPickerRows(sources, entries, { includeShared }, PARTY);
const byId = (list: PickerRow[], id: string) => list.find((r) => r.id === id)!;

describe("buildPickerRows", () => {
  it("lists places in tree order with depth, children by name", () => {
    const places = rows(true).filter((r) => r.type === "location");
    expect(places.map((r) => [r.id, r.depth])).toEqual([
      ["l-far", 0],
      ["l-coast", 0],
      ["l-bell", 1],
      ["l-vault", 1],
    ]);
  });

  it("treats a place under a missing parent, or in a parent cycle, as reachable", () => {
    const list = buildPickerRows(
      {
        ...empty,
        locations: [
          { id: "x", parent_id: "gone", name: "X", player_visible_to: [], is_npcs_shared: false },
          { id: "c1", parent_id: "c2", name: "C1", player_visible_to: [], is_npcs_shared: false },
          { id: "c2", parent_id: "c1", name: "C2", player_visible_to: [], is_npcs_shared: false },
        ],
      },
      [],
      { includeShared: true },
      PARTY,
    );
    expect(list.map((r) => r.id).sort()).toEqual(["c1", "c2", "x"]);
  });

  it("files notes by category and deities with the pantheons", () => {
    const list = rows(true);
    expect(byId(list, "no1").chapter).toBe("chronicle");
    expect(byId(list, "no2").chapter).toBe("lore");
    expect(byId(list, "d1").chapter).toBe("pantheon");
    expect(byId(list, "d1").detail).toBe("Drowned Choir");
    expect(byId(list, "n-orla").placeId).toBe("l-bell");
  });

  it("derives audience and eligibility from the whole party", () => {
    const list = rows(true);
    expect(byId(list, "l-coast")).toMatchObject({ audience: "party", eligible: true });
    expect(byId(list, "l-bell")).toMatchObject({ audience: "some", eligible: false });
    expect(byId(list, "n-nobody")).toMatchObject({ audience: "me", eligible: false, visibleTo: [] });
  });

  it("holds NPCs to the database rule: a shared name, and the party directly or through a sharing place", () => {
    const list = buildPickerRows(
      {
        ...empty,
        locations: [
          { id: "inn", parent_id: null, name: "Inn", player_visible_to: ["a", "b"], is_npcs_shared: true },
          { id: "cellar", parent_id: null, name: "Cellar", player_visible_to: ["a", "b"], is_npcs_shared: false },
        ],
        npcs: [
          { id: "n-direct", name: "Direct", location_id: null, player_visible_to: ["a", "b"], player_visible_fields: ["name"] },
          { id: "n-nameless", name: "Nameless", location_id: null, player_visible_to: ["a", "b"], player_visible_fields: ["portrait"] },
          { id: "n-resident", name: "Resident", location_id: "inn", player_visible_to: [], player_visible_fields: ["name"] },
          { id: "n-cellar", name: "Cellared", location_id: "cellar", player_visible_to: [], player_visible_fields: ["name"] },
          { id: "n-resident-nameless", name: "Shy", location_id: "inn", player_visible_to: [], player_visible_fields: [] },
        ],
      },
      [],
      { includeShared: true },
      PARTY,
    );
    expect(byId(list, "n-direct")).toMatchObject({ eligible: true, inBook: true, nameHidden: false });
    expect(byId(list, "n-nameless")).toMatchObject({ eligible: false, inBook: false, nameHidden: true, audience: "party" });
    expect(byId(list, "n-resident")).toMatchObject({ eligible: true, inBook: true, audience: "party" });
    expect(byId(list, "n-cellar")).toMatchObject({ eligible: false, nameHidden: false, audience: "me" });
    expect(byId(list, "n-resident-nameless")).toMatchObject({ eligible: false, nameHidden: true });
  });

  it("is in the book by default only when eligible and the default includes it", () => {
    expect(byId(rows(true), "l-coast").inBook).toBe(true);
    expect(byId(rows(true), "l-bell").inBook).toBe(false);
    expect(byId(rows(false), "l-coast").inBook).toBe(false);
  });

  it("lets the DM's choice override the default, but never past eligibility", () => {
    const entries = [
      { entity_type: "location" as const, entity_id: "l-coast", included: false },
      { entity_type: "location" as const, entity_id: "l-bell", included: true },
      { entity_type: "npc" as const, entity_id: "n-orla", included: true },
    ];
    const withDefault = rows(true, entries);
    expect(byId(withDefault, "l-coast")).toMatchObject({ inBook: false, choice: false });
    expect(byId(withDefault, "l-bell").inBook).toBe(false);
    expect(byId(rows(false, entries), "n-orla").inBook).toBe(true);
  });

  it("keys by type so one uuid under two types stays two rows", () => {
    const list = buildPickerRows(
      { ...empty, factions: [{ id: "same", name: "F", player_visible_to: [] }], pantheons: [{ id: "same", name: "P", player_visible_to: [] }] },
      [],
      { includeShared: true },
      PARTY,
    );
    expect(new Set(list.map((r) => r.key)).size).toBe(2);
  });

  it("makes nothing eligible for a campaign with no party", () => {
    const list = buildPickerRows(sources, [], { includeShared: true }, []);
    expect(list.every((r) => !r.eligible)).toBe(true);
  });
});

describe("filters", () => {
  const all = rows(true);

  it("narrows to a chapter and searches names case-insensitively", () => {
    expect(filterRows(all, { ...NO_FILTER, chapter: "folk" }).map((r) => r.id)).toEqual(["n-nobody", "n-orla"]);
    expect(filterRows(all, { ...NO_FILTER, search: " ORLA " }).map((r) => r.id).sort()).toEqual(["d1", "n-orla"]);
  });

  it("keeps entries in or under a place, and drops those with no place", () => {
    const ids = placeSubtreeIds(sources.locations, "l-coast");
    expect([...ids].sort()).toEqual(["l-bell", "l-coast", "l-vault"]);
    const found = filterRows(all, { ...NO_FILTER, placeIds: ids });
    expect(found.map((r) => r.id).sort()).toEqual(["l-bell", "l-coast", "l-vault", "n-orla"]);
  });

  it("filters by who can see it and by what is not in the book", () => {
    expect(filterRows(all, { ...NO_FILTER, chapter: "atlas", audience: "party" }).map((r) => r.id).sort()).toEqual([
      "l-coast",
      "l-far",
    ]);
    expect(filterRows(all, { ...NO_FILTER, chapter: "atlas", audience: "me" }).map((r) => r.id)).toEqual(["l-vault"]);
    expect(filterRows(all, { ...NO_FILTER, chapter: "atlas", notInBook: true }).map((r) => r.id).sort()).toEqual([
      "l-bell",
      "l-vault",
    ]);
  });

  it("flattens the tree while filtering, and reports active filters", () => {
    const vault = filterRows(all, { ...NO_FILTER, search: "vault" });
    expect(vault[0]!.depth).toBe(0);
    expect(hasActiveFilters(NO_FILTER)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTER, chapter: "atlas" })).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTER, search: "x" })).toBe(true);
  });
});

describe("counts", () => {
  it("counts in-book against all per chapter", () => {
    const counts = chapterCounts(rows(true));
    expect(counts.atlas).toEqual({ inBook: 2, total: 4 });
    expect(counts.folk).toEqual({ inBook: 1, total: 2 });
    expect(counts.pantheon).toEqual({ inBook: 1, total: 2 });
    expect(counts.chronicle).toEqual({ inBook: 1, total: 1 });
    expect(allChaptersCount(counts)).toEqual({ inBook: 7, total: 11 });
  });
});

describe("selection summary", () => {
  const list = rows(true);
  it("splits the selection into entries that can go in and those not yet shared", () => {
    const selected = new Set([rowKey("location", "l-coast"), rowKey("location", "l-bell"), rowKey("location", "l-vault")]);
    expect(summariseSelection(list, selected)).toEqual({ selected: 3, notShared: 2, canGoIn: 1 });
  });
  it("ignores keys that are not rows", () => {
    expect(summariseSelection(list, new Set(["location:gone"]))).toEqual({ selected: 0, notShared: 0, canGoIn: 0 });
  });
});

describe("planEntryWrites", () => {
  const pick = (list: PickerRow[], ...ids: string[]) => list.filter((r) => ids.includes(r.id));

  it("puts in by clearing the exception when the default already includes it", () => {
    const list = rows(true, [{ entity_type: "location", entity_id: "l-coast", included: false }]);
    expect(planEntryWrites(pick(list, "l-coast", "l-far"), true, true)).toEqual([
      { type: "location", upsertIds: [], clearIds: ["l-coast"] },
    ]);
  });

  it("puts in by writing included:true when the default leaves entries out", () => {
    const list = rows(false, [{ entity_type: "location", entity_id: "l-far", included: true }]);
    expect(planEntryWrites(pick(list, "l-coast", "l-far", "n-orla"), true, false)).toEqual([
      { type: "location", upsertIds: ["l-coast"], clearIds: [] },
      { type: "npc", upsertIds: ["n-orla"], clearIds: [] },
    ]);
  });

  it("takes out by writing included:false under an including default, and clearing under an excluding one", () => {
    const under = rows(true, [{ entity_type: "location", entity_id: "l-far", included: false }]);
    expect(planEntryWrites(pick(under, "l-coast", "l-far"), false, true)).toEqual([
      { type: "location", upsertIds: ["l-coast"], clearIds: [] },
    ]);
    const over = rows(false, [{ entity_type: "location", entity_id: "l-far", included: true }]);
    expect(planEntryWrites(pick(over, "l-coast", "l-far"), false, false)).toEqual([
      { type: "location", upsertIds: [], clearIds: ["l-far"] },
    ]);
  });

  it("plans nothing when every row already says so", () => {
    expect(planEntryWrites(pick(rows(true), "l-coast"), true, true)).toEqual([]);
  });

  it("groups ids by type for the share write", () => {
    const map = idsByType(pick(rows(true), "l-coast", "l-far", "n-orla"));
    expect(map.get("location")).toEqual(["l-far", "l-coast"]);
    expect(map.get("npc")).toEqual(["n-orla"]);
  });
});
