import { beforeEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { providerQualityFor, resolveImageQuality } from "./imageQuality.ts";

const { fetchImageQualityTier } = vi.hoisted(() => ({ fetchImageQualityTier: vi.fn<() => Promise<string | null>>() }));
vi.mock("./credits.ts", () => ({ fetchImageQualityTier }));

const admin = {} as SupabaseClient;

describe("providerQualityFor — provider-neutral tier -> provider value", () => {
  // Each provider's own vocabulary: gpt-image `quality` low/medium/high,
  // Gemini `imageConfig.imageSize` 1K/2K/4K. "standard" is the middle of both.
  it.each([
    ["low", "openai", "low"],
    ["standard", "openai", "medium"],
    ["high", "openai", "high"],
    ["low", "gemini", "1K"],
    ["standard", "gemini", "2K"],
    ["high", "gemini", "4K"],
  ] as const)("%s on %s is %s", (tier, base, expected) => {
    expect(providerQualityFor(tier, base)).toBe(expected);
  });
});

describe("resolveImageQuality", () => {
  beforeEach(() => fetchImageQualityTier.mockReset());

  it("maps the tier an admin set to this call's own provider", async () => {
    fetchImageQualityTier.mockResolvedValue("standard");
    await expect(resolveImageQuality(admin, "entity_image", { base: "gemini", imageQuality: "1K" })).resolves.toBe("2K");
    await expect(resolveImageQuality(admin, "entity_image", { base: "openai", imageQuality: "low" })).resolves.toBe("medium");
  });

  it("keeps the provider's own default when no tier is set", async () => {
    fetchImageQualityTier.mockResolvedValue(null);
    await expect(resolveImageQuality(admin, "entity_image", { base: "openai", imageQuality: "low" })).resolves.toBe("low");
  });

  it("does not forward a tier it does not know", async () => {
    fetchImageQualityTier.mockResolvedValue("ultra");
    await expect(resolveImageQuality(admin, "entity_image", { base: "openai", imageQuality: "high" })).resolves.toBe("high");
  });
});
