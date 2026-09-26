import { describe, it, expect } from "vitest";
import { providerQualityFor, type ImageQualityTier } from "./imageQuality.ts";

describe("providerQualityFor — provider-neutral tier -> provider value", () => {
  it("maps every tier to OpenAI's quality vocabulary", () => {
    expect(providerQualityFor("low", "openai")).toBe("low");
    expect(providerQualityFor("standard", "openai")).toBe("medium");
    expect(providerQualityFor("high", "openai")).toBe("high");
  });

  it("maps every tier to Gemini's imageSize vocabulary", () => {
    expect(providerQualityFor("low", "gemini")).toBe("1K");
    expect(providerQualityFor("standard", "gemini")).toBe("2K");
    expect(providerQualityFor("high", "gemini")).toBe("4K");
  });

  it("covers every declared tier for both providers", () => {
    const tiers: ImageQualityTier[] = ["low", "standard", "high"];
    for (const tier of tiers) {
      expect(typeof providerQualityFor(tier, "openai")).toBe("string");
      expect(typeof providerQualityFor(tier, "gemini")).toBe("string");
    }
  });
});
