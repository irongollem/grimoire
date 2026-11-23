import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn() }));
const busy = vi.hoisted(() => ({ value: false }));
const genError = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/dungeon-features/useRollTables", () => ({ useCreateRollTable: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/ai/useRollTableGeneration", () => ({
  useRollTableGeneration: () => ({ generate: mocks.generate, get error() { return ref(genError.value); } }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return busy.value; } } }));

const { useGenerateRollTable, ROLL_TABLE_GENERATOR_DICE } = await import("./useGenerateRollTable");
const { ROLL_TABLE_DIE_MAX } = await import("@/types/rollTable.types");

const generated = {
  name: "Cellar Finds", description: "", tags: ["loot"], ai_provenance: { edited: false },
  entries: [{ min: 1, max: 4, label: "Rats", notes: null }, { min: 5, max: 8, label: "A key", notes: "Rusted" }],
};

describe("useGenerateRollTable", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    busy.value = false;
    genError.value = null;
  });

  it("generates nothing, and spends nothing, while another generator is running", async () => {
    busy.value = true;
    expect(await useGenerateRollTable().generateAndCreateRollTable("A cellar", { die: "1d8" })).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("saves nothing and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    expect(await useGenerateRollTable().generateAndCreateRollTable("A cellar", { die: "1d8" })).toMatchObject({ id: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves the table rolled on the die it was generated for, with a fresh id on every entry", async () => {
    const outcome = await useGenerateRollTable().generateAndCreateRollTable("A cellar", { die: "1d12" });
    const saved = mocks.create.mock.calls[0][0];
    expect(saved).toMatchObject({ campaign_id: "c1", name: "Cellar Finds", description: null, dice: "1d12", notes: null });
    expect(saved.entries).toHaveLength(2);
    expect(saved.entries[0]).toMatchObject({ min: 1, max: 4, label: "Rats", encounter_id: null, notes: null });
    expect(saved.entries[0].id).not.toBe(saved.entries[1].id);
    expect(outcome).toMatchObject({ id: "r1", name: "Cellar Finds" });
  });

  it("lets a failed save throw so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("insert failed"));
    await expect(useGenerateRollTable().generateAndCreateRollTable("A cellar", { die: "1d8" })).rejects.toThrow("insert failed");
  });

  it("offers only dice whose faces the table validator can check ranges against", () => {
    for (const die of ROLL_TABLE_GENERATOR_DICE) expect(ROLL_TABLE_DIE_MAX[die]).toBe(Number(die.slice(2)));
  });
});
