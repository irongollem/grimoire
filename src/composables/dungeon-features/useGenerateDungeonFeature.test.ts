import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), logImage: vi.fn() }));
const busy = vi.hoisted(() => ({ value: false }));
const genError = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/dungeon-features/useDungeonFeatures", () => ({ useCreateDungeonFeature: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({ useImageGenerationLog: () => ({ logImageGeneration: mocks.logImage }) }));
vi.mock("@/ai/useDungeonFeatureGeneration", () => ({
  useDungeonFeatureGeneration: () => ({ generate: mocks.generate, get error() { return ref(genError.value); } }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return busy.value; } } }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (text: string) => `doc:${text}` }));

const { useGenerateDungeonFeature } = await import("./useGenerateDungeonFeature");

const generated = {
  name: "Weeping Bookcase", feature_type: "Secret Door", description: "A bookcase.", trigger_type: "Bookshelf", trigger_description: "Pull the tome.",
  perception_dc: 15, investigation_dc: 12, arcana_dc: null, feature_glyph: "secret_door", object_material: "wood", object_size: "large",
  object_ac: 15, object_hp: 27, damage_threshold: null, break_dc: 18, lock_dc: null, contents_description: null, notes: "Needle trap.",
  tags: ["library"], image_url: "x.webp", ai_provenance: { edited: false },
};

describe("useGenerateDungeonFeature", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    mocks.logImage.mockReset();
    busy.value = false;
    genError.value = null;
  });

  it("generates nothing, and spends nothing, while another generator is running", async () => {
    busy.value = true;
    const outcome = await useGenerateDungeonFeature().generateAndCreateFeature("A thing");
    expect(outcome).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves nothing and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    const outcome = await useGenerateDungeonFeature().generateAndCreateFeature("A thing");
    expect(outcome).toMatchObject({ id: null, name: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves into the active campaign with the page's field mapping", async () => {
    const outcome = await useGenerateDungeonFeature().generateAndCreateFeature("A thing", { generateImage: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: "c1", name: "Weeping Bookcase", description: "doc:A bookcase.", contents_description: null, notes: "doc:Needle trap.", image_url: "x.webp" }));
    expect(outcome).toMatchObject({ id: "r1", name: "Weeping Bookcase", error: null });
  });

  it("says whether the picture was not asked for, painted, or failed, and logs only a painted one", async () => {
    expect(await useGenerateDungeonFeature().generateAndCreateFeature("A thing", { generateImage: false })).toMatchObject({ picture: "none" });
    expect(await useGenerateDungeonFeature().generateAndCreateFeature("A thing", { generateImage: true })).toMatchObject({ picture: "saved" });
    expect(mocks.logImage).toHaveBeenCalledWith(expect.objectContaining({ kind: "dungeon_feature", imageUrl: "x.webp", targetId: "r1", prompt: "A thing" }));
    mocks.logImage.mockClear();
    mocks.generate.mockResolvedValue({ ...generated, image_url: null });
    expect(await useGenerateDungeonFeature().generateAndCreateFeature("A thing", { generateImage: true })).toMatchObject({ picture: "failed" });
    expect(mocks.logImage).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("insert failed"));
    await expect(useGenerateDungeonFeature().generateAndCreateFeature("A thing")).rejects.toThrow("insert failed");
  });
});
