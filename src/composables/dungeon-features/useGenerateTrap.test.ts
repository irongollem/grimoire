import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), logImage: vi.fn() }));
const busy = vi.hoisted(() => ({ value: false }));
const genError = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({ useCreateTrap: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({ useImageGenerationLog: () => ({ logImageGeneration: mocks.logImage }) }));
vi.mock("@/ai/useTrapGeneration", () => ({
  useTrapGeneration: () => ({ generate: mocks.generate, get error() { return ref(genError.value); } }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return busy.value; } } }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (text: string) => `doc:${text}` }));

const { useGenerateTrap } = await import("./useGenerateTrap");

const generated = {
  name: "Dart Wall", trap_type: "Mechanical", trigger_type: null, description: "Darts.", effect_description: null, detection_dc: 12, disarm_dc: 13,
  attack_bonus: null, save_type: null, save_dc: null, damage_entries: [], reset_type: null, cr: "1", trap_hp: null, trap_ac: null,
  notes: "", tags: [], image_url: "trap.png",
};

describe("useGenerateTrap", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    mocks.logImage.mockReset();
    busy.value = false;
    genError.value = null;
  });

  it("generates nothing, and spends nothing, while another generator is running", async () => {
    busy.value = true;
    const outcome = await useGenerateTrap().generateAndCreateTrap("A thing");
    expect(outcome).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves nothing and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    const outcome = await useGenerateTrap().generateAndCreateTrap("A thing");
    expect(outcome).toMatchObject({ id: null, name: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves into the active campaign with the page's field mapping", async () => {
    const outcome = await useGenerateTrap().generateAndCreateTrap("A thing", { generateImage: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: "c1", name: "Dart Wall", description: "doc:Darts.", hazard_glyph: null, image_url: "trap.png" }));
    expect(outcome).toMatchObject({ id: "r1", name: "Dart Wall", error: null });
  });

  it("says whether the picture was not asked for, painted, or failed, and logs only a painted one", async () => {
    expect(await useGenerateTrap().generateAndCreateTrap("A thing", { generateImage: false })).toMatchObject({ picture: "none" });
    expect(await useGenerateTrap().generateAndCreateTrap("A thing", { generateImage: true })).toMatchObject({ picture: "saved" });
    expect(mocks.logImage).toHaveBeenCalledWith(expect.objectContaining({ kind: "trap", imageUrl: "trap.png", targetId: "r1", prompt: "A thing" }));
    mocks.logImage.mockClear();
    mocks.generate.mockResolvedValue({ ...generated, image_url: null });
    expect(await useGenerateTrap().generateAndCreateTrap("A thing", { generateImage: true })).toMatchObject({ picture: "failed" });
    expect(mocks.logImage).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("insert failed"));
    await expect(useGenerateTrap().generateAndCreateTrap("A thing")).rejects.toThrow("insert failed");
  });
});
