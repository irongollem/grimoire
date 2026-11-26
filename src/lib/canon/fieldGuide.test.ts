import { describe, expect, it } from "vitest";
import { groupSpecies, habitatRolls, speciesMark, splitStageInput } from "./fieldGuide";
import type { Clade, HabitatLifeRow, HabitatSpecies, Species, SpeciesForm } from "./ecologyTypes";
import type { Habitat } from "./habitats";

const clade = (o: Partial<Clade> & { id: string }): Clade => ({ name: o.id, rank: null, parentId: null, description: null, sortOrder: 0, ...o });
const species = (o: Partial<Species> & { id: string }): Species => ({ name: o.id, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0, ...o });
const form = (o: Partial<SpeciesForm> & { id: string }): SpeciesForm => ({ speciesId: "s", label: "Adult", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: null, ...o });

describe("groupSpecies", () => {
  // Bug: the kingdom filter showed every species whatever was chosen, or hid the species of no clade.
  it("keeps only the chosen kingdom and drops clades left empty by it", () => {
    const clades = [clade({ id: "bears" }), clade({ id: "ferns" })];
    const all = [species({ id: "bear", cladeId: "bears" }), species({ id: "fern", cladeId: "ferns", kingdom: "plant" }), species({ id: "moss", kingdom: "plant" })];
    const plants = groupSpecies(all, clades, "plant");
    expect(plants.map((g) => [g.heading, g.species.map((s) => s.id)])).toEqual([["ferns", ["fern"]], ["In no clade", ["moss"]]]);
    expect(groupSpecies(all, clades, null).map((g) => g.heading)).toEqual(["bears", "ferns", "In no clade"]);
  });

  // Bug: a nested clade's heading was not indented under its parent, or a rank was not shown beside the name.
  it("orders clades parent-first, indents the nested one and words the heading with its rank", () => {
    const clades = [clade({ id: "genus", name: "Rubiursus", rank: "genus", parentId: "family", sortOrder: 0 }), clade({ id: "family", name: "Ursidae", sortOrder: 0 })];
    const groups = groupSpecies([species({ id: "a", cladeId: "genus" }), species({ id: "b", cladeId: "family" })], clades, null);
    expect(groups.map((g) => [g.heading, g.depth])).toEqual([["Ursidae", 0], ["Rubiursus · genus", 1]]);
  });

  // Bug: a species whose clade was deleted vanished from the list instead of landing under "In no clade".
  it("lists a species of a vanished clade as in no clade", () => {
    const groups = groupSpecies([species({ id: "orphan", cladeId: "gone" })], [], null);
    expect(groups).toMatchObject([{ clade: null, heading: "In no clade" }]);
  });
});

describe("speciesMark", () => {
  it("says no stat block, the form count, and how many are domesticated", () => {
    expect(speciesMark([])).toBe("No stat block");
    expect(speciesMark([form({ id: "a" })])).toBe("1 form");
    expect(speciesMark([form({ id: "a" }), form({ id: "b" }), form({ id: "c", domesticated: true })])).toBe("3 forms, 1 domesticated");
  });
});

describe("splitStageInput", () => {
  // Bug: the words typed before the @ were dropped, or a bare stat block made a form with no label.
  it("takes the words before the pick as the label and defaults to Adult", () => {
    expect(splitStageInput("Young @Rime_Cub ", "@Rime_Cub", "m1")).toEqual({ label: "Young", itemId: "m1" });
    expect(splitStageInput("@Rime_Bear ", "@Rime_Bear", "m2")).toEqual({ label: "Adult", itemId: "m2" });
  });

  it("makes a stat-block-less stage from plain words, and nothing from a blank line", () => {
    expect(splitStageInput("Elder", null, null)).toEqual({ label: "Elder", itemId: null });
    expect(splitStageInput("   ", null, null)).toBeNull();
  });

  // Bug: a pick whose token the DM then deleted from the line still attached its stat block.
  it("forgets a pick whose words were deleted from the line", () => {
    expect(splitStageInput("Young", "@Rime_Cub", "m1")).toEqual({ label: "Young", itemId: null });
  });
});

describe("habitatRolls", () => {
  const habitat = (id: string): Habitat => ({ id, name: id, description: null, sortOrder: 0, otherPercent: 0 });
  const hs = (habitatId: string, speciesId: string): HabitatSpecies => ({ id: `${habitatId}-${speciesId}`, habitatId, speciesId, abundance: "common", sortOrder: 0 });
  const life = (habitatId: string, speciesId: string, formId: string, percent: number | null): HabitatLifeRow => ({ id: formId, habitatId, speciesId, formId, percent, sortOrder: 0, recordId: null, fromLibrary: false, name: null, speciesName: speciesId, formLabel: "Adult" });

  // Bug: the share was read from the wrong habitat's roll, or the DM's own percent was ignored for a worked-out one.
  it("gives the share in each habitat the species lives in, and none for one it does not", () => {
    const rolls = habitatRolls(
      "wolf",
      [habitat("marsh"), habitat("hills"), habitat("ice")],
      [hs("marsh", "wolf"), hs("marsh", "heron"), hs("hills", "wolf")],
      [life("marsh", "wolf", "w1", 30), life("marsh", "heron", "h1", 70), life("hills", "wolf", "w2", 100)],
      new Map([["wolf", species({ id: "wolf" })], ["heron", species({ id: "heron" })]]),
    );
    expect(rolls.map((r) => [r.habitat.id, r.percent])).toEqual([["marsh", 30], ["hills", 100]]);
  });

  // Bug: a plant living in a habitat with no form on its roll read "met on a roll 0%" instead of never being met.
  it("gives no share, not 0, for a species that lives there with no form on the roll", () => {
    const rolls = habitatRolls(
      "reed",
      [habitat("marsh")],
      [hs("marsh", "reed"), hs("marsh", "heron")],
      [life("marsh", "heron", "h1", null)],
      new Map([["reed", species({ id: "reed" })], ["heron", species({ id: "heron" })]]),
    );
    expect(rolls.map((r) => [r.habitat.id, r.percent])).toEqual([["marsh", null]]);
  });
});
