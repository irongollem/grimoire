import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ textByok: false, imageByok: false, provider: "openai" as string | null }));

// Tall pictures cost 2, square ones 1: a quote that prices a picture at the wrong size is wrong by a credit.
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string, opts?: { size?: string }) => (key === "entity_image" && opts?.size === "1024x1536" ? 2 : 1) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textIsByok: { get value() { return state.textByok; } },
    imageIsByok: { get value() { return state.imageByok; } },
    imageProvider: { get value() { return state.provider; } },
    textCredits: (base: number) => base,
    imageCredits: (base: number) => base,
  }),
}));

const { useItemQuote } = await import("./itemQuote");

describe("useItemQuote", () => {
  beforeEach(() => Object.assign(state, { textByok: false, imageByok: false, provider: "openai" }));

  it("prices the text alone when no picture is asked for", () => {
    const quote = useItemQuote()({ image: false });
    expect(quote.lines.map((l) => l.label)).toEqual(["Item"]);
    expect(quote.total).toBe(1);
  });

  it("adds the picture at the size the server bills it (tall)", () => {
    const quote = useItemQuote()({ image: true });
    expect(quote.lines.map((l) => l.label)).toEqual(["Item", "Picture"]);
    expect(quote.total).toBe(1 + 2);
  });

  it("is free on the DM's own key only when every part in play is", () => {
    state.textByok = true;
    expect(useItemQuote()({ image: false })).toMatchObject({ total: 0, byok: true });
    expect(useItemQuote()({ image: true })).toMatchObject({ total: 2, byok: false });
    state.imageByok = true;
    expect(useItemQuote()({ image: true })).toMatchObject({ total: 0, byok: true });
  });

  it("has no total while the picture's provider is not known", () => {
    state.provider = null;
    expect(useItemQuote()({ image: true }).total).toBeNull();
    expect(useItemQuote()({ image: false }).total).toBe(1);
  });
});
