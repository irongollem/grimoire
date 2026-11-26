import { describe, expect, it } from "vitest";
import { workedOutShares, speciesShare, type EcologySpeciesInput } from "./ecologyShares";

const sp = (speciesId: string, abundance: EcologySpeciesInput["abundance"] = null, livesAs: EcologySpeciesInput["livesAs"] = null): EcologySpeciesInput => ({ speciesId, abundance, livesAs });
const pct = (r: ReturnType<typeof workedOutShares>, id: string) => r.forms.get(id)?.percent;

describe("workedOutShares", () => {
  // Bug: an unset share ignored how common the species is (everything split evenly).
  // Common (20) against rare (3), 90 to share: 90 * 20/23 = 78.3 and 90 * 3/23 = 11.7.
  it("shares what is free by how common each species is", () => {
    const r = workedOutShares({ species: [sp("a", "common"), sp("b", "rare")], life: [{ formId: "fa", speciesId: "a", percent: null }, { formId: "fb", speciesId: "b", percent: null }], otherPercent: null });
    expect(pct(r, "fa")).toBe(78.3);
    expect(pct(r, "fb")).toBe(11.7);
    expect(r.other).toEqual({ percent: 10, set: false });
  });

  // Bug: a number the DM typed was recomputed and overwritten.
  it("keeps a typed share exactly and flags it as set", () => {
    const r = workedOutShares({ species: [sp("a", "abundant")], life: [{ formId: "fa", speciesId: "a", percent: 7.25 }], otherPercent: null });
    expect(r.forms.get("fa")).toEqual({ percent: 7.25, set: true });
  });

  // Bug: the free share leaked past 100 (typed shares not subtracted).
  it("never lets the total pass 100 when the DM has typed some", () => {
    const r = workedOutShares({ species: [sp("a"), sp("b")], life: [{ formId: "fa", speciesId: "a", percent: 60 }, { formId: "fb", speciesId: "b", percent: null }, { formId: "fc", speciesId: "b", percent: null }], otherPercent: null });
    // 100 - 10 other - 60 typed = 30 free, split between the two unset forms of b.
    expect(pct(r, "fb")! + pct(r, "fc")!).toBeCloseTo(30, 5);
  });

  // Bug: a species with every form typed was given more on top.
  it("gives a species whose forms are all typed nothing extra, and its target shrinks the other's room only by what was typed", () => {
    const r = workedOutShares({ species: [sp("a", "abundant"), sp("b", "abundant")], life: [{ formId: "fa", speciesId: "a", percent: 20 }, { formId: "fb", speciesId: "b", percent: null }], otherPercent: null });
    expect(pct(r, "fa")).toBe(20);
    expect(pct(r, "fb")).toBe(70);
  });

  // Bug: a typed form did not reduce its own species' target, so the species got double.
  it("counts a typed form against its own species' target before working out its siblings", () => {
    const r = workedOutShares({ species: [sp("a", "common"), sp("b", "common")], life: [{ formId: "a1", speciesId: "a", percent: 40 }, { formId: "a2", speciesId: "a", percent: null }, { formId: "b1", speciesId: "b", percent: null }], otherPercent: null });
    // free = 50; a2 target 45-40=5, b1 target 45: scaled to 50 -> 5 and 45.
    expect(pct(r, "a2")).toBe(5);
    expect(pct(r, "b1")).toBe(45);
  });

  // Bug: when every unset form wanted nothing, the free share vanished instead of being split.
  it("splits the free share evenly among unset forms when every target is already met", () => {
    // a's target is 45 but 60 is typed: raw 0 for a2 and a3. free = 100 - 10 - 70 = 20.
    const r = workedOutShares({ species: [sp("a"), sp("b")], life: [{ formId: "a1", speciesId: "a", percent: 60 }, { formId: "a2", speciesId: "a", percent: null }, { formId: "a3", speciesId: "a", percent: null }, { formId: "b1", speciesId: "b", percent: 10 }], otherPercent: null });
    expect(pct(r, "a2")).toBe(10);
    expect(pct(r, "a3")).toBe(10);
  });

  // Bug: the DM's "anything else" was ignored for the default 10.
  it("uses the DM's own other share and marks it set", () => {
    const r = workedOutShares({ species: [sp("a")], life: [{ formId: "fa", speciesId: "a", percent: null }], otherPercent: 40 });
    expect(r.other).toEqual({ percent: 40, set: true });
    expect(pct(r, "fa")).toBe(60);
  });

  // Bug: a typed total at the ceiling left negative free shares.
  it("gives unset forms 0 when nothing is free", () => {
    const r = workedOutShares({ species: [sp("a"), sp("b")], life: [{ formId: "fa", speciesId: "a", percent: 95 }, { formId: "fb", speciesId: "b", percent: null }], otherPercent: null });
    expect(pct(r, "fb")).toBe(0);
  });

  // Bug: lives-as did not lower a group's share.
  it("meets a herd less often than a loner of the same abundance", () => {
    const r = workedOutShares({ species: [sp("a", "common", "herd"), sp("b", "common", "alone")], life: [{ formId: "fa", speciesId: "a", percent: null }, { formId: "fb", speciesId: "b", percent: null }], otherPercent: null });
    // weights 10 and 20: 30 and 60.
    expect(pct(r, "fa")).toBe(30);
    expect(pct(r, "fb")).toBe(60);
  });
});

describe("speciesShare", () => {
  it("sums only the species' own forms", () => {
    const r = workedOutShares({ species: [sp("a")], life: [{ formId: "a1", speciesId: "a", percent: 20 }, { formId: "a2", speciesId: "a", percent: 5 }, { formId: "z", speciesId: "a", percent: 30 }], otherPercent: null });
    expect(speciesShare(r.forms, ["a1", "a2"])).toBe(25);
  });
});
