import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), clearCompleted: vi.fn() }));
const busy = ref(false);
const error = ref<string | null>(null);
const concept = ref("");

vi.mock("@/composables/rules/useSpecies", () => ({ useCreateSpecies: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/ai/useSpeciesGeneration", () => ({
  useSpeciesGeneration: () => ({ generate: mocks.generate, error, concept, clearCompleted: mocks.clearCompleted }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));

const { useGenerateSpecies } = await import("./useGenerateSpecies");

const draft = { name: "Emberfolk", image_url: "https://img/s.webp" };

describe("useGenerateSpecies", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "x1" });
    mocks.generate.mockReset().mockResolvedValue(draft);
    mocks.clearCompleted.mockReset();
    busy.value = false;
    error.value = null;
    concept.value = "";
  });

  it("saves what was generated and reports the saved row's id and the draft's name", async () => {
    const outcome = await useGenerateSpecies().generateAndCreateSpecies("a concept", { generateImage: true });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ id: "x1", name: "Emberfolk", error: null, picture: "saved" });
    expect(concept.value).toBe("a concept");
    expect(mocks.clearCompleted).toHaveBeenCalled();
  });

  it("creates nothing while another generation is running", async () => {
    busy.value = true;
    const outcome = await useGenerateSpecies().generateAndCreateSpecies("a concept", {});
    expect(outcome).toMatchObject({ id: null, name: null });
    expect(outcome.error).toContain("already in progress");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("saves nothing and says why when generation fails", async () => {
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    const outcome = await useGenerateSpecies().generateAndCreateSpecies("a concept", {});
    expect(outcome).toMatchObject({ id: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say the paid result was lost", async () => {
    mocks.create.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateSpecies().generateAndCreateSpecies("a concept", {})).rejects.toThrow("save failed");
  });

  it("says the species is saved with a picture that failed, and does not call an unwanted picture a failure", async () => {
    mocks.generate.mockResolvedValue({ name: "Emberfolk", image_url: null });
    expect(await useGenerateSpecies().generateAndCreateSpecies("a concept", { generateImage: true })).toMatchObject({ picture: "failed" });
    expect(await useGenerateSpecies().generateAndCreateSpecies("a concept", { generateImage: false })).toMatchObject({ picture: "none" });
  });
});
