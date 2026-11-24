import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), saveDraft: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, busy: false }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaign: { name: "Sugarwell" },
    activeCampaignId: "c1",
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 2, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.busy; } } }));
vi.mock("@/ai/useScriptoriumDraft", () => ({ useScriptoriumDraft: () => ({ generate: mocks.generate, error: ref(null) }) }));
vi.mock("@/scriptorium/composables/useGenerateScriptoriumDraft", () => ({ useSaveScriptoriumDraft: () => ({ saveDraft: mocks.saveDraft }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([{ id: "n1", name: "Odo" }]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([{ id: "f1", name: "The Gilded Hand" }]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/notes/useNotes", () => ({ useNotes: () => ({ data: ref([{ id: "s1", title: "The ferry", session_id: "x" }, { id: "n9", title: "Loose note", session_id: null }]) }) }));

const { useScriptoriumDraftAskAdapter } = await import("./scriptoriumDraftAskAdapter");
const { useScriptoriumDraftQuote } = await import("@/composables/ai/quotes/scriptoriumDraftQuote");

const proposal = (inputs: Record<string, unknown> = { subject_type: "npc", subject_id: "n1" }, concept = "A hurried letter"): AskProposal => ({
  proposalId: "p1", generator: "scriptorium_draft", concept, inputs,
});
const draft = { title: "Letter", html: "<p>Hi</p>", ai_provenance: {} };

describe("useScriptoriumDraftAskAdapter", () => {
  beforeEach(() => {
    mocks.generate.mockReset().mockResolvedValue(draft);
    mocks.saveDraft.mockReset().mockResolvedValue({ id: "d1", title: "Letter" });
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, busy: false });
  });

  it("quotes the price the dialog shows", () => {
    expect(useScriptoriumDraftAdapterQuote()).toBe(useScriptoriumDraftQuote()().total);
  });

  it("blocks on AI off, quota, balance and local-key mode, each with its own reason", () => {
    const adapter = useScriptoriumDraftAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
  });

  it("blocks a draft that names no subject, or one this campaign does not have", () => {
    const adapter = useScriptoriumDraftAskAdapter();
    expect(adapter.quote(proposal({})).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ subject_type: "npc", subject_id: "someone-else" })).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ kind: "handout", subject_type: "session", subject_id: "s1" })).block?.reason).toBe("missing");
  });

  it("a loose note is not a session to recap", () => {
    expect(useScriptoriumDraftAskAdapter().quote(proposal({ kind: "session_recap", subject_id: "n9" })).block?.reason).toBe("missing");
  });

  it("a dossier is about a faction and for the DM unless said otherwise", async () => {
    const adapter = useScriptoriumDraftAskAdapter();
    await adapter.run(proposal({ kind: "faction_dossier", subject_id: "f1", subject_type: "npc" }));
    expect(mocks.generate).toHaveBeenCalledWith({ kind: "faction_dossier", subject: { type: "faction", id: "f1" }, audience: "dm", prompt: "A hurried letter" });
  });

  it("drops an unknown input and files the draft with the kind it was drafted as", async () => {
    const result = await useScriptoriumDraftAskAdapter().run(proposal({ subject_type: "npc", subject_id: "n1", system_prompt: "x" }));
    expect(mocks.generate.mock.calls[0][0]).toEqual({ kind: "handout", subject: { type: "npc", id: "n1" }, audience: "players", prompt: "A hurried letter" });
    expect(mocks.saveDraft).toHaveBeenCalledWith({ ...draft, kind: "handout" }, "c1");
    expect(result).toMatchObject({ record: { id: "d1", name: "Letter" }, route: "/scriptorium/d1" });
    expect(result.parts[0]).toMatchObject({ ok: true, credits: 2 });
  });

  it("does not run while blocked or while another generation is running", async () => {
    state.busy = true;
    expect((await useScriptoriumDraftAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("a failed generation or a thrown save becomes a failed part, and a lost paid draft says so", async () => {
    mocks.generate.mockResolvedValueOnce(null);
    expect((await useScriptoriumDraftAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, credits: 0 });
    mocks.saveDraft.mockRejectedValueOnce(new Error("save failed"));
    const result = await useScriptoriumDraftAskAdapter().run(proposal());
    expect(result.record).toBeNull();
    expect(result.parts[0]).toMatchObject({ ok: false, credits: 2 });
    expect(result.parts[0].error).toContain("save failed");
  });
});

function useScriptoriumDraftAdapterQuote(): number | null {
  return useScriptoriumDraftAskAdapter().quote(proposal()).total;
}
