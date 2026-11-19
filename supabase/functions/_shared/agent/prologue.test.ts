import { describe, expect, it } from "vitest";
import { prologueText, READ_ALOUD_MAX, startPlace, type Prologue } from "./prologue";

const prologue = (over: Partial<Prologue> = {}): Prologue => ({ questId: "q", beatId: "b", beatTitle: "Sister Ribbon's Offer", locationId: "inn", readAloud: "There is a workshop on the eastern slope.", ...over });

describe("startPlace", () => {
  it("begins the campaign where the opening beat is staged when the page named no place", () => {
    expect(startPlace(undefined, prologue())).toBe("inn");
  });

  it("goes by the place the page named, so a player who chose where to begin is not moved to the prologue", () => {
    expect(startPlace("cellar", prologue())).toBe("cellar");
  });

  it("begins nowhere in particular without a prologue, or with one staged nowhere", () => {
    expect(startPlace(undefined, null)).toBeNull();
    expect(startPlace(undefined, prologue({ locationId: null }))).toBeNull();
  });
});

describe("prologueText", () => {
  it("hands the narrator the adventure's own opening words", () => {
    expect(prologueText(prologue())).toContain("There is a workshop on the eastern slope.");
  });

  it("adds nothing when there is no prologue or it has no read-aloud, instead of an instruction with nothing under it", () => {
    expect(prologueText(null)).toBeNull();
    expect(prologueText(prologue({ readAloud: "   " }))).toBeNull();
  });

  it("cuts a read-aloud that runs to a chapter, so one beat cannot fill the turn", () => {
    const long = prologueText(prologue({ readAloud: "x".repeat(READ_ALOUD_MAX + 500) }))!;
    expect(long).not.toContain("x".repeat(READ_ALOUD_MAX));
    expect(long.endsWith("…")).toBe(true);
  });
});
