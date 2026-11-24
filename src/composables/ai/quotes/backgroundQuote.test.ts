import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Every row priced differently, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { background_generation: 7 };
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string) => costs[key] ?? 1 }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useBackgroundQuote } = await import("./backgroundQuote");

describe("useBackgroundQuote", () => {
  it("prices the text under background_generation, the row the server charges", () => {
    const quote = useBackgroundQuote()();
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["Background text", 7]]);
    expect(quote.total).toBe(7);
  });
});
