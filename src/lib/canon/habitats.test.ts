import { describe, expect, it } from "vitest";
import {
  buildEncounterHabitat,
  encounterSourceForPlace,
  habitatForPlace,
  lifeConstraints,
  whereLine,
  UNREADABLE_CREATURE,
  type EncounterEntry,
  type EncounterHabitat,
  type HabitatLife,
} from "./habitats";
import type { Species, SpeciesForm } from "./ecologyTypes";

const parents: Record<string, string | null> = { room: "town", town: "region", region: null, island: null, inner: "town" };
const parentOf = (id: string) => parents[id] ?? null;

describe("habitatForPlace", () => {
  // Bug: a covered place took its ancestor's habitat instead of its own.
  it("takes a place's own habitat over the one around it", () => {
    const covered = [{ habitatId: "marsh", locationId: "region" }, { habitatId: "moor", locationId: "town" }];
    expect(habitatForPlace("town", parentOf, covered)).toEqual({ habitatId: "moor", throughPlaceId: "town" });
  });

  // Bug: a room of a covered town was in no habitat, so the party in the tavern rolled nothing.
  it("gives a room the habitat of the nearest covered place it lies inside, and names that place", () => {
    const covered = [{ habitatId: "marsh", locationId: "region" }, { habitatId: "moor", locationId: "town" }];
    expect(habitatForPlace("room", parentOf, covered)).toEqual({ habitatId: "moor", throughPlaceId: "town" });
    expect(habitatForPlace("inner", parentOf, [{ habitatId: "marsh", locationId: "region" }])).toEqual({ habitatId: "marsh", throughPlaceId: "region" });
  });

  // Bug: an uncovered place was given some habitat anyway.
  it("is null for a place under nothing covered", () => {
    expect(habitatForPlace("island", parentOf, [{ habitatId: "marsh", locationId: "region" }])).toBeNull();
  });

  // Bug: a parent cycle looped forever.
  it("stops on a parent cycle", () => {
    const loop = (id: string) => (id === "a" ? "b" : "a");
    expect(habitatForPlace("a", loop, [])).toBeNull();
  });
});

const entry = (name: string, percent: number, over: Partial<EncounterEntry> = {}): EncounterEntry => ({
  formId: name, speciesId: name, speciesName: name, name, percent, readable: true, about: null, linkLines: [], ...over,
});
const country = (entries: EncounterEntry[]): EncounterHabitat => ({ name: "Salt marsh", entries, notes: [] });
const marsh = country([entry("Marsh eel", 40), entry("Giant frog", 20)]);

describe("lifeConstraints", () => {
  // Bug: the roll ignored the shares (always the first, or evenly).
  it("rolls a creature at its share", () => {
    expect(lifeConstraints(marsh, () => 0.1)[0]).toContain("around Marsh eel");
    expect(lifeConstraints(marsh, () => 0.5)[0]).toContain("around Giant frog");
    expect(lifeConstraints(marsh, () => 0.1)[0]).toContain("what lives in Salt marsh. Other creatures may join it.");
  });

  // Bug: the hour and the links were dropped from the brief, or left a double space.
  it("says the hour and the species' links when it has them", () => {
    const h = country([entry("Marsh eel", 40, { about: "about at dusk", linkLines: ["Eats frogs."] })]);
    expect(lifeConstraints(h, () => 0.1)).toEqual(["Build this encounter around Marsh eel: it is what lives in Salt marsh, about at dusk. Eats frogs. Other creatures may join it."]);
  });

  // Bug: "anything else" still named a creature from the list, or did not name them to avoid.
  it("on 'anything else' asks for creatures that are not any listed", () => {
    expect(lifeConstraints(marsh, () => 0.9)).toEqual(["The creatures are not Marsh eel, Giant frog: something this country rarely sees."]);
  });

  // Bug: a creature another DM listed was handed to the model by its placeholder name.
  it("never names a creature the reader cannot read", () => {
    const h = country([entry("Marsh eel", 40), entry(UNREADABLE_CREATURE, 20, { readable: false })]);
    expect(lifeConstraints(h, () => 0.5)).toEqual(["The creatures are not Marsh eel: something this country rarely sees."]);
  });

  // Bug: a habitat with nothing at a share still constrained the encounter.
  it("adds no constraint for a habitat with no creature at a share", () => {
    expect(lifeConstraints(country([]), () => 0.1)).toEqual([]);
    expect(lifeConstraints(country([entry("Marsh eel", 0)]), () => 0.1)).toEqual([]);
  });
});

describe("whereLine", () => {
  // Bug: two forms of one species were listed as two creatures, or the rest left out.
  it("sums a species' forms and names the rest as anything else", () => {
    const h = country([entry("Young eel", 10, { speciesName: "Marsh eel" }), entry("Old eel", 30, { speciesName: "Marsh eel" }), entry("Giant frog", 20)]);
    expect(whereLine(h)).toBe("Salt marsh: Marsh eel 40%, Giant frog 20%, anything else 40%");
  });
});

describe("buildEncounterHabitat", () => {
  const sp = (id: string, name: string, over: Partial<Species> = {}): Species => ({
    id, name, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0, ...over,
  });
  const fm = (id: string, speciesId: string): SpeciesForm => ({ id, speciesId, label: "Adult", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: null });
  const row = (formId: string, speciesId: string, over: Partial<HabitatLife> = {}): HabitatLife => ({
    id: formId, habitatId: "h", speciesId, formId, percent: null, sortOrder: 0, recordId: formId, fromLibrary: false, name: `${speciesId} stats`, speciesName: speciesId, formLabel: "Adult", readable: true, ...over,
  });
  const habitat = { id: "h", name: "Salt marsh", description: null, sortOrder: 0, otherPercent: null };
  const build = (life: HabitatLife[], over: Partial<Parameters<typeof buildEncounterHabitat>[0]> = {}) =>
    buildEncounterHabitat({
      habitat,
      habitatSpecies: [{ id: "x", habitatId: "h", speciesId: "eel", abundance: null, sortOrder: 0 }, { id: "y", habitatId: "h", speciesId: "frog", abundance: null, sortOrder: 1 }],
      life,
      species: [sp("eel", "Eel", { activity: "night" }), sp("frog", "Frog")],
      forms: [fm("e1", "eel"), fm("f1", "frog")],
      links: [],
      statBlockNameByForm: new Map(),
      when: { timeOfDay: null, season: null },
      ...over,
    });

  // Bug: a form with no stat block was rolled (there is nothing to build an encounter from).
  it("never rolls a form without a stat block, though it takes its share", () => {
    const h = build([row("e1", "eel", { recordId: null, name: null }), row("f1", "frog")]);
    expect(h.entries.map((e) => e.formId)).toEqual(["f1"]);
    expect(h.entries[0].percent).toBe(45);
  });

  // Bug: a stat block the reader may not read was named to the model.
  it("names a form the reader may not read as the placeholder", () => {
    const h = build([row("e1", "eel", { name: null, readable: false })]);
    expect(h.entries[0]).toMatchObject({ name: UNREADABLE_CREATURE, readable: false });
  });

  // Bug: the hour was ignored, so a night animal was met in full at noon, and no word said so.
  it("halves a resting species and says so, and says who is about", () => {
    const day = build([row("e1", "eel"), row("f1", "frog")], { when: { timeOfDay: "day", season: null } });
    expect(day.entries[0].percent).toBe(22.5);
    expect(day.notes).toEqual(["Eel is resting by day, so it is met half as often."]);
    const night = build([row("e1", "eel")], { when: { timeOfDay: "night", season: null } });
    expect(night.entries[0].about).toBe("about by night");
  });

  // Bug: a link scoped to another habitat was told about here.
  it("tells only the links that are unscoped or scoped to this habitat, at most three", () => {
    const link = (id: string, habitatId: string | null) => ({ id, fromSpeciesId: "eel", kind: "eats" as const, toSpeciesId: "frog", fromFormId: null, toFormId: null, habitatId, note: null });
    const links = [link("a", null), link("b", "h"), link("c", "other"), link("d", null), link("e", null)];
    const h = build([row("e1", "eel")], { links });
    expect(h.entries[0].linkLines).toHaveLength(3);
    const only = build([row("e1", "eel")], { links: [link("c", "other")] });
    expect(only.entries[0].linkLines).toEqual([]);
  });
});

describe("encounterSourceForPlace", () => {
  const covered = [{ habitatId: "marsh", locationId: "region" }];
  const table = (id: string, placeId: string) => ({ id, name: `Table ${id}`, placeId });

  // Bug: a place with its own encounter table still rolled from the habitat around it.
  it("lets a place's own table win over the habitat that covers it", () => {
    expect(encounterSourceForPlace("town", parentOf, [table("t1", "town")], covered)).toEqual({
      from: "table",
      tables: [{ id: "t1", name: "Table t1", placeId: "town" }],
    });
  });

  // Bug: only a table on the very place counted, so a room of a town with a table fell through to the habitat.
  it("takes the table of the nearest place it lies inside before any habitat", () => {
    const source = encounterSourceForPlace("room", parentOf, [table("t1", "town")], covered);
    expect(source).toMatchObject({ from: "table", tables: [{ id: "t1" }] });
  });

  // Bug: the habitat was dropped whenever tables existed anywhere in the campaign, not only on this place's line.
  it("falls back to the habitat when no table is on the place or above it", () => {
    expect(encounterSourceForPlace("town", parentOf, [table("t9", "island")], covered)).toEqual({
      from: "habitat",
      match: { habitatId: "marsh", throughPlaceId: "region" },
    });
  });

  // Bug: a place with neither was given a source.
  it("is null with no table and no habitat", () => {
    expect(encounterSourceForPlace("island", parentOf, [], covered)).toBeNull();
  });
});
