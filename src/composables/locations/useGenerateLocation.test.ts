import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), log: vi.fn() }));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/locations/useLocations", () => ({ useCreateLocation: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({ useImageGenerationLog: () => ({ logImageGeneration: mocks.log }) }));
vi.mock("@/ai/useLocationGeneration", () => ({ useLocationGeneration: () => ({ generate: mocks.generate, error: genError }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (t: string) => ({ type: "doc", text: t }) }));

const { useGenerateLocation } = await import("./useGenerateLocation");

const generated = (over: Record<string, unknown> = {}) => ({
  name: "Forgeholm", description: "Forges.", player_summary: "", tags: ["dwarven"], notes: "", image_url: "scene.png", map_url: null, ...over,
});

describe("useGenerateLocation", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "l1" });
    mocks.generate.mockReset().mockResolvedValue(generated());
    mocks.log.mockReset();
    busy.value = false;
    genError.value = null;
  });

  it("files the place under its parent and passes the parent's name to the generator", async () => {
    await useGenerateLocation().generateAndCreateLocation("a forge", { locationType: "city", parent: { id: "p1", name: "Thornkeep" } });
    expect(mocks.generate).toHaveBeenCalledWith("a forge", expect.objectContaining({ location_type: "city", parent_name: "Thornkeep" }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ location_type: "city", parent_id: "p1", player_summary: null, notes: null }));
  });

  it("records the NPC who keeps the place, and no one when none was named", async () => {
    await useGenerateLocation().generateAndCreateLocation("an inn", { keeperNpcId: "n1" });
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ npc_owner_id: "n1" }));
    await useGenerateLocation().generateAndCreateLocation("an inn");
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ npc_owner_id: null }));
  });

  it("with no kind or parent it is an unfiled place of kind other", async () => {
    await useGenerateLocation().generateAndCreateLocation("a forge");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ location_type: "other", parent_id: null }));
  });

  it("logs the scene and the map to the Gallery, linked to the new place, and the log never fails the run", async () => {
    mocks.generate.mockResolvedValue(generated({ map_url: "map.png" }));
    const outcome = await useGenerateLocation().generateAndCreateLocation("a forge", { generateImage: true, generateMap: true });
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ kind: "location", imageUrl: "scene.png", targetId: "l1", prompt: "a forge" }));
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ kind: "map", imageUrl: "map.png", targetId: "l1", targetColumn: "map_url" }));
    expect(outcome).toMatchObject({ id: "l1", picture: "saved", map: "saved" });
  });

  it("reports a failed scene or map only when one was asked for", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect(await useGenerateLocation().generateAndCreateLocation("a forge", { generateImage: true, generateMap: true })).toMatchObject({ picture: "failed", map: "failed" });
    expect(await useGenerateLocation().generateAndCreateLocation("a forge", { generateImage: false, generateMap: false })).toMatchObject({ picture: "none", map: "none" });
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("creates nothing while another generation is running, or when generation returns nothing, and lets a failed save throw", async () => {
    busy.value = true;
    genError.value = "an old failure";
    expect(await useGenerateLocation().generateAndCreateLocation("a forge")).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    busy.value = false;
    mocks.generate.mockResolvedValueOnce(null);
    expect(await useGenerateLocation().generateAndCreateLocation("a forge")).toMatchObject({ id: null, error: "an old failure" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.create.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateLocation().generateAndCreateLocation("a forge")).rejects.toThrow("save failed");
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
