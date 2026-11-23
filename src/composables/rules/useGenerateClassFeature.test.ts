import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn(), clearCompleted: vi.fn() }));
const busy = ref(false);
const error = ref<string | null>(null);
const concept = ref("");

vi.mock("@/composables/rules/useFeatures", () => ({ useCreateFeature: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/ai/useClassFeatureGeneration", () => ({
  useClassFeatureGeneration: () => ({ generate: mocks.generate, error, concept, clearCompleted: mocks.clearCompleted }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));

const { useGenerateClassFeature } = await import("./useGenerateClassFeature");

const draft = { name: "Cover of Leaves" };

describe("useGenerateClassFeature", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "x1" });
    mocks.generate.mockReset().mockResolvedValue(draft);
    mocks.clearCompleted.mockReset();
    busy.value = false;
    error.value = null;
    concept.value = "";
  });

  it("saves what was generated and reports the saved row's id and the draft's name", async () => {
    const outcome = await useGenerateClassFeature().generateAndCreateClassFeature("a concept", {});
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ id: "x1", name: "Cover of Leaves", error: null });
    expect(concept.value).toBe("a concept");
    expect(mocks.clearCompleted).toHaveBeenCalled();
  });

  it("creates nothing while another generation is running", async () => {
    busy.value = true;
    const outcome = await useGenerateClassFeature().generateAndCreateClassFeature("a concept", {});
    expect(outcome).toMatchObject({ id: null, name: null });
    expect(outcome.error).toContain("already in progress");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("saves nothing and says why when generation fails", async () => {
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    const outcome = await useGenerateClassFeature().generateAndCreateClassFeature("a concept", {});
    expect(outcome).toMatchObject({ id: null, error: "Provider down" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say the paid result was lost", async () => {
    mocks.create.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateClassFeature().generateAndCreateClassFeature("a concept", {})).rejects.toThrow("save failed");
  });
});
