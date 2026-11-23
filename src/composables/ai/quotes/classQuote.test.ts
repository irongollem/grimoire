import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Every row priced differently, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { custom_class_generation: 7 };
const byok = ref(false);
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string) => costs[key] ?? 1 }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textIsByok: byok, imageIsByok: ref(false), imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useClassQuote } = await import("./classQuote");

describe("useClassQuote", () => {
  beforeEach(() => { byok.value = false; });

  it("prices the text under custom_class_generation, the row the server charges", () => {
    const quote = useClassQuote()();
    expect(quote.lines.map((l) => [l.label, l.credits])).toEqual([["Class text", 7]]);
    expect(quote.total).toBe(7);
  });

  it("costs nothing on the DM's own key", () => {
    byok.value = true;
    const quote = useClassQuote()();
    expect(quote.total).toBe(0);
    expect(quote.byok).toBe(true);
  });
});
