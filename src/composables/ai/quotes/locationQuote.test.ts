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

const { useLocationQuote } = await import("./locationQuote");

describe("useLocationQuote", () => {
  beforeEach(() => Object.assign(state, { textByok: false, imageByok: false, provider: "openai" }));

  it("prices the text alone when no picture is asked for", () => {
    const quote = useLocationQuote()({ image: false });
    expect(quote.lines.map((l) => l.label)).toEqual(["Place"]);
    expect(quote.total).toBe(1);
  });

  it("adds the picture at the size the server bills it (square)", () => {
    const quote = useLocationQuote()({ image: true });
    expect(quote.lines.map((l) => l.label)).toEqual(["Place", "Picture"]);
    expect(quote.total).toBe(1 + 1);
  });

  it("is free on the DM's own key only when every part in play is", () => {
    state.textByok = true;
    expect(useLocationQuote()({ image: false })).toMatchObject({ total: 0, byok: true });
    expect(useLocationQuote()({ image: true })).toMatchObject({ total: 1, byok: false });
    state.imageByok = true;
    expect(useLocationQuote()({ image: true })).toMatchObject({ total: 0, byok: true });
  });

  it("has no total while the picture's provider is not known", () => {
    state.provider = null;
    expect(useLocationQuote()({ image: true }).total).toBeNull();
    expect(useLocationQuote()({ image: false }).total).toBe(1);
  });

  it("charges the map sketch as its own picture, and a map alone still needs the picture provider", () => {
    expect(useLocationQuote()({ image: true, map: true }).total).toBe(3);
    expect(useLocationQuote()({ image: false, map: true }).lines.map((l) => l.label)).toEqual(["Place", "Map sketch"]);
    state.textByok = true;
    expect(useLocationQuote()({ image: false, map: true })).toMatchObject({ total: 1, byok: false });
  });
});
