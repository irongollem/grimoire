import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome } from "@/lib/ask/askAdapter";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), create: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offers: true, lookups: undefined as unknown }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaign: { name: "Sugarwell" },
  }),
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
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers }) }));
vi.mock("@/composables/rules/useGenerateCustomSubclass", () => ({
  useGenerateCustomSubclass: () => ({ generateSubclassDraft: mocks.draft, createSubclassFromDraft: mocks.create }),
  useSubclassParents: () => ({
    levelByClass: { get value() { return new Map([["Fighter", 3], ["Wizard", 2]]); } },
    loading: { get value() { return state.lookups === "loading"; } },
  }),
}));

const { useSubclassAskAdapter } = await import("./subclassAskAdapter");
const { useSubclassQuote } = await import("@/composables/ai/quotes/subclassQuote");

const proposal = (inputs: Record<string, unknown> = { parent_class: "Fighter" }, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "subclass", concept, inputs,
});
const drafted = (over: Record<string, unknown> = {}) => ({
  draft: {
    base: { class_name: "Fighter", subclass_name: "Cinder Smith" },
    features: [{ level: 3, insert: { name: "Forge" } }, { level: 3, insert: { name: "Spark" } }, { level: 7, insert: { name: "Blaze" } }],
    problems: [],
    ...over,
  },
  error: null,
});

async function previewed(adapter: AskPreviewAdapter, p: AskProposal) {
  const outcome: AskPreviewOutcome = await adapter.preview(p);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useSubclassAskAdapter", () => {
  beforeEach(() => {
    mocks.draft.mockReset().mockResolvedValue(drafted());
    mocks.create.mockReset().mockResolvedValue({ id: "u1" });
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
  });

  it("quotes the same price the page shows", () => {
    const adapter = useSubclassAskAdapter();
    const pageQuote = useSubclassQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote().total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useSubclassAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  it("a campaign without 5e rules is blocked, not generated", async () => {
    state.offers = false;
    const adapter = useSubclassAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    expect((await adapter.preview(proposal())).ok).toBe(false);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  // Bug caught: the subclass level taken from the wrong class (or none), so abilities arrived at levels the class never grants.
  it("passes the matched class with its subclass level, and nothing the model invented", async () => {
    await useSubclassAskAdapter().preview(proposal({ parent_class: "fighter", system_prompt: "x" }));
    expect(mocks.draft).toHaveBeenCalledWith("A test concept", { parentClassName: "Fighter", subclassLevel: 3 });
  });

  // Bug caught: generating writing the archetype, so Discard still left one behind.
  it("holds the archetype until the DM creates it, and Create saves what was shown", async () => {
    const preview = await previewed(useSubclassAskAdapter(), proposal());
    expect(mocks.create).not.toHaveBeenCalled();
    const made = await preview.create();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(made).toMatchObject({ record: { type: "other", id: "u1", name: "Cinder Smith" }, route: "/levelup/custom/u1" });
    expect(made.parts[0]).toMatchObject({ label: "Archetype text", ok: true, credits: 1 });
  });

  it("shows whose archetype it is and how many abilities arrive at which levels", async () => {
    const { shown } = await previewed(useSubclassAskAdapter(), proposal());
    expect(shown.title).toBe("Cinder Smith");
    expect(shown.badge).toBe("A Fighter archetype");
    expect(shown.sections).toEqual([{ heading: "3 abilities", rows: [{ label: "Level 3", detail: "2" }, { label: "Level 7", detail: "1" }] }]);
  });

  it("ends with a failed part, and no preview, when generation fails or throws", async () => {
    mocks.draft.mockResolvedValueOnce({ draft: null, error: "Provider down" });
    expect(await useSubclassAskAdapter().preview(proposal())).toMatchObject({ ok: false, result: { parts: [{ ok: false, error: "Provider down" }] } });
    mocks.draft.mockRejectedValueOnce(new Error("offline"));
    expect(await useSubclassAskAdapter().preview(proposal())).toMatchObject({ ok: false, result: { parts: [{ ok: false, error: "offline" }] } });
  });

  // Bug caught: a save that lost the quota race threw instead of leaving the preview to retry.
  it("a save that fails says why and records nothing, instead of throwing", async () => {
    const preview = await previewed(useSubclassAskAdapter(), proposal());
    mocks.create.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await preview.create()).parts[0].error).toContain("limit of archetypes");
    mocks.create.mockRejectedValueOnce(new Error("save failed"));
    expect(await preview.create()).toMatchObject({ record: null, parts: [{ ok: false, error: "save failed" }] });
  });

  it("blocks with the page's question when the parent class is absent or matches none, and never generates", async () => {
    const adapter = useSubclassAskAdapter();
    expect(adapter.quote(proposal({})).block).toMatchObject({ reason: "missing", message: "Which class is it a subclass of?" });
    expect(adapter.quote(proposal({ parent_class: "Plumber" })).block?.message).toBe("Which class is it a subclass of?");
    const outcome = await adapter.preview(proposal({ parent_class: "Plumber" }));
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
  });

  it("waits for the classes instead of calling a class that has not arrived yet unknown", () => {
    state.lookups = "loading";
    try {
      expect(useSubclassAskAdapter().quote(proposal({ parent_class: "Fighter" })).block?.message).toBe("Still reading this campaign's classes.");
    } finally {
      state.lookups = undefined;
    }
  });
});
