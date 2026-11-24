import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, busy: false, multiplier: 1.5 }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaign: { name: "Sugarwell" },
    activeCampaignId: "c1",
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 3, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ audioMultiplierFor: () => state.multiplier }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.busy; } } }));
const music = vi.hoisted(() => ({ error: { value: null as string | null }, completedEntityId: { value: null as string | null } }));
vi.mock("@/ai/useMusicGeneration", () => ({
  useMusicGeneration: () => ({ generate: mocks.generate, error: music.error, completedEntityId: music.completedEntityId }),
}));

const { useMusicTrackAskAdapter } = await import("./musicTrackAskAdapter");
const { useMusicTrackQuote } = await import("@/composables/ai/quotes/musicTrackQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "Rain on a tavern roof"): AskProposal => ({
  proposalId: "p1", generator: "music_track", concept, inputs,
});

describe("useMusicTrackAskAdapter", () => {
  beforeEach(() => {
    mocks.generate.mockReset().mockResolvedValue(true);
    music.error.value = null;
    music.completedEntityId.value = "s9";
    Object.assign(state, { aiEnabled: true, affordable: true, busy: false, multiplier: 1.5 });
  });

  it("quotes the Generate tab's price: the row times the audio multiplier, rounded up", () => {
    const adapter = useMusicTrackAskAdapter();
    expect(adapter.quote(proposal()).total).toBe(useMusicTrackQuote()().total);
    expect(adapter.quote(proposal()).total).toBe(5);
  });

  it("blocks on AI off, a short balance, and an empty description", () => {
    const adapter = useMusicTrackAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  it("composes without touching the Add Sound dialog's half-typed draft", async () => {
    await useMusicTrackAskAdapter().run(proposal());
    expect(mocks.generate.mock.calls[0][0].keepDraft).toBe(true);
  });

  it("sends only the lengths the server takes, singing only when asked, and drops unknown keys", async () => {
    await useMusicTrackAskAdapter().run(proposal({ length_seconds: 100, vocals: true, category: "effects", lyrics: "x" }));
    const input = mocks.generate.mock.calls[0][0];
    expect(input.request).toMatchObject({ lengthSeconds: 120, vocals: "vocals", imageCount: 0 });
    expect(input.category).toBe("ambient");
    expect(input.request.lyrics).toBeUndefined();
    await useMusicTrackAskAdapter().run(proposal());
    expect(mocks.generate.mock.calls[1][0].request).toMatchObject({ lengthSeconds: 60, vocals: "instrumental" });
  });

  it("waits for the track and opens the soundboard", async () => {
    const result = await useMusicTrackAskAdapter().run(proposal());
    expect(result).toMatchObject({ route: "/soundboard", record: { id: "s9" } });
    expect(result.parts[0]).toMatchObject({ ok: true, credits: 5 });
  });

  it("a failed job or another generation running is a failed part, not a throw", async () => {
    mocks.generate.mockResolvedValueOnce(false);
    music.error.value = "Lyria refused the prompt";
    expect((await useMusicTrackAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Lyria refused the prompt" });
    state.busy = true;
    mocks.generate.mockClear();
    expect((await useMusicTrackAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
