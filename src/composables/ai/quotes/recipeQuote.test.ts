import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Every row priced differently, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { recipe_generation: 7 };
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string) => costs[key] ?? 1 }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useRecipeQuote } = await import("./recipeQuote");

describe("useRecipeQuote", () => {
  it("prices the text under recipe_generation, the row the server charges", () => {
    const quote = useRecipeQuote()();
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["Recipe text", 7]]);
    expect(quote.total).toBe(7);
  });
});
