import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ fillBeat: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, busy: false, source: undefined as unknown, sourceError: null as unknown }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" }, activeCampaignId: "c1" }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 2, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.busy; } } }));
vi.mock("@/composables/quests/useFillQuestBeat", () => ({ useFillQuestBeat: () => ({ fillBeat: mocks.fillBeat, error: ref("Provider down") }) }));
vi.mock("@/composables/quests/useQuestBeatFillSource", () => ({
  useQuestBeatFillSource: () => ({ source: { get value() { return state.source; } }, error: { get value() { return state.sourceError; } } }),
}));

const { useQuestBeatAskAdapter } = await import("./questBeatAskAdapter");
const { useQuestBeatQuote } = await import("@/composables/ai/quotes/questBeatQuote");

const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator: "quest_beat", concept: "A tense negotiation", inputs: {},
  target: { type: "quest_beat", id: "b1", name: "The gate" }, ...over,
} as AskProposal);
const found = (beat: Record<string, unknown> = {}) => ({
  beat: { id: "b1", quest_id: "q1", title: "The gate", read_aloud: null, dm_content: null, ...beat },
  quest: { id: "q1", title: "Siege" },
  context: { quest: { title: "Siege", summary: null } },
});

describe("useQuestBeatAskAdapter", () => {
  beforeEach(() => {
    mocks.fillBeat.mockReset().mockResolvedValue({ id: "b1", quest_id: "q1", title: "Filled" });
    Object.assign(state, { aiEnabled: true, affordable: true, busy: false, source: found(), sourceError: null });
  });

  it("quotes the fill bar's price", () => {
    expect(useQuestBeatAskAdapter().quote(proposal()).total).toBe(useQuestBeatQuote()().total);
  });

  it("says it replaces text when the beat already has some, and does not when it is empty", () => {
    const adapter = useQuestBeatAskAdapter();
    expect(adapter.quote(proposal()).lines.find((l) => l.label === "Writes")?.value).toBe("Read-aloud and DM lead");
    state.source = found({ read_aloud: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] }) });
    expect(adapter.quote(proposal()).lines.find((l) => l.label === "Writes")?.value).toBe("Replaces the existing text");
  });

  it("blocks without a beat target, while reading, on an unreadable or foreign beat, AI off and a short balance", () => {
    const adapter = useQuestBeatAskAdapter();
    expect(adapter.quote(proposal({ target: undefined })).block?.message).toBe("Say which beat to write first.");
    expect(adapter.quote(proposal({ target: { type: "quest", id: "q1", name: "Siege" } })).block?.message).toBe("Say which beat to write first.");
    state.source = undefined;
    expect(adapter.quote(proposal()).block?.message).toBe("Still reading the quest.");
    state.sourceError = new Error("x");
    expect(adapter.quote(proposal()).block?.message).toBe("That beat could not be read.");
    state.source = null;
    expect(adapter.quote(proposal()).block?.reason).toBe("missing");
    state.source = found();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
  });

  it("fills with the DM's words as the steer and opens the beat in its quest", async () => {
    state.source = found({ dm_content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "lead" }] }] }) });
    const result = await useQuestBeatAskAdapter().run(proposal());
    expect(mocks.fillBeat.mock.calls[0][0]).toMatchObject({ steer: "A tense negotiation", overwrite: true });
    expect(result).toMatchObject({ record: { type: "quest_beat", id: "b1", name: "Filled" }, route: "/quests/q1?beat=b1&open=1" });
    expect(result.parts[0]).toMatchObject({ ok: true, credits: 2 });
  });

  it("an empty beat is filled without overwriting", async () => {
    await useQuestBeatAskAdapter().run(proposal());
    expect(mocks.fillBeat.mock.calls[0][0].overwrite).toBe(false);
  });

  it("a failed generation or a thrown save is a failed part, and a lost paid fill says it cost", async () => {
    mocks.fillBeat.mockResolvedValueOnce(null);
    expect((await useQuestBeatAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, credits: 0, error: "Provider down" });
    mocks.fillBeat.mockRejectedValueOnce(new Error("This beat changed in another window."));
    const result = await useQuestBeatAskAdapter().run(proposal());
    expect(result.record).toBeNull();
    expect(result.parts[0]).toMatchObject({ ok: false, credits: 2, error: "This beat changed in another window." });
  });

  it("does not run while blocked or while another generation is running", async () => {
    state.busy = true;
    expect((await useQuestBeatAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    state.busy = false;
    state.source = null;
    expect((await useQuestBeatAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    state.source = found();
    state.affordable = false;
    expect((await useQuestBeatAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: expect.stringContaining("balance") });
    expect(mocks.fillBeat).not.toHaveBeenCalled();
  });
});
