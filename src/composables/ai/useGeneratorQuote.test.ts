import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Prices by the table's own keys, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { npc_text: 1, monster_stat_block: 3, entity_image: 50, portrait: 2 };
const providers = {
  textIsByok: ref(false),
  imageIsByok: ref(false),
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

const { useGeneratorQuote } = await import("./useGeneratorQuote");

describe("useGeneratorQuote", () => {
  beforeEach(() => {
    providers.textIsByok.value = false;
    providers.imageIsByok.value = false;
    providers.imageProvider.value = "openai";
    providers.imageMultiplier.value = 1;
    providers.textMultiplier.value = 1;
  });

  it("prices an NPC portrait under entity_image, the row the image job bills, not the stale portrait row", () => {
    const { quoteFor } = useGeneratorQuote();
    const quote = quoteFor("npc", { portrait: true, alterEgo: false });
    // 50 for entity_image at 1024x1536 is 75; the old `portrait` row would give 3.
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["NPC text", 1], ["Portrait", 75]]);
    expect(quote.total).toBe(76);
  });

  it("charges an alter ego as a second whole-credit portrait, rounded per picture before it is doubled", () => {
    providers.imageMultiplier.value = 0.4;
    costs.entity_image = 2; // 3 at 1024x1536; 3 * 0.4 rounds up to 2 each, so 4 for two (rounding the pair once gives 3)
    try {
      const { quoteFor } = useGeneratorQuote();
      const portrait = quoteFor("npc", { portrait: true, alterEgo: true }).lines.find((l) => l.label === "Portrait");
      expect(portrait?.credits).toBe(4);
    } finally {
      costs.entity_image = 50;
    }
  });

  it("says nothing about a portrait nobody asked for", () => {
    const { quoteFor } = useGeneratorQuote();
    const quote = quoteFor("npc", { portrait: false, alterEgo: true });
    expect(quote.lines.map((l) => l.label)).toEqual(["NPC text"]);
    expect(quote.total).toBe(1);
  });

  it("leaves the total unknown, not text-only, while the image provider is not known", () => {
    providers.imageProvider.value = null;
    const { quoteFor } = useGeneratorQuote();
    expect(quoteFor("npc", { portrait: true, alterEgo: false }).total).toBeNull();
  });

  it("charges nothing for a part on the DM's own key but still bills the part that is not", () => {
    providers.textIsByok.value = true;
    const { quoteFor } = useGeneratorQuote();
    const quote = quoteFor("npc", { portrait: true, alterEgo: false });
    expect(quote.total).toBe(75);
    expect(quote.byok).toBe(false);
  });

  it("is free of credits only when every part in play is on the DM's own key", () => {
    providers.textIsByok.value = true;
    providers.imageIsByok.value = true;
    const { quoteFor } = useGeneratorQuote();
    expect(quoteFor("npc", { portrait: true, alterEgo: false })).toMatchObject({ total: 0, byok: true });
    providers.imageIsByok.value = false;
    expect(quoteFor("npc", { portrait: false, alterEgo: false })).toMatchObject({ total: 0, byok: true });
  });

  it("prices a monster's stat block under monster_stat_block and its picture under entity_image", () => {
    const { quoteFor } = useGeneratorQuote();
    expect(quoteFor("monster", { image: false }).total).toBe(3);
    expect(quoteFor("monster", { image: true }).total).toBe(3 + 75);
  });

  it("applies the campaign's text multiplier to the text part only", () => {
    providers.textMultiplier.value = 2;
    const { quoteFor } = useGeneratorQuote();
    const quote = quoteFor("monster", { image: true });
    expect(quote.lines.map((l) => l.credits)).toEqual([6, 75]);
  });
});
