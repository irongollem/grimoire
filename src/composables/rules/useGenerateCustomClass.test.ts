import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ createClass: vi.fn(), createFeature: vi.fn(), deleteFeature: vi.fn(), generate: vi.fn(), clearCompleted: vi.fn() }));
const busy = ref(false);
const error = ref<string | null>(null);

vi.mock("@/composables/rules/useCustomClasses", () => ({ useCreateCustomClass: () => ({ mutateAsync: mocks.createClass }) }));
vi.mock("@/composables/rules/useFeatures", () => ({
  useCreateFeature: () => ({ mutateAsync: mocks.createFeature }),
  useDeleteFeature: () => ({ mutateAsync: mocks.deleteFeature }),
}));
vi.mock("@/ai/useCustomClassGeneration", () => ({
  useCustomClassGeneration: () => ({ generate: mocks.generate, error, concept: ref(""), clearCompleted: mocks.clearCompleted }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/lib/codex/classAi", () => ({ classWithFeatureIds: (draft: { base: object }, ids: string[]) => ({ ...draft.base, ids }) }));

const { useGenerateCustomClass } = await import("./useGenerateCustomClass");

const draft = {
  base: { class_name: "Emberwarden" },
  features: [{ insert: { name: "Cinder" } }, { existingId: "asi" }],
  warnings: ["Ability Score Improvement was not added."],
};

describe("useGenerateCustomClass", () => {
  beforeEach(() => {
    mocks.createClass.mockReset().mockResolvedValue({ id: "k1" });
    mocks.createFeature.mockReset().mockResolvedValue({ id: "f1" });
    mocks.deleteFeature.mockReset().mockResolvedValue(undefined);
    mocks.generate.mockReset().mockResolvedValue(draft);
    busy.value = false;
    error.value = null;
  });

  it("creates the abilities first, then the class pointing at them, and passes the draft's warnings on", async () => {
    const outcome = await useGenerateCustomClass().generateAndCreateClass("a warrior-priest", {});
    expect(mocks.createFeature).toHaveBeenCalledTimes(1);
    expect(mocks.createClass).toHaveBeenCalledWith({ class_name: "Emberwarden", ids: ["f1", "asi"] });
    expect(outcome).toMatchObject({ id: "k1", name: "Emberwarden", error: null, warnings: draft.warnings });
  });

  it("removes the abilities already made when the class cannot be written, and still throws", async () => {
    mocks.createClass.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateCustomClass().generateAndCreateClass("a warrior-priest", {})).rejects.toThrow("save failed");
    expect(mocks.deleteFeature).toHaveBeenCalledWith("f1");
  });

  it("creates nothing while another generation is running", async () => {
    busy.value = true;
    const outcome = await useGenerateCustomClass().generateAndCreateClass("a warrior-priest", {});
    expect(outcome).toMatchObject({ id: null, name: null });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("saves nothing and says why when generation fails", async () => {
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    expect(await useGenerateCustomClass().generateAndCreateClass("a warrior-priest", {})).toMatchObject({ id: null, error: "Provider down" });
    expect(mocks.createFeature).not.toHaveBeenCalled();
  });
});
