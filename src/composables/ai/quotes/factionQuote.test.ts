import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ provider: "openai" as string | null }));

// Tall pictures cost 2, square ones 1: a quote that prices a picture at the wrong size is wrong by a credit.
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (key: string, opts?: { size?: string }) => (key === "entity_image" && opts?.size === "1024x1536" ? 2 : 1) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: { get value() { return state.provider; } },
    textCredits: (base: number) => base,
    imageCredits: (base: number) => base,
  }),
}));

const { useFactionQuote } = await import("./factionQuote");

describe("useFactionQuote", () => {
  beforeEach(() => Object.assign(state, { provider: "openai" }));

  it("prices the text alone when no picture is asked for", () => {
    const quote = useFactionQuote()({ image: false });
    expect(quote.lines.map((l) => l.label)).toEqual(["Faction"]);
    expect(quote.total).toBe(1);
  });

  it("adds the picture at the size the server bills it (square)", () => {
    const quote = useFactionQuote()({ image: true });
    expect(quote.lines.map((l) => l.label)).toEqual(["Faction", "Emblem"]);
    expect(quote.total).toBe(1 + 1);
  });

  it("has no total while the picture's provider is not known", () => {
    state.provider = null;
    expect(useFactionQuote()({ image: true }).total).toBeNull();
    expect(useFactionQuote()({ image: false }).total).toBe(1);
  });
});
