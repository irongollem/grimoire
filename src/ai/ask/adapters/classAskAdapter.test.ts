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
vi.mock("@/composables/rules/useGenerateCustomClass", () => ({
  useGenerateCustomClass: () => ({ generateClassDraft: mocks.draft, createClassFromDraft: mocks.create }),
}));

const { useClassAskAdapter } = await import("./classAskAdapter");
const { useClassQuote } = await import("@/composables/ai/quotes/classQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A test concept"): AskProposal => ({
  proposalId: "p1", generator: "class", concept, inputs,
});
const drafted = (over: Record<string, unknown> = {}) => ({
  draft: {
    base: { class_name: "Emberwarden", hit_die: 10, saving_throws: ["Strength", "Wisdom"], subclass_level: 3 },
    features: [{ level: 1, insert: { name: "Cinder" } }, { level: 4, existingId: "asi" }, { level: 6, insert: { name: "Blaze" } }],
    progression: "half", problems: [], warnings: [],
    ...over,
  },
  error: null,
});

async function previewed(adapter: AskPreviewAdapter, p: AskProposal) {
  const outcome: AskPreviewOutcome = await adapter.preview(p);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useClassAskAdapter", () => {
  beforeEach(() => {
    mocks.draft.mockReset().mockResolvedValue(drafted());
    mocks.create.mockReset().mockResolvedValue({ id: "k1" });
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offers: true });
  });

  it("quotes the same price the page shows", () => {
    const adapter = useClassAskAdapter();
    const pageQuote = useClassQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote().total);
  });

  it("blocks once per gate: AI off, short balance, and an empty description", () => {
    const adapter = useClassAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  // Bug caught: a campaign whose system has no 5e rules still charged for a class.
  it("a campaign without 5e rules is blocked, not generated", async () => {
    state.offers = false;
    const adapter = useClassAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    const outcome = await adapter.preview(proposal());
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
  });

  // Bug caught: the spellcasting chip never reached the generator (the panel passed it, the old run did not).
  it("passes the hit die and the spellcasting the card chose, and drops what its lists do not offer", async () => {
    await useClassAskAdapter().preview(proposal({ hit_die: "10", caster_progression: "pact", system_prompt: "x" }));
    expect(mocks.draft).toHaveBeenCalledWith("A test concept", { hitDie: 10, casterProgression: "pact" });
    await useClassAskAdapter().preview(proposal({ hit_die: "7", caster_progression: "arcane" }));
    expect(mocks.draft).toHaveBeenLastCalledWith("A test concept", { hitDie: undefined, casterProgression: undefined });
  });

  it("names the die and the spellcasting in the quote", () => {
    const lines = useClassAskAdapter().quote(proposal({ hit_die: "8", caster_progression: "full" })).lines;
    expect(lines.find((l) => l.label === "Hit die")?.value).toBe("d8");
    expect(lines.find((l) => l.label === "Spellcasting")?.value).toBe("Full caster");
  });

  // Bug caught: generating writing the class, so Discard still left one behind.
  it("holds the class until the DM creates it, and Create saves what was shown", async () => {
    const preview = await previewed(useClassAskAdapter(), proposal());
    expect(mocks.create).not.toHaveBeenCalled();
    const made = await preview.create();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(made).toMatchObject({ record: { type: "other", id: "k1", name: "Emberwarden" }, route: "/levelup/classes/k1" });
  });

  it("shows what this will create: the die, saves, subclass level, spellcasting and the abilities by band", async () => {
    const { shown } = await previewed(useClassAskAdapter(), proposal());
    expect(shown.title).toBe("Emberwarden");
    expect(shown.badge).toBe("d10 hit die");
    expect(shown.sections[0].rows).toEqual([
      { label: "Saving throws", detail: "Strength and Wisdom" },
      { label: "Subclass", detail: "at level 3" },
      { label: "Spellcasting", detail: "Half caster" },
    ]);
    // The heading counts what will be made (the shared Ability Score Improvement is pointed at, not made); the bands, as the panel's did, count every ability the class grants.
    expect(shown.sections[1]).toEqual({ heading: "2 abilities", rows: [{ label: "Levels 1-4", detail: "2" }, { label: "Levels 5-10", detail: "1" }] });
  });

  it("reports the generation's price as its part, and create adds no charge", async () => {
    const preview = await previewed(useClassAskAdapter(), proposal());
    expect(preview.parts[0]).toMatchObject({ label: "Class text", ok: true, credits: 1 });
    expect((await preview.create()).parts.reduce((sum, p) => sum + p.credits, 0)).toBe(1);
  });

  it("ends with a failed part, and no preview, when generation fails or throws", async () => {
    mocks.draft.mockResolvedValueOnce({ draft: null, error: "Provider down" });
    expect(await useClassAskAdapter().preview(proposal())).toMatchObject({ ok: false, result: { parts: [{ ok: false, error: "Provider down" }] } });
    mocks.draft.mockRejectedValueOnce(new Error("offline"));
    expect(await useClassAskAdapter().preview(proposal())).toMatchObject({ ok: false, result: { parts: [{ ok: false, error: "offline" }] } });
  });

  // Bug caught: a save that lost the quota race threw instead of leaving the preview to retry.
  it("a save that fails says why and records nothing, instead of throwing", async () => {
    const preview = await previewed(useClassAskAdapter(), proposal());
    mocks.create.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await preview.create()).parts[0].error).toContain("limit of classes");
    mocks.create.mockRejectedValueOnce(new Error("save failed"));
    expect(await preview.create()).toMatchObject({ record: null, parts: [{ ok: false, error: "save failed" }] });
  });

  it("says what the class left out without stopping it, in the preview and in the result", async () => {
    mocks.draft.mockResolvedValue(drafted({ warnings: ["Ability Score Improvement was not added."] }));
    const preview = await previewed(useClassAskAdapter(), proposal());
    expect(preview.shown.note).toBe("Ability Score Improvement was not added.");
    const made = await preview.create();
    expect(made.record?.id).toBe("k1");
    expect(made.parts.map((p) => [p.label, p.ok])).toEqual([["Class text", true], ["Note", false]]);
  });
});
