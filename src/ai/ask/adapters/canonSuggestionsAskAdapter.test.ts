import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const calls = vi.hoisted(() => ({ made: [] as { mode: string; scope: string | undefined }[], suggest: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, affordable: true, error: "" as string, count: 3, generating: false,
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 3, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textIsByok: ref(false), imageIsByok: ref(false), imageProvider: ref("openai"), textCredits: (b: number) => b, imageCredits: (b: number) => b }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.generating; } } }));
vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: (mode: string, scope?: string) => {
    calls.made.push({ mode, scope });
    return {
      suggest: (...args: unknown[]) => calls.suggest(mode, ...args),
      suggestions: { get value() { return Array.from({ length: state.count }); } },
      error: { get value() { return state.error || null; } },
    };
  },
}));

const { useCanonSuggestionsAskAdapter, canonModeFor, loreTitleFrom } = await import("./canonSuggestionsAskAdapter");
const { useCanonSuggestionsQuote } = await import("@/composables/ai/quotes/canonSuggestionsQuote");

const proposal = (concept: string, inputs: Record<string, unknown> = {}): AskProposal => ({
  proposalId: "p1", generator: "canon_suggestions", concept, inputs,
});

describe("useCanonSuggestionsAskAdapter", () => {
  beforeEach(() => {
    calls.made.length = 0;
    calls.suggest.mockReset().mockResolvedValue(true);
    Object.assign(state, { aiEnabled: true, affordable: true, error: "", count: 3, generating: false });
  });

  // Bug caught: the rule picking the helper drifted from what the quote prices, so a lore draft was quoted as truths.
  it("runs the lore helper only when the DM asked for lore, and truths otherwise", () => {
    expect(canonModeFor("Some lore about the drowned king")).toBe("lore");
    expect(canonModeFor("Gold-lore")).toBe("lore");
    expect(canonModeFor("Something the guild keeps quiet")).toBe("truths");
    expect(canonModeFor("the folklore of the valley")).toBe("truths");
  });

  it("titles a lore draft with the first line of the request, cut short", () => {
    expect(loreTitleFrom("The drowned king\nand his court")).toBe("The drowned king");
    expect(loreTitleFrom("x".repeat(200))).toHaveLength(80);
  });

  it("quotes the price of the mode it will run, the one the Canon page's helper shows", () => {
    const adapter = useCanonSuggestionsAskAdapter();
    const quoteFor = useCanonSuggestionsQuote();
    expect(adapter.quote(proposal("something about the river")).total).toBe(quoteFor("truths").total);
    expect(adapter.quote(proposal("write some lore about the river")).total).toBe(quoteFor("lore").total);
  });

  it("blocks on AI off, a short balance, and an empty or over-long description", () => {
    const adapter = useCanonSuggestionsAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal("a truth")).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal("a truth")).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal("  ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal("x".repeat(5000))).block?.reason).toBe("missing");
  });

  // Bug caught: the suggestions were stored under a key the Canon page does not read, so "Review" showed nothing.
  it("stores truths under the Truths part's own key and lore under the Lore part's new-entry key", () => {
    useCanonSuggestionsAskAdapter();
    expect(calls.made).toEqual([{ mode: "truths", scope: undefined }, { mode: "lore", scope: "new" }]);
  });

  it("runs truths with the request as the steer, and ends at the part with the suggestions waiting", async () => {
    const result = await useCanonSuggestionsAskAdapter().run(proposal("something about the river", { mode: "clues", system_prompt: "x" }));
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("truths", "something about the river");
    expect(result).toMatchObject({ record: null, route: "/canon?section=truths" });
    expect(result.parts).toEqual([{ label: "Three truth suggestions are ready.", ok: true, credits: 3 }]);
  });

  it("runs lore with a title, and ends at the Lore part", async () => {
    const result = await useCanonSuggestionsAskAdapter().run(proposal("lore of the drowned king"));
    expect(calls.suggest).toHaveBeenCalledExactlyOnceWith("lore", "lore of the drowned king", { title: "lore of the drowned king" });
    expect(result.route).toBe("/canon?section=lore");
  });

  it("returns a failed part, never throws, and has no route when it fails or everything was set aside", async () => {
    calls.suggest.mockResolvedValueOnce(false);
    state.error = "Needs the server";
    const failed = await useCanonSuggestionsAskAdapter().run(proposal("a truth"));
    expect(failed).toMatchObject({ route: null, parts: [{ ok: false, error: "Needs the server" }] });
    state.error = "";
    calls.suggest.mockRejectedValueOnce(new Error("boom"));
    expect((await useCanonSuggestionsAskAdapter().run(proposal("a truth"))).parts[0]).toMatchObject({ ok: false, error: "boom" });
    state.count = 0;
    expect((await useCanonSuggestionsAskAdapter().run(proposal("a truth"))).parts[0]).toMatchObject({ ok: false });
  });

  it("does not run when blocked or while another generation runs", async () => {
    state.generating = true;
    expect((await useCanonSuggestionsAskAdapter().run(proposal("a truth"))).parts[0]!.ok).toBe(false);
    state.generating = false;
    state.aiEnabled = false;
    await useCanonSuggestionsAskAdapter().run(proposal("a truth"));
    expect(calls.suggest).not.toHaveBeenCalled();
  });
});
