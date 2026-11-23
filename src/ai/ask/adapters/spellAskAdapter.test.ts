import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateSpell: vi.fn(), paint: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, offers5e: true }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
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
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers5e }) }));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({ paint: mocks.paint, cost: ref(10), error: ref(null) }),
}));
vi.mock("@/composables/spells/useGenerateSpell", () => ({
  useGenerateSpell: () => ({ generateAndCreateSpell: mocks.generateAndCreateSpell }),
}));

const { useSpellAskAdapter } = await import("./spellAskAdapter");
const { useSpellQuote } = await import("@/composables/ai/quotes/spellQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "Luminous moths that bite and dazzle"): AskProposal => ({
  proposalId: "p1", generator: "spell", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "s1", name: "Moth Storm", error: null, picture: "none", ...over });

describe("useSpellAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateSpell.mockReset().mockResolvedValue(saved());
    mocks.paint.mockReset();
    Object.assign(state, { aiEnabled: true, affordable: true, offers5e: true });
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useSpellAskAdapter();
    const price = useSpellQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true }).total);
  });

  it("shows a cantrip as a cantrip, not as level 0", () => {
    expect(useSpellAskAdapter().quote(proposal({ level: 0 })).lines[0]).toMatchObject({ label: "Level", value: "Cantrip" });
  });

  it("blocks once per gate: AI off, no 5e rules, a short balance, and a missing description", () => {
    state.aiEnabled = false;
    expect(useSpellAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.offers5e = false;
    expect(useSpellAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.offers5e = true;
    state.affordable = false;
    expect(useSpellAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(useSpellAskAdapter().quote(proposal({}, "")).block?.reason).toBe("missing");
  });

  it("a blocked run spends nothing: the workflow is never called", async () => {
    state.affordable = false;
    await useSpellAskAdapter().run(proposal());
    expect(mocks.generateAndCreateSpell).not.toHaveBeenCalled();
  });

  it("keeps a cantrip's level 0, drops a level out of range and a school the app has not got, and never forwards an unknown key", async () => {
    await useSpellAskAdapter().run(proposal({ level: 0, school: "Evocation", system_prompt: "x" }));
    expect(mocks.generateAndCreateSpell.mock.calls[0][1]).toEqual({ level: 0, school: "evocation", generateImage: false });
    await useSpellAskAdapter().run(proposal({ level: 12, school: "pyromancy" }));
    expect(mocks.generateAndCreateSpell.mock.calls[1][1]).toEqual({ level: undefined, school: undefined, generateImage: false });
  });

  it("a failed picture leaves the spell saved and offers only the picture again", async () => {
    mocks.generateAndCreateSpell.mockResolvedValue(saved({ picture: "failed" }));
    mocks.paint.mockResolvedValue("https://img/s.webp");
    const result = await useSpellAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { type: "spell", id: "s1", name: "Moth Storm" }, route: "/spells/s1" });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect((await result.parts[1].retry!.run()).ok).toBe(true);
    expect(mocks.paint.mock.calls[0][0]).toBe("s1");
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreateSpell.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none" });
    expect((await useSpellAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateSpell.mockRejectedValueOnce(new Error("save failed"));
    expect((await useSpellAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  // Bug caught: a painted spell was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.generateAndCreateSpell.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/spell.webp" }));
    expect((await useSpellAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/spell.webp");
    mocks.generateAndCreateSpell.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useSpellAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });
});
