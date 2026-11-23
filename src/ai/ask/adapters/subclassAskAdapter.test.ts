import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ gen: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offers: true, lookups: undefined as unknown }));

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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers }) }));
vi.mock("@/composables/rules/useGenerateCustomSubclass", () => ({
  useGenerateCustomSubclass: () => ({ generateAndCreateSubclass: mocks.gen }),
  useSubclassParents: () => ({
    levelByClass: { get value() { return new Map([["Fighter", 3], ["Wizard", 2]]); } },
    loading: { get value() { return state.lookups === "loading"; } },
  }),
}));

const { useSubclassAskAdapter } = await import("./subclassAskAdapter");
const { useSubclassQuote } = await import("@/composables/ai/quotes/subclassQuote");

const proposal = (inputs: Record<string, unknown> = { parent_class: "Fighter" }, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "subclass", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "u1", name: "Cinder Smith", error: null, ...over });

describe("useSubclassAskAdapter", () => {
  beforeEach(() => {
    mocks.gen.mockReset();
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
    mocks.gen.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows", () => {
    const adapter = useSubclassAskAdapter();
    const pageQuote = useSubclassQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote().total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useSubclassAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  it("a campaign without 5e rules is blocked, not run", async () => {
    state.offers = false;
    const adapter = useSubclassAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const result = await adapter.run(proposal());
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("passes the matched class with its subclass level, and nothing the model invented", async () => {
    await useSubclassAskAdapter().run(proposal({ parent_class: "fighter", system_prompt: "x" }));
    expect(mocks.gen).toHaveBeenCalledWith("A test concept", { parentClassName: "Fighter", subclassLevel: 3 });
  });

  it("a successful run names the record and opens it where the page does", async () => {
    const result = await useSubclassAskAdapter().run(proposal());
    expect(result).toMatchObject({ record: { type: "other" }, route: "/levelup/custom/u1" });
    expect(result.parts[0]).toMatchObject({ label: "Archetype text", ok: true });
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.gen.mockResolvedValueOnce({ id: null, name: null, error: "Provider down" });
    expect((await useSubclassAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.gen.mockRejectedValueOnce(new Error("save failed"));
    expect((await useSubclassAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.gen.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useSubclassAskAdapter().run(proposal())).parts[0].error).toContain("limit of archetypes");
  });

  it("blocks with the page's question when the parent class is absent or matches none, and never runs", async () => {
    const adapter = useSubclassAskAdapter();
    const absent = adapter.quote(proposal({}));
    expect(absent.block).toMatchObject({ reason: "missing", message: "Which class is it a subclass of?" });
    expect(adapter.quote(proposal({ parent_class: "Plumber" })).block?.message).toBe("Which class is it a subclass of?");
    mocks.gen.mockClear();
    const result = await adapter.run(proposal({ parent_class: "Plumber" }));
    expect(mocks.gen).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
  });

  it("waits for the classes instead of calling a class that has not arrived yet unknown", () => {
    state.lookups = "loading";
    try {
      expect(useSubclassAskAdapter().quote(proposal({ parent_class: "Fighter" })).block?.message).toBe("Still reading this campaign's classes.");
    } finally {
      state.lookups = undefined;
    }
  });
});
