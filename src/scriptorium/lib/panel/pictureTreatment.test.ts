import { describe, expect, it } from "vitest";
import { clearTreatmentPatch, mergeTreatmentPatch, pickTreatment, resetPatch, treatmentPatch, withoutTreatment } from "./pictureTreatment";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

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

describe("editing a picture's recipe", () => {
  const recipe = (): IlluminateSettings => ({ v: 1, seed: 1, steps: [{ type: "vignette", options: { strength: 0.3, softness: 0.5, mode: "transparent", colour: "#000" } }] });

  // Fails on: the first edit not remembering the untouched file, so Reset has nothing to put back.
  it("keeps the file as it was as the original on the first edit", () => {
    expect(treatmentPatch({ src: "a.webp" }, recipe())).toEqual({ original: "a.webp", illuminate: recipe(), bakedFor: null });
  });

  // Fails on: a second edit taking the first bake as the original, so edits stack on a baked picture and Reset restores the bake.
  it("keeps the original it already has on later edits", () => {
    expect(treatmentPatch({ src: "bake.webp", original: "a.webp", bakedFor: "h" }, recipe())).toEqual({ original: "a.webp", illuminate: recipe(), bakedFor: null });
  });

  // Fails on: an edit keeping the old bake hash, so players are served the previous bake (or the raw file) as if it were the new recipe.
  it("clears bakedFor on a first and a later edit, so a pending bake is visible", () => {
    expect(treatmentPatch({ src: "a.webp" }, recipe())).toHaveProperty("bakedFor", null);
    expect(treatmentPatch({ src: "bake.webp", original: "a.webp", bakedFor: "h" }, recipe())).toHaveProperty("bakedFor", null);
  });

  // Fails on: a recipe emptied by hand leaving a bake of nothing behind instead of the picture.
  it("is the original picture again when the recipe has no steps", () => {
    expect(treatmentPatch({ src: "bake.webp", original: "a.webp" }, { v: 1, seed: 1, steps: [] })).toEqual({
      original: null, illuminate: null, bakedFor: null, src: "a.webp",
    });
  });

  it("resets nothing on a picture that was never treated", () => {
    expect(resetPatch({ src: "a.webp" })).toEqual({ original: null, illuminate: null, bakedFor: null });
  });

  // Fails on: furniture props holding a recipe object (props are strings and numbers) or keeping a cleared key as null.
  it("writes a recipe into furniture props as JSON text and removes cleared keys", () => {
    const merged = mergeTreatmentPatch({ src: "bake", original: "a", bakedFor: "h", opacity: 40 }, { illuminate: recipe(), bakedFor: null, src: "x" });
    expect(merged).toEqual({ src: "x", original: "a", opacity: 40, illuminate: JSON.stringify(recipe()) });
  });
});
