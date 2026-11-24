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

// The people and places a description names: what the card's @ resolves to (read by `parseSceneEntities`, tested there).
const scene = vi.hoisted(() => ({ entities: [] as { label: string; portraitUrl: string | null; textDescription: string | null }[], loading: false, text: { value: "" } }));
vi.mock("@/ai/ask/askSceneMentions", () => ({
  useAskSceneMentions: () => ({
    text: scene.text,
    entities: { get value() { return scene.entities; } },
    loading: { get value() { return scene.loading; } },
    mentionItems: { value: [] },
  }),
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
    scene.entities = [];
    scene.loading = false;
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

  // Bug caught: the Generate tab's price and request left the card half-read; each choice of the card reaches the server's body.
  it("sends what the card holds: name, section, one of the three lengths, vocals, and lyrics only when it sings", async () => {
    await useMusicTrackAskAdapter().run(proposal({ name: "Weir at dusk", category: "music", length_seconds: "180", vocals: "vocals", lyrics: "[Verse 1]\nRise" }));
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({
      soundName: "Weir at dusk",
      category: "music",
      request: { description: "Rain on a tavern roof", lengthSeconds: 180, vocals: "vocals", lyrics: "[Verse 1]\nRise", imageCount: 0 },
      imageUrls: [],
    });
    await useMusicTrackAskAdapter().run(proposal({ vocals: "choir", lyrics: "x", category: "bagpipes", length_seconds: "100" }));
    const input = mocks.generate.mock.calls[1][0];
    expect(input.request).toMatchObject({ lengthSeconds: 60, vocals: "choir" });
    expect(input.request.lyrics).toBeUndefined();
    expect(input.category).toBe("ambient");
    expect(input.soundName).toBe("Rain on a tavern roof");
  });

  // Bug caught: the three-word vocals became the old yes or no, so a choir was sent as instrumental.
  it("reads the three-word vocals and treats an old yes or no as instrumental", async () => {
    await useMusicTrackAskAdapter().run(proposal({ vocals: true }));
    expect(mocks.generate.mock.calls[0][0].request.vocals).toBe("instrumental");
    expect(useMusicTrackAskAdapter().quote(proposal({ vocals: "choir" })).lines.find((l) => l.label === "Vocals")?.value).toBe("A wordless choir");
  });

  // Bug caught: a mention reached Lyria as its @-token, and its picture and lore never did.
  it("hands the mentioned people's pictures and lore to the job and the description without its tokens", async () => {
    scene.entities = [
      { label: "Vesper", portraitUrl: "https://cdn/v.png", textDescription: "Vesper: a pale ranger" },
      { label: "The weir", portraitUrl: null, textDescription: "The weir" },
    ];
    await useMusicTrackAskAdapter().run(proposal({}, "the grove at night, @Vesper waiting"));
    const input = mocks.generate.mock.calls[0][0];
    expect(input.imageUrls).toEqual(["https://cdn/v.png"]);
    expect(input.request).toMatchObject({
      description: "the grove at night, Vesper waiting",
      imageCount: 1,
      mentions: [{ label: "Vesper", description: "Vesper: a pale ranger" }, { label: "The weir", description: "The weir" }],
    });
    expect(useMusicTrackAskAdapter().quote(proposal({}, "@Vesper")).lines.find((l) => l.label === "Lyria will read")?.value).toBe("1 picture: Vesper");
  });

  it("blocks over ten pictures, over-long lyrics, and while the names are still being read", () => {
    const adapter = useMusicTrackAskAdapter();
    scene.entities = Array.from({ length: 11 }, (_, i) => ({ label: `P${i}`, portraitUrl: `https://cdn/${i}.png`, textDescription: null }));
    expect(adapter.quote(proposal({}, "@P0")).block?.reason).toBe("missing");
    scene.entities = [];
    expect(adapter.quote(proposal({ vocals: "vocals", lyrics: "la ".repeat(1000) })).block?.reason).toBe("missing");
    scene.loading = true;
    expect(adapter.quote(proposal({}, "@Vesper")).block?.reason).toBe("missing");
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
