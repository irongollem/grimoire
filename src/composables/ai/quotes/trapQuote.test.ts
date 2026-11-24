import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Prices by the table's own keys, so a quote that asks the wrong row gets the wrong number.
const costs: Record<string, number> = { trap_generation: 4, entity_image: 50 };
const providers = { imageProvider: ref<string | null>("openai") };

vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({
    costOf: (key: string, opts?: { size?: string | null }) => (costs[key] ?? 1) * (opts?.size === "1024x1536" ? 1.5 : 1),
  }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    ...providers,
    textCredits: (base: number) => Math.ceil(base),
    imageCredits: (base: number) => Math.ceil(base),
  }),
}));

const { useTrapQuote } = await import("./trapQuote");

describe("useTrapQuote", () => {
  beforeEach(() => {
    providers.imageProvider.value = "openai";
  });

  it("charges the picture, at the portrait size, only when asked for", () => {
    const quote = useTrapQuote();
    expect(quote({ image: false }).total).toBe(4);
    const withPicture = quote({ image: true });
    // entity_image at 1024x1536 is 75 here; the text row alone would give 4.
    expect(withPicture.lines.map((l) => l.credits)).toEqual([4, 75]);
    expect(withPicture.total).toBe(79);
  });

  it("stays unknown while the picture's provider is unknown, never a guessed price", () => {
    providers.imageProvider.value = null;
    expect(useTrapQuote()({ image: true }).total).toBeNull();
  });
});
