import { describe, expect, it } from "vitest";
import { clearTreatmentPatch, pickTreatment, withoutTreatment } from "./pictureTreatment";

describe("pictureTreatment", () => {
  // Fails on: a conversion that copies src and size but drops the recipe, so a treated picture falls back to its raw file.
  it("keeps the recipe keys a picture has and nothing else", () => {
    const recipe = { steps: [{ type: "grade" }] };
    expect(pickTreatment({ src: "a.webp", width: "330", original: "o.webp", illuminate: recipe, bakedFor: "h1" })).toEqual({
      original: "o.webp",
      illuminate: recipe,
      bakedFor: "h1",
    });
  });

  it("leaves out a key the picture does not hold, so an untreated picture gains no empty recipe", () => {
    expect(pickTreatment({ src: "a.webp", original: null, illuminate: undefined })).toEqual({});
  });

  // Fails on: Replace keeping the old picture's recipe, which then bakes over the new file.
  it("clears the recipe of a replaced picture, in both shapes", () => {
    expect(withoutTreatment({ src: "a", original: "o", opacity: 40 })).toEqual({ src: "a", opacity: 40 });
    expect(clearTreatmentPatch({ src: "a", original: "o", bakedFor: "h" })).toEqual({ original: null, bakedFor: null });
  });
});
