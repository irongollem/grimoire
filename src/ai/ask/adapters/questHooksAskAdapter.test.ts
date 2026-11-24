import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), clearCompleted: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, canCreate: true, affordable: true, error: "" as string,
  party: undefined as { level: number }[] | undefined,
  npcs: undefined as { id: string; name: string; occupation: string | null; relationship: string | null }[] | undefined,
  places: undefined as { id: string; name: string }[] | undefined,
  ui: { questGeneratorOpen: false, questGeneratorPrefill: null as { giverNpcId: string; locationId: string } | null },
}));
const generating = vi.hoisted(() => ({ value: false }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/stores/ui/quests", () => ({ useQuestsUiStore: () => state.ui }));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 2, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageProvider: ref("openai"), textCredits: (b: number) => b, imageCredits: (b: number) => b }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: { get value() { return state.party; } } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { get value() { return state.npcs; } } }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: { get value() { return state.places; } } }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return generating.value; } } }));
vi.mock("@/ai/useQuestGeneration", () => ({
  useQuestGeneration: () => ({
    generate: mocks.generate, clearCompleted: mocks.clearCompleted, concept: ref(""),
    error: { get value() { return state.error; } },
  }),
}));

const { useQuestHooksAskAdapter } = await import("./questHooksAskAdapter");
const { useQuestHooksQuote } = await import("@/composables/ai/quotes/questHooksQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A cult under the mill"): AskProposal => ({
  proposalId: "p1", generator: "quest_hooks", concept, inputs,
});
const hooks = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Hook ${i}` }));

describe("useQuestHooksAskAdapter", () => {
  beforeEach(() => {
    mocks.generate.mockReset().mockResolvedValue(hooks(5));
    mocks.clearCompleted.mockReset();
    Object.assign(state, {
      aiEnabled: true, canCreate: true, affordable: true, error: "",
      party: [{ level: 3 }, { level: 4 }],
      npcs: [{ id: "n1", name: "Mara", occupation: "Smith", relationship: "ally" }],
      places: [{ id: "l1", name: "Thornkeep" }],
      ui: { questGeneratorOpen: false, questGeneratorPrefill: null },
    });
    generating.value = false;
  });

  // Bug caught: Ask and the Quest Generator panel quoted different prices for the same five hooks.
  it("quotes the price the Quest Generator panel shows", () => {
    expect(useQuestHooksAskAdapter().quote(proposal()).total).toBe(useQuestHooksQuote()().total);
  });

  it("blocks on AI off, quota and a short balance, and does not run", async () => {
    const adapter = useQuestHooksAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    const result = await adapter.run(proposal());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.parts[0]).toMatchObject({ ok: false });
  });

  it("blocks an empty description, one past the theme's limit, and the lists still loading", () => {
    const adapter = useQuestHooksAskAdapter();
    expect(adapter.quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({}, "x".repeat(5000))).block?.reason).toBe("missing");
    state.npcs = undefined;
    expect(adapter.quote(proposal({ quest_giver_id: "n1" })).block?.message).toMatch(/Still reading/);
  });

  // Bug caught: an id the model made up reached the request as a giver, or a stray input key was passed on.
  it("understands only a giver and place this campaign has, and sends the panel's own request", async () => {
    await useQuestHooksAskAdapter().run(proposal({ quest_giver_id: "n1", location_id: "nope", system_prompt: "x" }));
    const prompt = mocks.generate.mock.calls[0]![0] as string;
    expect(prompt).toContain("Party level: 4");
    expect(prompt).toContain("Quest Giver: Mara (Smith, ally)");
    expect(prompt).not.toContain("Location");
    expect(prompt).not.toContain("system_prompt");
    expect(prompt).toContain("Theme: A cult under the mill");
  });

  // Bug caught: "Review suggestions" opened the generator showing nothing, or built a pick without the giver Ask fixed.
  it("ends in the panel: the route is the quest list and opening it hands over the giver and place", async () => {
    const result = await useQuestHooksAskAdapter().run(proposal({ quest_giver_id: "n1", location_id: "l1" }));
    expect(result).toMatchObject({ record: null, route: "/quests" });
    expect(result.parts).toEqual([{ label: "Five quest hooks are ready.", ok: true, credits: 2 }]);
    expect(state.ui.questGeneratorOpen).toBe(false);
    result.open!();
    expect(state.ui.questGeneratorOpen).toBe(true);
    expect(state.ui.questGeneratorPrefill).toEqual({ giverNpcId: "n1", locationId: "l1" });
  });

  it("returns a failed part instead of throwing when generation fails or throws, and never opens the panel", async () => {
    mocks.generate.mockResolvedValueOnce(null);
    state.error = "Provider down";
    const failed = await useQuestHooksAskAdapter().run(proposal());
    expect(failed.parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    expect(failed.open).toBeUndefined();
    mocks.generate.mockRejectedValueOnce(new Error("boom"));
    expect((await useQuestHooksAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "boom" });
  });

  // Bug caught: a second generation started while another one was running (they share one generating state).
  it("does not start while another generation is running", async () => {
    generating.value = true;
    const result = await useQuestHooksAskAdapter().run(proposal());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(result.parts[0]!.ok).toBe(false);
  });
});
