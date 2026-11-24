import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Every row priced differently, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { custom_subclass_generation: 7 };
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string) => costs[key] ?? 1 }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useSubclassQuote } = await import("./subclassQuote");

describe("useSubclassQuote", () => {
  it("prices the text under custom_subclass_generation, the row the server charges", () => {
    const quote = useSubclassQuote()();
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["Archetype text", 7]]);
    expect(quote.total).toBe(7);
  });
});
