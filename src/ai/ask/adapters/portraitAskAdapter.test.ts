import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal, AskRecordType } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ paint: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, affordable: true, busy: false, paintingAny: false,
  subject: undefined as unknown, error: null as unknown,
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" }, activeCampaignId: "c1" }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.busy; } } }));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({
    paint: mocks.paint, cost: ref(10), error: ref("Provider down"),
    isPaintingAny: { get value() { return state.paintingAny; } },
  }),
}));
vi.mock("@/composables/ai/usePortraitSubject", () => ({
  usePortraitSubject: () => ({ data: { get value() { return state.subject; } }, error: { get value() { return state.error; } } }),
}));

const { usePortraitAskAdapter } = await import("./portraitAskAdapter");

const target = (type: AskRecordType, id = "t1", name = "Odo") => ({ type, id, name });
const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator: "portrait", concept: "Paint Odo", inputs: {}, target: target("npc"), ...over,
});
const subject = (over: Record<string, unknown> = {}) => ({ kind: "npc", id: "t1", name: "Odo", context: "Odo, a gnome", hasPicture: false, ...over });

describe("usePortraitAskAdapter", () => {
  beforeEach(() => {
    mocks.paint.mockReset().mockResolvedValue("https://img/odo.webp");
    Object.assign(state, { aiEnabled: true, affordable: true, busy: false, paintingAny: false, subject: subject(), error: null });
  });

  it("quotes what the paint flow shows, and says so when it replaces a picture", () => {
    const adapter = usePortraitAskAdapter();
    expect(adapter.quote(proposal()).total).toBe(10);
    expect(adapter.quote(proposal()).lines.find((l) => l.label === "Portrait")?.value).toBe("Painted by AI");
    state.subject = subject({ hasPicture: true });
    expect(adapter.quote(proposal()).lines.find((l) => l.label === "Portrait")?.value).toBe("Replaces the current portrait");
  });

  it("blocks without a target, for a kind that has no portrait, and while the record is unread or absent", () => {
    const adapter = usePortraitAskAdapter();
    expect(adapter.quote(proposal({ target: undefined })).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ target: target("quest") })).block?.reason).toBe("missing");
    state.subject = undefined;
    expect(adapter.quote(proposal()).block).toMatchObject({ reason: "missing", message: "Still reading that record." });
    state.error = new Error("x");
    expect(adapter.quote(proposal()).block?.message).toBe("That record could not be read.");
    state.subject = null;
    expect(adapter.quote(proposal()).block?.reason).toBe("missing");
    state.subject = subject({ context: "  " });
    expect(adapter.quote(proposal()).block?.reason).toBe("missing");
  });

  it("blocks on AI off and a short balance", () => {
    const adapter = usePortraitAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
  });

  it("paints from the record's own context, not the DM's sentence, and opens the record's page", async () => {
    state.subject = subject({ kind: "party", id: "t1", name: "Vesper" });
    const result = await usePortraitAskAdapter().run(proposal({ target: target("party_member", "t1", "Vesper") }));
    expect(mocks.paint).toHaveBeenCalledWith("t1", "Odo, a gnome");
    expect(result).toMatchObject({ record: { type: "party_member", id: "t1", name: "Vesper" }, route: "/party/t1" });
    expect(result.parts[0]).toMatchObject({ ok: true, credits: 10 });
  });

  it("an item opens in the vault", async () => {
    state.subject = subject({ kind: "item", id: "i1", name: "Ring" });
    expect((await usePortraitAskAdapter().run(proposal({ target: target("item", "i1", "Ring") }))).route).toBe("/vault/i1");
  });

  it("a failed paint is a failed part with a retry that paints again, never a throw", async () => {
    mocks.paint.mockResolvedValueOnce(null);
    const result = await usePortraitAskAdapter().run(proposal());
    expect(result.record).toBeNull();
    expect(result.parts[0]).toMatchObject({ ok: false, error: "Provider down", credits: 0 });
    expect((await result.parts[0].retry!.run()).ok).toBe(true);
    expect(mocks.paint).toHaveBeenCalledTimes(2);
  });

  it("does not paint while blocked or while another picture is being painted", async () => {
    state.subject = null;
    expect((await usePortraitAskAdapter().run(proposal())).record).toBeNull();
    state.subject = subject();
    state.paintingAny = true;
    expect((await usePortraitAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    expect(mocks.paint).not.toHaveBeenCalled();
  });
});
