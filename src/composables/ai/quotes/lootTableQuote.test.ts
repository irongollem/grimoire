import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Prices by the table's own keys, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { loot_generation: 4, entity_image: 50 };
const providers = { imageProvider: ref<string | null>("openai") };

vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string) => costs[key] ?? 1 }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    ...providers,
    textCredits: (base: number) => base,
    imageCredits: (base: number) => base,
  }),
}));

const { useLootTableQuote } = await import("./lootTableQuote");

describe("useLootTableQuote", () => {
  beforeEach(() => {
  });

  it("prices the text under loot_generation, the row the server charges, and nothing else", () => {
    const quote = useLootTableQuote()();
    expect(quote.lines.map((l) => l.credits)).toEqual([4]);
    expect(quote.total).toBe(4);
  });
});
