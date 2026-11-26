import { describe, expect, it } from "vitest";
import { cladePath, linkSentence, linkWords, rollAdjust, thumbnailFormId, type LinkContext } from "./ecology";
import type { Clade, LinkKind, Species, SpeciesForm, SpeciesLink } from "./ecologyTypes";

const species = (id: string, name: string, over: Partial<Species> = {}): Species => ({
  id, name, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0, ...over,
});
const form = (id: string, speciesId: string, label: string, over: Partial<SpeciesForm> = {}): SpeciesForm => ({
  id, speciesId, label, stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: null, ...over,
});

describe("rollAdjust", () => {
  const shares = [{ formId: "f1", speciesId: "s1", percent: 40 }, { formId: "f2", speciesId: "s2", percent: 20 }];

  // Bug: a species away for the season stayed on the roll, or its share went to the others.
  it("takes a species away this season off the roll and does not hand its share on", () => {
    const map = new Map([["s1", species("s1", "Squillick", { seasons: { winter: { away: true, note: null } } })], ["s2", species("s2", "Eel")]]);
    const r = rollAdjust(shares, map, { timeOfDay: null, season: "winter" });
    expect(r.shares.map((s) => s.percent)).toEqual([0, 20]);
    expect(r.notes).toEqual(["Squillick is away in winter."]);
    // Another season leaves it be.
    expect(rollAdjust(shares, map, { timeOfDay: null, season: "summer" }).shares[0].percent).toBe(40);
  });

  // Bug: a day animal met in full at night, or an any-time one halved.
  it.each([
    ["day", "day", 40], ["day", "night", 20], ["night", "night", 40], ["night", "day", 20],
    ["twilight", "dusk", 40], ["twilight", "dawn", 40], ["twilight", "day", 20], ["any", "night", 40],
  ] as const)("a %s species at %s is met at %s", (activity, timeOfDay, expected) => {
    const map = new Map([["s1", species("s1", "Rust Robber", { activity })]]);
    expect(rollAdjust([shares[0]], map, { timeOfDay, season: null }).shares[0].percent).toBe(expected);
  });

  it("says a resting species is met half as often", () => {
    const map = new Map([["s1", species("s1", "Rust Robber", { activity: "night" })]]);
    expect(rollAdjust([shares[0]], map, { timeOfDay: "day", season: null }).notes).toEqual(["Rust Robber is resting by day, so it is met half as often."]);
  });

  // Bug: with no hour or season set, activity and away still applied.
  it("changes nothing when neither hour nor season is known", () => {
    const map = new Map([["s1", species("s1", "A", { activity: "night", seasons: { winter: { away: true, note: null } } })]]);
    const r = rollAdjust([shares[0]], map, { timeOfDay: null, season: null });
    expect(r).toEqual({ shares: [shares[0]], notes: [] });
  });

  // Bug: a species with two forms was noted twice.
  it("notes a species once however many forms it has", () => {
    const map = new Map([["s1", species("s1", "A", { activity: "night" })]]);
    const two = [shares[0], { formId: "f3", speciesId: "s1", percent: 5 }];
    expect(rollAdjust(two, map, { timeOfDay: "day", season: null }).notes).toHaveLength(1);
  });
});

describe("linkWords", () => {
  const pith = species("pp", "Pith Piper");
  const grub = species("gd", "Grub-duster");
  const crust = species("fc", "False Crust");
  const forms = [form("pp-grown", "pp", "Grown"), form("fc-old", "fc", "Old", { monsterId: "m1" }), form("fc-young", "fc", "Young")];
  const ctx: LinkContext = {
    speciesById: new Map([pith, grub, crust].map((s) => [s.id, s])),
    formsById: new Map(forms.map((f) => [f.id, f])),
    statBlockNameByForm: new Map([["fc-old", "Old False Crust"], ["fc-young", "False Crust"]]),
  };
  const link = (kind: LinkKind, over: Partial<SpeciesLink> = {}): SpeciesLink => ({
    id: "l", fromSpeciesId: "gd", kind, toSpeciesId: "pp", fromFormId: null, toFormId: null, habitatId: null, note: null, ...over,
  });
  const text = (l: SpeciesLink, from: string) => linkSentence(linkWords(l, from, ctx));

  // Bug: backward kinds read as forward ("Pith Piper eats Grub-duster").
  it.each([
    ["eats", "Eats Pith Piper.", "Is eaten by Grub-duster."],
    ["competes", "Competes with Pith Piper.", "Competes with Grub-duster."],
    ["helps", "Helps Pith Piper.", "Helps Grub-duster."],
    ["lives_on", "Lives on Pith Piper.", "Is home to Grub-duster."],
  ] as const)("%s reads both ways", (kind, forward, backward) => {
    expect(text(link(kind), "gd")).toBe(forward);
    expect(text(link(kind), "pp")).toBe(backward);
  });

  it.each([
    ["shelters", "Shelters other animals.", "Is sheltered by Grub-duster."],
    ["carries", "Carries other animals.", "Is carried by Grub-duster."],
  ] as const)("%s with no target reads as other animals", (kind, forward, backward) => {
    expect(text(link(kind, { toSpeciesId: null }), "gd")).toBe(forward);
    // Perspective of no one on the target side: from side reads backward only for a real target.
    expect(text(link(kind, { toSpeciesId: "pp" }), "pp")).toBe(backward);
  });

  // Bug: a form with no distinct stat block name was shown as just the species, losing "grown".
  it("shows a form without a distinct stat block as its label before the species", () => {
    const tokens = linkWords(link("eats", { toFormId: "pp-grown" }), "gd", ctx);
    expect(tokens).toEqual([
      { type: "word", text: "eats" }, { type: "word", text: "grown" }, { type: "species", id: "pp", name: "Pith Piper" },
    ]);
  });

  // Bug: a form whose stat block shares the species' name was shown as a form token.
  it("treats a stat block named like its species as no distinct name", () => {
    const tokens = linkWords(link("eats", { toSpeciesId: "fc", toFormId: "fc-young" }), "gd", ctx);
    expect(tokens[1]).toEqual({ type: "word", text: "young" });
  });

  // Bug: a narrowed form on the perspective side did not lead the sentence.
  it("leads with a form narrowed on the perspective side", () => {
    const l = link("lives_on", { toSpeciesId: "fc", toFormId: "fc-old" });
    expect(linkWords(l, "fc", ctx)).toEqual([
      { type: "form", id: "fc-old", name: "Old False Crust" },
      { type: "word", text: "is home to" },
      { type: "species", id: "gd", name: "Grub-duster" },
    ]);
  });
});

describe("thumbnailFormId", () => {
  const a = form("a", "s", "Young", { stageOrder: 0 });
  const b = form("b", "s", "Old", { stageOrder: 1 });

  // Bug: the first form was always picked.
  it("picks the form met most often", () => {
    expect(thumbnailFormId([a, b], new Map([["a", 5], ["b", 30]]))).toBe("b");
  });
  it("falls back to the first by stage, then label", () => {
    expect(thumbnailFormId([b, a], new Map())).toBe("a");
    const same = [form("z", "s", "Zed"), form("y", "s", "Ay")];
    expect(thumbnailFormId(same, new Map())).toBe("y");
  });
  it("is null for no forms", () => {
    expect(thumbnailFormId([], new Map())).toBeNull();
  });
});

describe("cladePath", () => {
  const c = (id: string, parentId: string | null): Clade => ({ id, name: id, rank: null, parentId, description: null, sortOrder: 0 });
  it("runs root to leaf", () => {
    expect(cladePath("c", [c("a", null), c("b", "a"), c("c", "b")]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  // Bug: a missing parent crashed or looped.
  it("stops at a missing parent", () => {
    expect(cladePath("b", [c("b", "gone")]).map((x) => x.id)).toEqual(["b"]);
  });
  // Bug: a cycle looped forever.
  it("stops on a cycle", () => {
    expect(cladePath("a", [c("a", "b"), c("b", "a")]).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("is empty for no clade", () => {
    expect(cladePath(null, [c("a", null)])).toEqual([]);
  });
});
