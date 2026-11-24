import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Prices by the table's own keys, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { npc_text: 1, monster_stat_block: 3, entity_image: 50, portrait: 2 };
const providers = {
  imageProvider: ref<string | null>("openai"),
  imageMultiplier: ref(1),
  textMultiplier: ref(1),
};

vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({
    costOf: (key: string, opts?: { size?: string | null }) => {
      const size = /^(\d+)x(\d+)$/.exec(opts?.size ?? "");
      const area = size ? (Number(size[1]) * Number(size[2])) / (1024 * 1024) : 1;
      return Math.ceil((costs[key] ?? 1) * area);
    },
  }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    ...providers,
    textCredits: (base: number) => Math.ceil(base * providers.textMultiplier.value),
    imageCredits: (base: number) => Math.ceil(base * providers.imageMultiplier.value),
  }),
}));

const { useMonsterQuote } = await import("./monsterQuote");

describe("useMonsterQuote", () => {
  beforeEach(() => {
    providers.imageProvider.value = "openai";
    providers.imageMultiplier.value = 1;
    providers.textMultiplier.value = 1;
  });

  it("prices a monster's stat block under monster_stat_block and its picture under entity_image", () => {
    const quoteFor = useMonsterQuote();
    expect(quoteFor({ image: false }).total).toBe(3);
    expect(quoteFor({ image: true }).total).toBe(3 + 75);
  });

  it("applies the campaign's text multiplier to the text part only", () => {
    providers.textMultiplier.value = 2;
    const quoteFor = useMonsterQuote();
    const quote = quoteFor({ image: true });
    expect(quote.lines.map((l) => l.credits)).toEqual([6, 75]);
  });
});
