import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Prices by the table's own keys and area, so a quote that asks the wrong row or size gets the wrong number.
const costs: Record<string, number> = { deity_generation: 3, entity_image: 40 };
const state = { provider: ref<string | null>("openai") };
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
    imageProvider: state.provider,
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useDeityQuote } = await import("./deityQuote");

describe("useDeityQuote", () => {
  beforeEach(() => {
    state.provider.value = "openai";
  });

  it("prices the picture as entity_image at the 1024x1536 the deity purpose renders", () => {
    const quote = useDeityQuote()({ image: true });
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["Deity text", 3], ["Picture", 60]]);
  });

  it("says nothing about a picture nobody asked for", () => {
    const quote = useDeityQuote()({ image: false });
    expect(quote.lines.map((l) => l.label)).toEqual(["Deity text"]);
    expect(quote.total).toBe(3);
  });

  it("leaves the total unknown while the image provider is not known", () => {
    state.provider.value = null;
    expect(useDeityQuote()({ image: true }).total).toBeNull();
  });
});
