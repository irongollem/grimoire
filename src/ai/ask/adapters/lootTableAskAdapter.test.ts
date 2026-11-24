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
vi.mock("@/composables/currency/useCurrency", () => ({
  useCurrency: () => ({ formatCoins: (coins: Record<string, number>) => Object.entries(coins).map(([k, v]) => `${v} ${k}`).join(", ") }),
}));
vi.mock("@/composables/dungeon-features/useGenerateLootTable", () => ({
  useGenerateLootTable: () => ({ generateLootDraft: mocks.draft, saveGeneratedLootTable: mocks.save }),
}));

const { useLootTableAskAdapter } = await import("./lootTableAskAdapter");
const { useLootTableQuote } = await import("@/composables/ai/quotes/lootTableQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "The smugglers' vault"): AskProposal => ({
  proposalId: "p1", generator: "loot_table", concept, inputs,
});
const draft = (over: Record<string, unknown> = {}) => ({
  result: { name: "Vault Hoard", description: "What they kept", tags: [] },
  resolved: [
    { kind: "item", item: { id: "i1", name: "Rope", rarity: "common", item_type: "gear" }, generatedName: "Rope", dropChance: 50, dice: "1d4", fixedQty: null, notes: null },
    { kind: "currency", label: "Coin", dropChance: 100, coins: { gp: 5 }, notes: null },
    { kind: "random", rarity: "rare", itemTypeFilter: null, dropChance: 10, dice: null, fixedQty: 1, notes: null },
    { kind: "unresolved", generatedName: "Sword of Nowhere", reason: "not in the Vault" },
  ],
  unresolved: 1,
  ...over,
});

async function previewed(p: AskProposal) {
  const outcome = await useLootTableAskAdapter().preview(p);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useLootTableAskAdapter", () => {
  beforeEach(() => {
    mocks.draft.mockReset().mockResolvedValue({ draft: draft(), error: null });
    mocks.save.mockReset().mockResolvedValue({ table: { id: "r1" } });
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true });
  });

  it("quotes the same price the page shows", () => {
    expect(useLootTableAskAdapter().quote(proposal()).total).toBe(useLootTableQuote()().total);
  });

  it("blocks with AI off, on a short balance, with no stat blocks, and on an empty or overlong concept, and generates nothing", async () => {
    const adapter = useLootTableAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    state.offersStatBlocks = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.offersStatBlocks = true;
    expect(adapter.quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({}, "x".repeat(501))).block?.reason).toBe("missing");
    expect((await adapter.preview(proposal({}, "   "))).ok).toBe(false);
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  // Bug caught: the attunement switch was read but never passed on, so "skip items that need attunement" skipped nothing.
  it("passes the tier and the attunement switch to the generator, the page's 5-10 when the tier is not one it offers", async () => {
    await previewed(proposal({ cr_tier: "11-16", skip_attunement: true }));
    expect(mocks.draft).toHaveBeenLastCalledWith("The smugglers' vault", { crTier: "11-16", excludeAttunement: true });
    await previewed(proposal({ cr_tier: "99-100" }));
    expect(mocks.draft).toHaveBeenLastCalledWith("The smugglers' vault", { crTier: "5-10", excludeAttunement: false });
  });

  // Bug caught: the hoard saved at the generation, so the DM never saw its entries before keeping it.
  it("writes nothing until create is called, then writes what resolved at the tier it was made for", async () => {
    const preview = await previewed(proposal({ cr_tier: "0-4" }));
    expect(mocks.save).not.toHaveBeenCalled();
    const made = await preview.create();
    expect(mocks.save).toHaveBeenCalledWith(draft().result, draft().resolved, "0-4");
    expect(made).toMatchObject({ record: { id: "r1", name: "Vault Hoard" }, route: "/loot-tables/r1" });
    expect(made.parts.at(-1)).toMatchObject({ label: "Items", ok: false });
    expect(made.parts.at(-1)?.error).toContain("1 item was not in your Vault");
  });

  it("shows each resolved entry with its chance, and names what the Vault lacks in a note instead of dropping it", async () => {
    const { shown } = await previewed(proposal({ cr_tier: "11-16" }));
    expect(shown).toMatchObject({ title: "Vault Hoard", badge: "CR 11–16" });
    expect(shown.sections.at(-1)?.rows).toEqual([
      { label: "50%  Rope", detail: "×1d4" },
      { label: "100%  Coin", detail: "5 gp" },
      { label: "10%  Random rare item", detail: "×1" },
    ]);
    expect(shown.note).toContain("1 entry couldn't be matched");
  });

  it("shows no note when every entry matched, and no tier badge for any tier", async () => {
    mocks.draft.mockResolvedValue({ draft: draft({ unresolved: 0 }), error: null });
    const { shown } = await previewed(proposal({ cr_tier: "any" }));
    expect(shown.note).toBeUndefined();
    expect(shown.badge).toBeUndefined();
  });

  it("ends with a failed part, and no preview, when the generator gave nothing", async () => {
    mocks.draft.mockResolvedValueOnce({ draft: null, error: "None of the items it named are in your Vault or enabled sources. Try again." });
    const outcome = await useLootTableAskAdapter().preview(proposal());
    expect(outcome.ok === false && outcome.result.parts[0].error).toContain("None of the items");
  });

  // Bug caught: the table's own validator refusing the entries threw into the conversation instead of staying on the preview.
  it("leaves the preview to try again when the save is refused or fails", async () => {
    mocks.save.mockResolvedValueOnce({ error: "Entry 2 needs a quantity. Try regenerating." });
    const refused = await (await previewed(proposal())).create();
    expect(refused.record).toBeNull();
    expect(refused.parts[0]).toMatchObject({ ok: false, error: "Entry 2 needs a quantity. Try regenerating." });
    mocks.save.mockRejectedValueOnce(new Error("insert failed"));
    const failed = await (await previewed(proposal())).create();
    expect(failed.parts[0]).toMatchObject({ ok: false, error: "insert failed" });
  });
});
