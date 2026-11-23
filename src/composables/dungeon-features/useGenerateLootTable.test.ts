import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn() }));
const busy = vi.hoisted(() => ({ value: false }));
const genError = vi.hoisted(() => ({ value: null as string | null }));
// The catalogue's data, mutable per test: a read that has not arrived is `undefined`.
type Row = { id: string; name: string; rarity: string; item_type: string };
const catalogue = vi.hoisted(() => ({ rows: undefined as import("vue").ShallowRef<Row[] | undefined> | undefined }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/currency/useCurrency", () => ({
  useCurrency: () => ({ currency: ref({ denominations: [{ key: "gp" }] }) }),
}));
vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({ data: catalogue.rows }),
}));
vi.mock("@/composables/dungeon-features/useLootTables", () => ({ useCreateLootTable: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/ai/useLootGeneration", () => ({
  useLootGeneration: () => ({ generate: mocks.generate, get error() { return ref(genError.value); } }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return busy.value; } } }));

catalogue.rows = shallowRef<Row[] | undefined>(undefined);
const rows = catalogue.rows;
const { useGenerateLootTable } = await import("./useGenerateLootTable");

const rope = { id: "item-rope", name: "Rope", rarity: "common", item_type: "gear" };
const generated = {
  name: "Vault Hoard", description: "", tags: [], ai_provenance: { edited: false },
  entries: [
    { type: "item", item_name: "Rope", drop_chance: 50 },
    { type: "item", item_name: "Sword of Nowhere", drop_chance: 10 },
    { type: "currency", currency_label: "Coin", coins: { gp: 5 }, drop_chance: 100 },
  ],
};
const options = { crTier: "5-10" as const, excludeAttunement: false };

describe("useGenerateLootTable", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    busy.value = false;
    genError.value = null;
    rows.value = [rope];
  });

  it("generates nothing, and spends nothing, while another generator is running", async () => {
    busy.value = true;
    expect(await useGenerateLootTable().generateAndCreateLootTable("Treasure", options)).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("saves nothing and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    expect(await useGenerateLootTable().generateAndCreateLootTable("Treasure", options)).toMatchObject({ id: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("writes the entries that resolve, leaves out the ones the catalogue lacks, and counts them", async () => {
    const outcome = await useGenerateLootTable().generateAndCreateLootTable("Treasure", options);
    const saved = mocks.create.mock.calls[0][0];
    expect(saved).toMatchObject({ campaign_id: "c1", name: "Vault Hoard", cr_tier: "5-10", monster_ids: [] });
    expect(saved.entries.map((e: { type: string }) => e.type)).toEqual(["item", "currency"]);
    expect(saved.entries[0]).toMatchObject({ item_id: "item-rope" });
    expect(outcome).toMatchObject({ id: "r1", name: "Vault Hoard", unresolved: 1 });
  });

  it("creates no empty table when none of the items it named is in the catalogue", async () => {
    mocks.generate.mockResolvedValue({ ...generated, entries: [{ type: "item", item_name: "Sword of Nowhere", drop_chance: 10 }] });
    const outcome = await useGenerateLootTable().generateAndCreateLootTable("Treasure", options);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ id: null, name: null, unresolved: 1 });
    expect(outcome.error).toContain("None of the items it named");
  });

  it("waits for the catalogue instead of resolving every name against nothing", async () => {
    rows.value = undefined;
    const pending = useGenerateLootTable().generateAndCreateLootTable("Treasure", options);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.create).not.toHaveBeenCalled();
    rows.value = [rope];
    expect(await pending).toMatchObject({ id: "r1", unresolved: 1 });
  });

  it("lets a failed save throw so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("insert failed"));
    await expect(useGenerateLootTable().generateAndCreateLootTable("Treasure", options)).rejects.toThrow("insert failed");
  });
});
