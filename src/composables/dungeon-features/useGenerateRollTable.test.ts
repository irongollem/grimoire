import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { RollTableAiResult } from "@/ai/types";

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

const generated: RollTableAiResult = {
  name: "Cellar Finds", description: "", tags: ["loot"],
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
    expect(await useGenerateRollTable().generateRollTableDraft("A cellar", { die: "1d8" })).toMatchObject({ draft: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("holds nothing and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    expect(await useGenerateRollTable().generateRollTableDraft("A cellar", { die: "1d8" })).toMatchObject({ draft: null, error: "Provider down" });
  });

  // Bug caught: the draft step saved the table, so the DM's look at its rows came after it already existed.
  it("hands back the generated table without saving it", async () => {
    expect(await useGenerateRollTable().generateRollTableDraft("A cellar", { die: "1d12" })).toEqual({ draft: generated, error: null });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves the table rolled on the die it was generated for, with a fresh id on every entry", async () => {
    await useGenerateRollTable().saveGeneratedRollTable(generated, "1d12");
    const saved = mocks.create.mock.calls[0][0];
    expect(saved).toMatchObject({ campaign_id: "c1", name: "Cellar Finds", description: null, dice: "1d12", notes: null });
    expect(saved.entries).toHaveLength(2);
    expect(saved.entries[0]).toMatchObject({ min: 1, max: 4, label: "Rats", encounter_id: null, notes: null });
    expect(saved.entries[0].id).not.toBe(saved.entries[1].id);
  });

  it("lets a failed save throw so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("insert failed"));
    await expect(useGenerateRollTable().saveGeneratedRollTable(generated, "1d8")).rejects.toThrow("insert failed");
  });

  it("offers only dice whose faces the table validator can check ranges against", () => {
    for (const die of ROLL_TABLE_GENERATOR_DICE) expect(ROLL_TABLE_DIE_MAX[die]).toBe(Number(die.slice(2)));
  });
});
