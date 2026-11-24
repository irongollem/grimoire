import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

// A record input is a uuid or it is dropped (`readAskInputs`), so the ids are real-shaped.
const { ODO, HAND, FERRY, LOOSE, ELSEWHERE } = vi.hoisted(() => ({
  ODO: "00000000-0000-4000-8000-0000000000a1", HAND: "00000000-0000-4000-8000-0000000000b1", FERRY: "00000000-0000-4000-8000-0000000000c1",
  LOOSE: "00000000-0000-4000-8000-0000000000c9", ELSEWHERE: "00000000-0000-4000-8000-0000000000ff",
}));
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
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([{ id: ODO, name: "Odo" }]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([{ id: HAND, name: "The Gilded Hand" }]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
// The session picker's own module is tested where the card meets it; here it is the Chronicle entries a recap can be about.
vi.mock("@/ai/ask/askSessionNotes", () => ({
  useChronicleSessionOptions: () => ({ options: ref([{ id: FERRY, name: "Session 4: The ferry" }]), loading: ref(false) }),
}));

const { useScriptoriumDraftAskAdapter } = await import("./scriptoriumDraftAskAdapter");
const { useScriptoriumDraftQuote } = await import("@/composables/ai/quotes/scriptoriumDraftQuote");

const proposal = (inputs: Record<string, unknown> = { subject_type: "npc", npc_id: ODO }, concept = "A hurried letter"): AskProposal => ({
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
    expect(adapter.quote(proposal({ subject_type: "npc", npc_id: ELSEWHERE })).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ kind: "session_recap", session_id: LOOSE })).block?.reason).toBe("missing");
  });

  // Bug caught: the card's pickers are one id per kind, and the adapter read a `subject_id` nothing sets, so every draft from the card was "missing".
  it("reads the id of the picker that fits what the draft is about, and ignores the others", async () => {
    const adapter = useScriptoriumDraftAskAdapter();
    await adapter.run(proposal({ kind: "session_recap", session_id: FERRY, npc_id: ODO }));
    expect(mocks.generate).toHaveBeenLastCalledWith({ kind: "session_recap", subject: { type: "session", id: FERRY }, audience: "players", prompt: "A hurried letter" });
    await adapter.run(proposal({ kind: "handout", subject_type: "faction", faction_id: HAND, npc_id: ODO }));
    expect(mocks.generate).toHaveBeenLastCalledWith({ kind: "handout", subject: { type: "faction", id: HAND }, audience: "players", prompt: "A hurried letter" });
    // A handout is never about a session, whatever the model says.
    expect(adapter.quote(proposal({ kind: "handout", subject_type: "session", session_id: FERRY })).block?.reason).toBe("missing");
  });

  it("a dossier is about a faction and for the DM unless said otherwise", async () => {
    const adapter = useScriptoriumDraftAskAdapter();
    await adapter.run(proposal({ kind: "faction_dossier", faction_id: HAND, subject_type: "npc" }));
    expect(mocks.generate).toHaveBeenCalledWith({ kind: "faction_dossier", subject: { type: "faction", id: HAND }, audience: "dm", prompt: "A hurried letter" });
  });

  // Bug caught: the steer is optional on the card; an empty one blocked the gilt button as the other generators' required description does.
  it("runs without a steer", () => {
    expect(useScriptoriumDraftAskAdapter().quote(proposal(undefined, "")).block).toBeNull();
  });

  it("drops an unknown input and files the draft with the kind it was drafted as", async () => {
    const result = await useScriptoriumDraftAskAdapter().run(proposal({ subject_type: "npc", npc_id: ODO, system_prompt: "x" }));
    expect(mocks.generate.mock.calls[0][0]).toEqual({ kind: "handout", subject: { type: "npc", id: ODO }, audience: "players", prompt: "A hurried letter" });
    expect(mocks.saveDraft).toHaveBeenCalledWith({ ...draft, kind: "handout" }, "c1");
    expect(result).toMatchObject({ record: { id: "d1", name: "Letter" }, route: "/scriptorium/d1" });
    expect(result.parts[0]).toMatchObject({ ok: true, credits: 2 });
  });

  it("does not run while blocked or while another generation is running", async () => {
    state.busy = true;
    expect((await useScriptoriumDraftAskAdapter().run(proposal())).parts[0].ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("a failed generation is a failed part that was not charged", async () => {
    mocks.generate.mockResolvedValueOnce(null);
    expect((await useScriptoriumDraftAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, credits: 0 });
  });

  // Bug caught: a paid draft whose save failed was lost (the dialog's "Save again" went with the dialog), so the DM paid twice to get it back.
  it("keeps a paid draft whose save failed and saves that same draft again for free, in the campaign it was written for", async () => {
    mocks.saveDraft.mockRejectedValueOnce(new Error("save failed"));
    const result = await useScriptoriumDraftAskAdapter().run(proposal());
    expect(result.record).toBeNull();
    const part = result.parts[0];
    expect(part).toMatchObject({ ok: false, credits: 2, retry: { credits: 0 } });
    expect(part.error).toContain("save failed");

    const retried = await part.retry!.run();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.saveDraft).toHaveBeenLastCalledWith({ ...draft, kind: "handout" }, "c1");
    expect(retried).toMatchObject({ ok: true, credits: 0 });

    mocks.saveDraft.mockRejectedValueOnce(new Error("still down"));
    const again = await part.retry!.run();
    expect(again).toMatchObject({ ok: false, retry: { credits: 0 } });
    expect(again.error).toContain("still down");
  });
});

function useScriptoriumDraftAdapterQuote(): number | null {
  return useScriptoriumDraftAskAdapter().quote(proposal()).total;
}
