import { describe, expect, it } from "vitest";
import {
  needsConcentrationNote,
  spellCastingTime,
  spellComponentsInWords,
  spellDuration,
  spellRange,
} from "./spellFacts";

describe("spellFacts", () => {
  it("spells out components and appends the material", () => {
    expect(spellComponentsInWords({ components: ["V", "s"], material: null })).toBe("Verbal, Somatic");
    expect(spellComponentsInWords({ components: ["V", "M"], material: "a bat's fur" })).toBe(
      "Verbal, Material (a bat's fur)",
    );
  });

  it("lets a custom value win over the picked option", () => {
    expect(spellCastingTime({ casting_time: "1 action", casting_time_custom: "10 minutes" })).toBe("10 minutes");
    expect(spellRange({ range: "Self", range_custom: "30 feet (hand of the caster)" })).toBe("30 feet (hand of the caster)");
    expect(spellDuration({ duration: "Instantaneous", duration_custom: "Until dispelled" })).toBe("Until dispelled");
    // No custom value (null or blank) falls back to the picked option.
    expect(spellCastingTime({ casting_time: "1 action", casting_time_custom: null })).toBe("1 action");
    expect(spellRange({ range: "Self", range_custom: null })).toBe("Self");
    expect(spellDuration({ duration: "Instantaneous", duration_custom: "" })).toBe("Instantaneous");
  });

  it("notes concentration only when the duration does not say it", () => {
    expect(needsConcentrationNote({ concentration: true, duration: "1 minute", duration_custom: null })).toBe(true);
    expect(
      needsConcentrationNote({ concentration: true, duration: "Concentration, up to 1 minute", duration_custom: null }),
    ).toBe(false);
    expect(needsConcentrationNote({ concentration: false, duration: "1 minute", duration_custom: null })).toBe(false);
    // The wording is read from the custom duration when there is one, in any case.
    expect(
      needsConcentrationNote({ concentration: true, duration: "1 minute", duration_custom: "concentration, 10 minutes" }),
    ).toBe(false);
  });
});
