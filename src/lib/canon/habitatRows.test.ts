import { describe, expect, it } from "vitest";
import { buildHabitatRows, habitatSummary, proposedSharesProblem } from "./habitatRows";
import type { HabitatLife, Habitat } from "./habitats";
import type { HabitatSpecies, Species, SpeciesForm } from "./ecologyTypes";

const habitat: Habitat = { id: "h1", name: "Salt marsh", description: null, sortOrder: 0, otherPercent: null };
const kind = (id: string, over: Partial<Species> = {}): Species => ({
  id, name: id, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0, ...over,
});
const form = (id: string, speciesId: string, over: Partial<SpeciesForm> = {}): SpeciesForm => ({
  id, speciesId, label: "Adult", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: `mon_${id}`, ...over,
});
const here = (speciesId: string, order = 0): HabitatSpecies => ({ id: `hs_${speciesId}`, habitatId: "h1", speciesId, abundance: null, sortOrder: order });
const onRoll = (formId: string, speciesId: string, percent: number | null, over: Partial<HabitatLife> = {}): HabitatLife => ({
  id: `l_${formId}`, habitatId: "h1", speciesId, formId, percent, sortOrder: 0, recordId: `mon_${formId}`, fromLibrary: true, name: formId, readable: true, speciesName: speciesId, formLabel: "Adult", ...over,
});

describe("buildHabitatRows", () => {
  // Bug: the DM's number and the worked-out one were merged, so a typed share could not be told from a placeholder.
  it("keeps what the DM typed apart from what is worked out", () => {
    const { species } = buildHabitatRows({
      habitat, habitatSpecies: [here("eel"), here("frog", 1)], species: [kind("eel"), kind("frog")], forms: [form("fe", "eel"), form("ff", "frog")],
      life: [onRoll("fe", "eel", 30), onRoll("ff", "frog", null)],
    });
    // The default 10 for anything else and the eel's 30 leave 60 for the frog.
    expect(species[0].forms[0]).toMatchObject({ typed: 30, worked: 30 });
    expect(species[1].forms[0]).toMatchObject({ typed: null, worked: 60 });
    expect(species[1].total).toBe(60);
  });

  // Bug: another habitat's species were listed here.
  it("lists only this habitat's species, in the DM's order", () => {
    const { species } = buildHabitatRows({
      habitat, habitatSpecies: [{ ...here("frog"), habitatId: "h2" }, here("eel", 2), here("newt", 1)],
      species: [kind("eel"), kind("frog"), kind("newt")], forms: [], life: [],
    });
    expect(species.map((s) => s.speciesId)).toEqual(["newt", "eel"]);
  });

  // Bug: a plant with no form on the roll was given a share of 0 instead of none, or took share from the others.
  it("gives a species with no form on the roll no share and says so", () => {
    const { species } = buildHabitatRows({
      habitat, habitatSpecies: [here("reed"), here("eel", 1)], species: [kind("reed", { kingdom: "plant" }), kind("eel")], forms: [form("fe", "eel")],
      life: [onRoll("fe", "eel", null)],
    });
    expect(species[0]).toMatchObject({ total: null, meta: "Plant · never met on a roll" });
    expect(species[1].total).toBe(90);
  });

  // Bug: the species picture came from the first form even when another is what is met most often.
  it("stands the form met most often for the species' picture", () => {
    const { species } = buildHabitatRows({
      habitat, habitatSpecies: [here("eel")], species: [kind("eel")],
      forms: [form("young", "eel", { stageOrder: 0 }), form("old", "eel", { stageOrder: 1 })],
      life: [onRoll("young", "eel", 10), onRoll("old", "eel", 50)],
    });
    expect(species[0].pictureOf).toBe("mon_old");
  });

  // Bug: how it lives was shown as the bare option word ("herd") rather than a sentence, or hid the scientific name.
  it("says the scientific name, else how it lives, under the name", () => {
    const { species } = buildHabitatRows({
      habitat, habitatSpecies: [here("eel"), here("frog", 1)],
      species: [kind("eel", { scientificName: "Anguilla salina" }), kind("frog", { livesAs: "colony" })],
      forms: [form("fe", "eel"), form("ff", "frog")], life: [onRoll("fe", "eel", null), onRoll("ff", "frog", null)],
    });
    expect(species.map((s) => s.meta)).toEqual(["Anguilla salina", "Lives in colonies or swarms"]);
  });
});

describe("habitatSummary", () => {
  // Bug: the list line summed forms as if each were a species, or left out a species whose share is worked out.
  it("sums each species' forms and leaves the rest as anything else", () => {
    const line = habitatSummary({
      habitat: { ...habitat, otherPercent: 20 }, habitatSpecies: [here("eel")], species: [kind("eel")],
      forms: [form("young", "eel"), form("old", "eel", { stageOrder: 1 })], life: [onRoll("young", "eel", 10), onRoll("old", "eel", 30)],
    });
    expect(line).toBe("eel 40%, anything else 60%");
  });

  // Bug: a habitat whose species have no stat block yet (so nothing on the roll, as after the walk drafts it) read
  // "Nothing lives here yet" while species lived there.
  it("names a species with nothing on the roll, with how common it is", () => {
    const line = habitatSummary({
      habitat, habitatSpecies: [here("eel"), { ...here("heron", 1), abundance: "rare" }], species: [kind("eel"), kind("heron")],
      forms: [form("young", "eel"), form("adult", "heron", { libraryMonsterId: null })], life: [onRoll("young", "eel", 40)],
    });
    expect(line).toBe("eel 40%, anything else 60%; heron (rare)");
  });
});

describe("proposedSharesProblem", () => {
  const life = [onRoll("a", "eel", 50), onRoll("b", "frog", 30), onRoll("c", "newt", null)];

  // Bug: a total past 100 was sent and the table refused it at commit.
  it("refuses a share that takes the typed total past 100 and allows exactly 100", () => {
    expect(proposedSharesProblem(life, null, { lifeId: "l_c", percent: 21 })).toContain("101%");
    expect(proposedSharesProblem(life, null, { lifeId: "l_c", percent: 20 })).toBeNull();
  });

  // Bug: "anything else" was left out of the total, so 50 + 30 + 25 passed.
  it("counts the DM's anything else, and replaces a share with the one being typed", () => {
    expect(proposedSharesProblem(life, null, { other: 21 })).toContain("101%");
    expect(proposedSharesProblem(life, 30, { lifeId: "l_a", percent: 20 })).toBeNull();
  });

  // Bug: clearing a share still counted its old number.
  it("counts a cleared share as nothing", () => {
    expect(proposedSharesProblem(life, 30, { lifeId: "l_a", percent: null })).toBeNull();
  });
});
