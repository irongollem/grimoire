import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateMonster: vi.fn(), paint: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaign: { name: "Sugarwell" },
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textIsByok: ref(false), imageIsByok: ref(false), imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({ paint: mocks.paint, cost: ref(10), error: ref(null) }),
}));
vi.mock("@/composables/monsters/useGenerateMonster", () => ({
  useGenerateMonster: () => ({ generateAndCreateMonster: mocks.generateAndCreateMonster }),
}));

const { useMonsterAskAdapter } = await import("./monsterAskAdapter");
const { useMonsterQuote } = await import("@/composables/ai/quotes/monsterQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A moss-backed bear"): AskProposal => ({
  proposalId: "p1", generator: "monster", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "m1", name: "Mossbear", error: null, picture: "none", ...over });

describe("useMonsterAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateMonster.mockReset();
    mocks.paint.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
    mocks.generateAndCreateMonster.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useMonsterAskAdapter();
    const quoteFor = useMonsterQuote();
    expect(adapter.quote(proposal()).total).toBe(quoteFor({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(quoteFor({ image: true }).total);
  });

  it("a monster on a campaign without stat blocks is blocked, not run", async () => {
    state.offersStatBlocks = false;
    const adapter = useMonsterAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const result = await adapter.run(proposal());
    expect(mocks.generateAndCreateMonster).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("blocks on quota and on a short balance", () => {
    state.canCreate = false;
    expect(useMonsterAskAdapter().quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(useMonsterAskAdapter().quote(proposal()).block?.reason).toBe("credits");
  });

  it("passes only understood constraints and always says explicitly whether to paint", async () => {
    await useMonsterAskAdapter().run(proposal({ challenge_rating: "1/2", monster_type: "dragonkin", size: "huge", system_prompt: "x" }));
    expect(mocks.generateAndCreateMonster).toHaveBeenCalledWith("A moss-backed bear", {
      challenge_rating: "1/2",
      monster_type: undefined,
      size: "huge",
      generateImage: false,
    });
  });

  it("drops a challenge rating that is not a number or a fraction", async () => {
    await useMonsterAskAdapter().run(proposal({ challenge_rating: "very high", monster_type: "beast" }));
    expect(mocks.generateAndCreateMonster.mock.calls[0][1]).toMatchObject({ challenge_rating: undefined, monster_type: "beast" });
  });

  it("a failed picture leaves the monster saved and offers only the picture again", async () => {
    mocks.generateAndCreateMonster.mockResolvedValue(saved({ picture: "failed" }));
    mocks.paint.mockResolvedValue("https://img/m.webp");
    const result = await useMonsterAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { type: "monster", id: "m1", name: "Mossbear" }, route: "/monsters/m1" });
    expect(result.parts[0]).toMatchObject({ label: "Stat block", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect((await result.parts[1].retry!.run()).ok).toBe(true);
    expect(mocks.paint.mock.calls[0][0]).toBe("m1");
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreateMonster.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none" });
    expect((await useMonsterAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateMonster.mockRejectedValueOnce(new Error("save failed"));
    expect((await useMonsterAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  // Bug caught: a painted monster was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.generateAndCreateMonster.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/monster.webp" }));
    expect((await useMonsterAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/monster.webp");
    mocks.generateAndCreateMonster.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useMonsterAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });
});
