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

  // Bug caught: the draft step writing rows, so a DM who pressed Discard on the preview was left with a class they never kept.
  it("generates a draft and writes nothing until the DM keeps it", async () => {
    const outcome = await useGenerateCustomClass().generateClassDraft("a warrior-priest", { hitDie: 8 });
    expect(outcome).toEqual({ draft, error: null });
    expect(mocks.generate).toHaveBeenCalledWith("a warrior-priest", { hitDie: 8 });
    expect(mocks.createFeature).not.toHaveBeenCalled();
    expect(mocks.createClass).not.toHaveBeenCalled();
  });

  // Bug caught: the class row written before its abilities, pointing at ids that did not exist.
  it("creates the abilities first, then the class pointing at them, when the DM keeps the draft", async () => {
    const created = await useGenerateCustomClass().createClassFromDraft(draft as never);
    expect(mocks.createFeature).toHaveBeenCalledTimes(1);
    expect(mocks.createClass).toHaveBeenCalledWith({ class_name: "Emberwarden", ids: ["f1", "asi"] });
    expect(created).toEqual({ id: "k1" });
  });

  // Bug caught: abilities left behind as orphans when the class row could not be written.
  it("removes the abilities already made when the class cannot be written, and still throws", async () => {
    mocks.createClass.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateCustomClass().createClassFromDraft(draft as never)).rejects.toThrow("save failed");
    expect(mocks.deleteFeature).toHaveBeenCalledWith("f1");
  });

  // Bug caught: a second generation started while one runs, charging twice.
  it("generates nothing while another generation is running", async () => {
    busy.value = true;
    expect(await useGenerateCustomClass().generateClassDraft("a warrior-priest", {})).toMatchObject({ draft: null });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("says why when generation fails", async () => {
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    expect(await useGenerateCustomClass().generateClassDraft("a warrior-priest", {})).toEqual({ draft: null, error: "Provider down" });
  });
});
