import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import { describeShapes } from "@/scriptorium/lib/describeShapes";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, activeCampaignId: "camp-1" as string | null }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, get activeCampaignId() { return state.activeCampaignId; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: (_key: string, opts?: { size?: string }) => (opts?.size === "1024x1024" ? 4 : 6), affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ imageCredits: (base: number) => base }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/ask/askSceneRender", () => ({
  useAskSceneRender: () => ({ read: () => ({ entities: [], loading: false, line: null }), start: mocks.start }),
}));

const { usePictureDescriptionAskAdapter } = await import("./pictureDescriptionAskAdapter");
const { provideDescribeSurface } = await import("@/scriptorium/composables/useDescribeSurface");

const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({ proposalId: "p1", generator: "picture_description", concept: "A ruined keep", inputs: {}, ...over });

let scope: EffectScope | null = null;
const started = vi.fn();
const panel = { target: true, campaign: "camp-1" as string | null };
function openPanel() {
  scope = effectScope();
  scope.run(() => provideDescribeSurface({ campaignId: () => panel.campaign, shapes: () => describeShapes(1 / 1.414), hasTarget: () => panel.target, start: started }));
}

describe("usePictureDescriptionAskAdapter", () => {
  beforeEach(() => {
    mocks.start.mockReset().mockResolvedValue({ jobId: "j1" });
    started.mockReset();
    Object.assign(state, { aiEnabled: true, affordable: true, activeCampaignId: "camp-1" });
    Object.assign(panel, { target: true, campaign: "camp-1" });
    openPanel();
  });
  afterEach(() => { scope?.stop(); scope = null; });

  // Bug caught: a book shape priced as a square, though the model paints the nearest of three oblongs.
  it("prices a shape by the oblong it is painted at: a banner at the landscape, a tall picture at the portrait", () => {
    const adapter = usePictureDescriptionAskAdapter();
    expect(adapter.quote(proposal({ inputs: { shape: "square" } })).total).toBe(4);
    expect(adapter.quote(proposal({ inputs: { shape: "banner" } })).total).toBe(6);
    expect(adapter.quote(proposal({ inputs: { shape: "banner" } })).lines.find((l) => l.label === "Shape")?.value).toBe("Wide banner");
  });

  // Bug caught: a card opened with no picture chosen, painting into nothing.
  it("blocks until a picture is chosen in the book, and with no book open", async () => {
    panel.target = false;
    const adapter = usePictureDescriptionAskAdapter();
    expect(adapter.quote(proposal()).block?.message).toContain("Select a picture");
    expect((await adapter.run(proposal())).parts[0].ok).toBe(false);
    scope?.stop();
    expect(adapter.quote(proposal()).block?.message).toContain("Select a picture");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  // Bug caught: painting in the active campaign for a book that belongs to another, which the panel hides the button for.
  it("blocks for a book of another campaign", () => {
    panel.campaign = "camp-2";
    expect(usePictureDescriptionAskAdapter().quote(proposal()).block?.message).toContain("another campaign");
  });

  it("blocks with AI off, a short balance, and an empty or overlong scene", () => {
    const adapter = usePictureDescriptionAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({ concept: " " })).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ concept: "x".repeat(501) })).block?.reason).toBe("missing");
  });

  // Bug caught: the picture marked as painting with the wrong shape, so it was cut to the wrong proportions when it landed.
  it("queues the painted oblong with no note and marks the picture with the chosen shape's id", async () => {
    const result = await usePictureDescriptionAskAdapter().run(proposal({ inputs: { shape: "banner" } }));
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ concept: "A ruined keep", size: "1536x1024", noteId: null }));
    expect(started).toHaveBeenCalledWith({ jobId: "j1", shape: "banner" });
    expect(result).toMatchObject({ route: null, parts: [{ ok: true, credits: 6 }] });
  });

  it("marks no picture when the likeness notice is declined or the queueing fails", async () => {
    mocks.start.mockResolvedValueOnce(null);
    expect((await usePictureDescriptionAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    mocks.start.mockRejectedValueOnce(new Error("away"));
    expect((await usePictureDescriptionAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "away" });
    expect(started).not.toHaveBeenCalled();
  });
});
