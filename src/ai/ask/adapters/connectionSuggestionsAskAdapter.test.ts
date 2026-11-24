import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const calls = vi.hoisted(() => ({ suggest: vi.fn(), subject: undefined as { kind: string; id: string } | undefined }));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, error: "" as string, count: 4, generating: false }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageProvider: ref("openai"), textCredits: (b: number) => b, imageCredits: (b: number) => b }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.generating; } } }));
vi.mock("@/ai/useConnectionSuggestions", () => ({
  useConnectionSuggestions: () => ({
    suggest: (subject: { kind: string; id: string }, steer: string) => calls.suggest(subject, steer),
    forSubject: (subject: () => { kind: string; id: string }) => {
      calls.subject = subject();
      return {
        suggestions: { get value() { return Array.from({ length: state.count }); } },
        error: { get value() { return state.error || null; } },
      };
    },
  }),
}));

const { default: useConnectionSuggestionsAskAdapter } = await import("./connectionSuggestionsAskAdapter");
const { useConnectionSuggestionsQuote } = await import("@/composables/ai/quotes/connectionSuggestionsQuote");

const npc = { type: "npc" as const, id: "n1", name: "Mara" };
const proposal = (over: Partial<AskProposal> = {}): AskProposal => ({
  proposalId: "p1", generator: "connection_suggestions", concept: "someone with a grudge", inputs: {}, target: npc, ...over,
});

describe("useConnectionSuggestionsAskAdapter", () => {
  beforeEach(() => {
    calls.suggest.mockReset().mockResolvedValue(true);
    calls.subject = undefined;
    Object.assign(state, { aiEnabled: true, affordable: true, error: "", count: 4, generating: false });
  });

  // Bug caught: Ask and the Connections block quoted different prices for the same run.
  it("quotes the price the Connections block shows", () => {
    expect(useConnectionSuggestionsAskAdapter().quote(proposal()).total).toBe(useConnectionSuggestionsQuote()().total);
  });

  // Bug caught: suggestions were asked for a record that is not an NPC (the model named a quest), and stored where no sheet reads them.
  it("blocks without an NPC target, with AI off, on a short balance and on an over-long steer", () => {
    const adapter = useConnectionSuggestionsAskAdapter();
    expect(adapter.quote(proposal({ target: undefined })).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ target: { type: "quest", id: "q1", name: "Q" } })).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({ concept: "x".repeat(5000) })).block?.reason).toBe("missing");
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
  });

  it("allows an empty steer: the page's steer is optional", () => {
    expect(useConnectionSuggestionsAskAdapter().quote(proposal({ concept: "" })).block).toBeNull();
  });

  it("asks for the target NPC with the request as the steer, and ends on that NPC's sheet with the suggestions waiting", async () => {
    const result = await useConnectionSuggestionsAskAdapter().run(proposal());
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith({ kind: "npc", id: "n1" }, "someone with a grudge");
    expect(calls.subject).toEqual({ kind: "npc", id: "n1" });
    expect(result).toMatchObject({ record: null, route: "/npcs/n1" });
    expect(result.parts).toEqual([{ label: "Four connections are ready.", ok: true, credits: 1 }]);
  });

  it("returns a failed part, never throws, when the run fails, throws or is wholly set aside", async () => {
    calls.suggest.mockResolvedValueOnce(false);
    state.error = "Needs the server";
    expect(await useConnectionSuggestionsAskAdapter().run(proposal())).toMatchObject({ route: null, parts: [{ ok: false, error: "Needs the server" }] });
    state.error = "";
    calls.suggest.mockRejectedValueOnce(new Error("boom"));
    expect((await useConnectionSuggestionsAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "boom" });
    state.count = 0;
    expect((await useConnectionSuggestionsAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false });
  });

  it("does not run when blocked or while another generation runs", async () => {
    state.generating = true;
    expect((await useConnectionSuggestionsAskAdapter().run(proposal())).parts[0]!.ok).toBe(false);
    state.generating = false;
    await useConnectionSuggestionsAskAdapter().run(proposal({ target: undefined }));
    expect(calls.suggest).not.toHaveBeenCalled();
  });
});
