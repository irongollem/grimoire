import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn() }));
const busy = vi.hoisted(() => ({ value: false }));
const genError = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/dungeon-features/usePuzzles", () => ({ useCreatePuzzle: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/ai/usePuzzleGeneration", () => ({
  usePuzzleGeneration: () => ({ generate: mocks.generate, get error() { return ref(genError.value); } }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return busy.value; } } }));
vi.mock("@/ai/useNpcGeneration", () => ({ toTiptapJson: (text: string) => `doc:${text}` }));

const { useGeneratePuzzle } = await import("./useGeneratePuzzle");

const generated = {
  name: "Flooded Crypt", puzzle_type: "Logic", difficulty: "Hard", description: "d", hints: ["h1"], solution: "s",
  skill_checks: [], success_outcome: "ok", failure_consequence: "bad", notes: "n", tags: [], image_url: "p.webp",
};

describe("useGeneratePuzzle", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "r1" });
    mocks.generate.mockReset().mockResolvedValue(generated);
    busy.value = false;
    genError.value = null;
  });

  it("generates nothing, and spends nothing, while another generator is running", async () => {
    busy.value = true;
    expect(await useGeneratePuzzle().generateAndCreatePuzzle("A crypt")).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves nothing and reports the generator's own reason when generation returns nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    expect(await useGeneratePuzzle().generateAndCreatePuzzle("A crypt")).toMatchObject({ id: null, name: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves the puzzle private to the active campaign", async () => {
    const outcome = await useGeneratePuzzle().generateAndCreatePuzzle("A crypt", { generateImage: true });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Flooded Crypt", campaign_id: "c1", is_shared: false, description: "doc:d", image_url: "p.webp",
    }));
    expect(outcome).toMatchObject({ id: "r1", name: "Flooded Crypt", picture: "saved" });
  });

  it("says whether the picture was not asked for, painted, or failed", async () => {
    expect(await useGeneratePuzzle().generateAndCreatePuzzle("A crypt", { generateImage: false })).toMatchObject({ picture: "none" });
    mocks.generate.mockResolvedValue({ ...generated, image_url: null });
    expect(await useGeneratePuzzle().generateAndCreatePuzzle("A crypt", { generateImage: true })).toMatchObject({ picture: "failed" });
  });

  it("lets a failed save throw, a quota error included, so the caller can say so", async () => {
    mocks.create.mockRejectedValue(new Error("quota_exceeded"));
    await expect(useGeneratePuzzle().generateAndCreatePuzzle("A crypt")).rejects.toThrow("quota_exceeded");
  });
});
