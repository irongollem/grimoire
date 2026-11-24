import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, loading: false }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  // Landscape is one and a half times square, as the server prices it.
  useAiCredits: () => ({ costOf: (_key: string, opts?: { size?: string }) => (opts?.size === "1536x1024" ? 6 : 4), affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ imageCredits: (base: number) => base }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/ask/askSceneRender", () => ({
  useAskSceneRender: () => ({
    read: () => ({ entities: [{ label: "Aria", portraitUrl: "a.webp" }], loading: state.loading, line: null }),
    start: mocks.start,
  }),
}));

const { useSceneIllustrationAskAdapter } = await import("./sceneIllustrationAskAdapter");
const { provideNoteSurface } = await import("@/composables/notes/useNoteSurface");

const NOTE = "11111111-1111-4111-8111-111111111111";
const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({ proposalId: "p1", generator: "scene_illustration", concept: "Aria faces the dragon", inputs: {}, ...over });

let scope: EffectScope | null = null;
const insertScene = vi.fn();
function openNote(id: string | null = NOTE) {
  scope = effectScope();
  scope.run(() => provideNoteSurface({ noteId: () => id, title: () => "Session 4", sessionNum: () => null, insertChronicle: vi.fn(), insertScene }));
}

describe("useSceneIllustrationAskAdapter", () => {
  beforeEach(() => {
    mocks.start.mockReset().mockResolvedValue({ jobId: "j1" });
    insertScene.mockReset();
    Object.assign(state, { aiEnabled: true, affordable: true, loading: false });
    openNote();
  });
  afterEach(() => { scope?.stop(); scope = null; });

  // Bug caught: the shape not driving the price, so a landscape scene was quoted as a square one.
  it("prices the shape by its oblong: square, and landscape at one and a half times", () => {
    const adapter = useSceneIllustrationAskAdapter();
    expect(adapter.quote(proposal({ inputs: { shape: "square" } })).total).toBe(4);
    expect(adapter.quote(proposal({ inputs: { shape: "landscape" } })).total).toBe(6);
    expect(adapter.quote(proposal()).total).toBe(4);
  });

  it("blocks with AI off, a short balance, and an empty or overlong scene", async () => {
    const adapter = useSceneIllustrationAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({ concept: " " })).block?.message).toBe("Describe the scene first.");
    expect(adapter.quote(proposal({ concept: "x".repeat(501) })).block?.reason).toBe("missing");
    expect((await adapter.run(proposal({ concept: " " }))).record).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  // Bug caught: a picture queued for a note that is not open, whose anchor has nowhere to be dropped.
  it("blocks while no note is open, and for another note than the card's target", async () => {
    const adapter = useSceneIllustrationAskAdapter();
    expect(adapter.quote(proposal({ target: { type: "note", id: "22222222-2222-4222-8222-222222222222", name: "Session 3" } })).block?.message).toContain("is not the note that is open");
    scope?.stop();
    expect(adapter.quote(proposal()).block?.message).toContain("Open the note");
    expect((await adapter.run(proposal())).parts[0].ok).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("waits while the people and places a mention names are being read", () => {
    state.loading = true;
    expect(useSceneIllustrationAskAdapter().quote(proposal()).block?.message).toContain("Still reading");
  });

  // Bug caught: the render queued for the wrong size or note, or the anchor never dropped so the picture landed nowhere.
  it("queues the shape's oblong against the saved note and drops the anchor into the open note", async () => {
    const result = await useSceneIllustrationAskAdapter().run(proposal({ inputs: { shape: "landscape" } }));
    expect(mocks.start).toHaveBeenCalledWith({ concept: "Aria faces the dragon", entities: [{ label: "Aria", portraitUrl: "a.webp" }], size: "1536x1024", noteId: NOTE });
    expect(insertScene).toHaveBeenCalledWith({ jobId: "j1", prompt: "Aria faces the dragon", size: "1536x1024" });
    expect(result).toMatchObject({ record: { type: "note", id: NOTE }, route: null, parts: [{ ok: true, credits: 6 }] });
  });

  // Bug caught: a scene in a note not saved yet being refused, though the dialog queued for one (no note id, the editor resolves it).
  it("queues for a note that is not saved yet, with no note id", async () => {
    scope?.stop();
    openNote(null);
    await useSceneIllustrationAskAdapter().run(proposal());
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ noteId: null }));
    expect(insertScene).toHaveBeenCalledTimes(1);
  });

  // Bug caught: a declined likeness notice still dropping an anchor that nothing will ever fill.
  it("drops no anchor and charges nothing when the likeness notice is declined", async () => {
    mocks.start.mockResolvedValue(null);
    const result = await useSceneIllustrationAskAdapter().run(proposal());
    expect(result.parts[0]).toMatchObject({ ok: false, credits: 0 });
    expect(insertScene).not.toHaveBeenCalled();
  });

  it("says why when the render could not be queued, and drops no anchor", async () => {
    mocks.start.mockRejectedValue(new Error("The painter is away."));
    const result = await useSceneIllustrationAskAdapter().run(proposal());
    expect(result.parts[0]).toMatchObject({ ok: false, error: "The painter is away." });
    expect(insertScene).not.toHaveBeenCalled();
  });
});
