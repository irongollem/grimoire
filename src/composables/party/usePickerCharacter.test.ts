import { describe, expect, it } from "vitest";
import { pickerReturnRoute, resolvePickerTarget, type PickerTargetInput } from "./usePickerCharacter";

const base: PickerTargetInput = {
  requested: null, dmPreview: false, dmPreviewId: null, activeId: "active", ownedIds: new Set(["active", "benched", "pool"]),
};

describe("resolvePickerTarget", () => {
  it("acts on the active character with no memberId", () => {
    expect(resolvePickerTarget(base)).toEqual({ id: "active", notFound: false });
  });

  it("has no character when none is active and none is asked for", () => {
    expect(resolvePickerTarget({ ...base, activeId: null })).toEqual({ id: null, notFound: false });
  });

  it("acts on a benched character at the table", () => {
    expect(resolvePickerTarget({ ...base, requested: "benched" })).toEqual({ id: "benched", notFound: false });
  });

  it("acts on a pool character", () => {
    expect(resolvePickerTarget({ ...base, requested: "pool" })).toEqual({ id: "pool", notFound: false });
  });

  it("refuses an id the viewer does not own, and never falls back to the active character", () => {
    expect(resolvePickerTarget({ ...base, requested: "someone-elses" })).toEqual({ id: null, notFound: true });
  });

  it("refuses an id that does not exist", () => {
    expect(resolvePickerTarget({ ...base, requested: "nope", ownedIds: new Set() })).toEqual({ id: null, notFound: true });
  });

  it("puts DM preview first", () => {
    expect(resolvePickerTarget({ ...base, dmPreview: true, dmPreviewId: "preview", requested: "pool" })).toEqual({
      id: "preview", notFound: false,
    });
    expect(resolvePickerTarget({ ...base, dmPreview: true, dmPreviewId: null })).toEqual({ id: null, notFound: false });
  });
});

describe("pickerReturnRoute", () => {
  const input = { isOtherCharacter: false, campaignId: "c1", memberId: "m1", back: null };

  it("returns the active character to their sheet", () => {
    expect(pickerReturnRoute(input)).toBe("/play");
  });

  it("returns a benched character to Champions", () => {
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true })).toEqual({ name: "play-champions" });
  });

  it("returns a pool character to its edit page when it came from there", () => {
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true, campaignId: null, back: "/play/character/edit?memberId=m1" }))
      .toEqual({ name: "play-character-edit", query: { memberId: "m1" } });
  });

  it("returns a pool character to the pool otherwise", () => {
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true, campaignId: null, back: "/play/home" }))
      .toEqual({ name: "play-home" });
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true, campaignId: null }))
      .toEqual({ name: "play-home" });
  });
});
