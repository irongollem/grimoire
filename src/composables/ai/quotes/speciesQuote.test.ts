import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Prices by the table's own keys and area, so a quote that asks the wrong row or size gets the wrong number.
const costs: Record<string, number> = { species_generation: 3, entity_image: 40 };
const state = { textByok: ref(false), imageByok: ref(false), provider: ref<string | null>("openai") };
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
    textIsByok: state.textByok, imageIsByok: state.imageByok, imageProvider: state.provider,
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useSpeciesQuote } = await import("./speciesQuote");

describe("useSpeciesQuote", () => {
  beforeEach(() => {
    state.textByok.value = false;
    state.imageByok.value = false;
    state.provider.value = "openai";
  });

  it("prices the picture as entity_image at the 1024x1024 the species purpose renders", () => {
    const quote = useSpeciesQuote()({ image: true });
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["Species text", 3], ["Picture", 40]]);
  });

  it("says nothing about a picture nobody asked for", () => {
    const quote = useSpeciesQuote()({ image: false });
    expect(quote.lines.map((l) => l.label)).toEqual(["Species text"]);
    expect(quote.total).toBe(3);
  });

  it("leaves the total unknown while the image provider is not known", () => {
    state.provider.value = null;
    expect(useSpeciesQuote()({ image: true }).total).toBeNull();
  });

  it("is on the DM's own key only when every part in play is", () => {
    state.textByok.value = true;
    expect(useSpeciesQuote()({ image: true }).byok).toBe(false);
    state.imageByok.value = true;
    expect(useSpeciesQuote()({ image: true }).byok).toBe(true);
  });
});
