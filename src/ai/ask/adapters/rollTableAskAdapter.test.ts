import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), save: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
vi.mock("@/composables/dungeon-features/useGenerateRollTable", () => ({
  useGenerateRollTable: () => ({ generateRollTableDraft: mocks.draft, saveGeneratedRollTable: mocks.save }),
  ROLL_TABLE_GENERATOR_DICE: ["1d6", "1d8", "1d10", "1d12", "1d20"],
}));

const { useRollTableAskAdapter } = await import("./rollTableAskAdapter");
const { useRollTableQuote } = await import("@/composables/ai/quotes/rollTableQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "Things in the smuggler's cellar"): AskProposal => ({
  proposalId: "p1", generator: "roll_table", concept, inputs,
});
const table = {
  name: "Cellar Finds", description: "Roll when they search the cellar", tags: [],
  entries: [{ min: 1, max: 4, label: "Rats", notes: null }, { min: 5, max: 5, label: "A key", notes: "Rusted" }],
};

async function previewed(p: AskProposal) {
  const outcome = await useRollTableAskAdapter().preview(p);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useRollTableAskAdapter", () => {
  beforeEach(() => {
    mocks.draft.mockReset().mockResolvedValue({ draft: table, error: null });
    mocks.save.mockReset().mockResolvedValue({ id: "r1" });
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
  });

  it("quotes the same price the page shows", () => {
    expect(useRollTableAskAdapter().quote(proposal()).total).toBe(useRollTableQuote()().total);
  });

  it("blocks with AI off, on a short balance, and on an empty or overlong concept, and generates nothing", async () => {
    const adapter = useRollTableAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({}, "x".repeat(501))).block?.reason).toBe("missing");
    expect((await adapter.preview(proposal({}, "   "))).ok).toBe(false);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  // Bug caught: the die chips sent "1d12" but the adapter still read an integer, so every pick fell back to the d8.
  it("generates for the die picked, and for the page's d8 when the die is not one it offers", async () => {
    await previewed(proposal({ die: "1d12", tone: "grim" }));
    expect(mocks.draft).toHaveBeenLastCalledWith("Things in the smuggler's cellar", { die: "1d12" });
    await previewed(proposal({ die: "1d7" }));
    expect(mocks.draft).toHaveBeenLastCalledWith("Things in the smuggler's cellar", { die: "1d8" });
    await previewed(proposal());
    expect(mocks.draft).toHaveBeenLastCalledWith("Things in the smuggler's cellar", { die: "1d8" });
  });

  // Bug caught: the table saved at the generation, so the DM never saw its rows before keeping it.
  it("saves nothing until create is called, then saves the table on the die it was generated for", async () => {
    const preview = await previewed(proposal({ die: "1d6" }));
    expect(mocks.save).not.toHaveBeenCalled();
    const made = await preview.create();
    expect(mocks.save).toHaveBeenCalledWith(table, "1d6");
    expect(made).toMatchObject({ record: { id: "r1", name: "Cellar Finds" }, route: "/roll-tables/r1" });
    expect(made.parts.reduce((sum, p) => sum + p.credits, 0)).toBe(1);
  });

  it("shows the rows with the numbers they cover, and the notes beside them", async () => {
    const { shown } = await previewed(proposal({ die: "1d6" }));
    expect(shown).toMatchObject({ title: "Cellar Finds", badge: "1d6" });
    expect(shown.sections.at(-1)?.rows).toEqual([{ label: "1–4", detail: "Rats" }, { label: "5", detail: "A key (Rusted)" }]);
  });

  it("ends with a failed part, and no preview, when the generator gave nothing or threw", async () => {
    mocks.draft.mockResolvedValueOnce({ draft: null, error: "Provider down" });
    const failed = await useRollTableAskAdapter().preview(proposal());
    expect(failed.ok === false && failed.result.parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.draft.mockRejectedValueOnce(new Error("network"));
    const thrown = await useRollTableAskAdapter().preview(proposal());
    expect(thrown.ok === false && thrown.result.parts[0]).toMatchObject({ ok: false, error: "network" });
  });

  // Bug caught: a failed save threw into the conversation, losing a table the DM had already paid for.
  it("leaves the preview to try again when the save fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("insert failed"));
    const made = await (await previewed(proposal())).create();
    expect(made.record).toBeNull();
    expect(made.parts[0]).toMatchObject({ ok: false, error: "insert failed" });
  });

  it("needs no game system with stat blocks and no quota", () => {
    state.offersStatBlocks = false;
    state.canCreate = false;
    expect(useRollTableAskAdapter().quote(proposal()).block).toBeNull();
  });
});
