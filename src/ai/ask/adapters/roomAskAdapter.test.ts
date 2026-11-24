import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ fillRoom: vi.fn() }));
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
vi.mock("@/composables/locations/useFillRoom", () => ({ useFillRoom: () => ({ fillRoom: mocks.fillRoom, error: ref("Provider down") }) }));
vi.mock("@/composables/locations/useRoomFillSource", () => ({
  useRoomFillSource: () => ({ source: { get value() { return state.source; } }, error: { get value() { return state.sourceError; } } }),
}));

const { useRoomAskAdapter } = await import("./roomAskAdapter");
const { useRoomQuote } = await import("@/composables/ai/quotes/roomQuote");

const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator: "room", concept: "A flooded shrine", inputs: {},
  target: { type: "room", id: "r1", name: "Shrine" }, ...over,
} as AskProposal);
const found = (room: Record<string, unknown> = {}) => ({
  room: { id: "r1", name: "Shrine", description: null, ...room },
  site: { id: "s1", name: "The Drowned Keep" },
  constraints: ["Room: Shrine"],
});

describe("useRoomAskAdapter", () => {
  beforeEach(() => {
    mocks.fillRoom.mockReset().mockResolvedValue({ id: "r1", name: "Shrine" });
    Object.assign(state, { aiEnabled: true, affordable: true, busy: false, source: found(), sourceError: null });
  });

  it("quotes the room list's price", () => {
    expect(useRoomAskAdapter().quote(proposal()).total).toBe(useRoomQuote()().total);
  });

  it("says it replaces a description the room already has", () => {
    const adapter = useRoomAskAdapter();
    expect(adapter.quote(proposal()).lines.find((l) => l.label === "Writes")?.value).toBe("Read-aloud and what is here");
    state.source = found({ description: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Damp." }] }] }) });
    expect(adapter.quote(proposal()).lines.find((l) => l.label === "Writes")?.value).toBe("Replaces the description");
  });

  it("blocks without a room target, while reading, on an unreadable or non-room place, AI off and a short balance", () => {
    const adapter = useRoomAskAdapter();
    expect(adapter.quote(proposal({ target: undefined })).block?.message).toBe("Say which room to describe first.");
    expect(adapter.quote(proposal({ target: { type: "location", id: "r1", name: "x" } })).block?.message).toBe("Say which room to describe first.");
    state.source = undefined;
    expect(adapter.quote(proposal()).block?.message).toBe("Still reading the site.");
    state.sourceError = new Error("x");
    expect(adapter.quote(proposal()).block?.message).toBe("That room could not be read.");
    state.source = null;
    expect(adapter.quote(proposal()).block?.reason).toBe("missing");
    state.source = found();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
  });

  it("rolls from the site's grounding with the DM's words as the steer and opens the room", async () => {
    const result = await useRoomAskAdapter().run(proposal());
    expect(mocks.fillRoom.mock.calls[0][0]).toMatchObject({ constraints: ["Room: Shrine"], steer: "A flooded shrine" });
    expect(result).toMatchObject({ record: { type: "room", id: "r1", name: "Shrine" }, route: "/locations?at=r1" });
    expect(result.parts[0]).toMatchObject({ ok: true, credits: 2 });
  });

  it("a failed roll or a thrown save is a failed part, and a lost paid fill says it cost", async () => {
    mocks.fillRoom.mockResolvedValueOnce(null);
    expect((await useRoomAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, credits: 0, error: "Provider down" });
    mocks.fillRoom.mockRejectedValueOnce(new Error("save failed"));
    const result = await useRoomAskAdapter().run(proposal());
    expect(result.record).toBeNull();
    expect(result.parts[0]).toMatchObject({ ok: false, credits: 2, error: "save failed" });
  });

  it("does not run while another generation is running or the room is not one", async () => {
    state.busy = true;
    expect((await useRoomAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    state.busy = false;
    state.source = null;
    expect((await useRoomAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    state.source = found();
    state.affordable = false;
    expect((await useRoomAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: expect.stringContaining("balance") });
    expect(mocks.fillRoom).not.toHaveBeenCalled();
  });
});
