import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ createSub: vi.fn(), createFeature: vi.fn(), deleteFeature: vi.fn(), generate: vi.fn(), clearCompleted: vi.fn() }));
const busy = ref(false);
const error = ref<string | null>(null);
const lists = vi.hoisted(() => ({ system: undefined as unknown, custom: undefined as unknown }));

vi.mock("@/composables/rules/useCustomSubclasses", () => ({ useCreateCustomSubclass: () => ({ mutateAsync: mocks.createSub }) }));
vi.mock("@/composables/rules/useCustomClasses", () => ({
  useCampaignSystemClasses: () => ({ data: { get value() { return lists.system; } }, all: { get value() { return lists.system; } } }),
  useCampaignCustomClasses: () => ({ data: { get value() { return lists.custom; } }, all: { get value() { return lists.custom; } } }),
}));
vi.mock("@/composables/rules/useFeatures", () => ({
  useCreateFeature: () => ({ mutateAsync: mocks.createFeature }),
  useDeleteFeature: () => ({ mutateAsync: mocks.deleteFeature }),
}));
vi.mock("@/ai/useCustomSubclassGeneration", () => ({
  useCustomSubclassGeneration: () => ({ generate: mocks.generate, error, concept: ref(""), clearCompleted: mocks.clearCompleted }),
}));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/lib/codex/subclassAi", () => ({ subclassWithFeatureIds: (draft: { base: object }, ids: string[]) => ({ ...draft.base, ids }) }));

const { useGenerateCustomSubclass, useSubclassParents } = await import("./useGenerateCustomSubclass");

const draft = { base: { subclass_name: "Cinder Smith" }, features: [{ insert: { name: "Forge" } }] };

describe("useGenerateCustomSubclass", () => {
  beforeEach(() => {
    mocks.createSub.mockReset().mockResolvedValue({ id: "u1" });
    mocks.createFeature.mockReset().mockResolvedValue({ id: "f1" });
    mocks.deleteFeature.mockReset().mockResolvedValue(undefined);
    mocks.generate.mockReset().mockResolvedValue(draft);
    busy.value = false;
    error.value = null;
    lists.system = [{ class_name: "Fighter", subclass_level: 3 }, { class_name: "Wizard", subclass_level: 2 }];
    lists.custom = [{ class_name: "Wizard", subclass_level: 5 }];
  });

  it("creates the abilities first, then the archetype pointing at them", async () => {
    const outcome = await useGenerateCustomSubclass().generateAndCreateSubclass("smiths", { parentClassName: "Fighter", subclassLevel: 3 });
    expect(mocks.createSub).toHaveBeenCalledWith({ subclass_name: "Cinder Smith", ids: ["f1"] });
    expect(outcome).toMatchObject({ id: "u1", name: "Cinder Smith", error: null });
  });

  it("removes the abilities already made when the archetype cannot be written, and still throws", async () => {
    mocks.createSub.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateCustomSubclass().generateAndCreateSubclass("smiths", { parentClassName: "Fighter", subclassLevel: 3 })).rejects.toThrow("save failed");
    expect(mocks.deleteFeature).toHaveBeenCalledWith("f1");
  });

  it("creates nothing while another generation is running, and says why when generation fails", async () => {
    busy.value = true;
    expect(await useGenerateCustomSubclass().generateAndCreateSubclass("smiths", { parentClassName: "Fighter", subclassLevel: 3 })).toMatchObject({ id: null });
    expect(mocks.generate).not.toHaveBeenCalled();
    busy.value = false;
    mocks.generate.mockResolvedValue(null);
    error.value = "Provider down";
    expect(await useGenerateCustomSubclass().generateAndCreateSubclass("smiths", { parentClassName: "Fighter", subclassLevel: 3 })).toMatchObject({ id: null, error: "Provider down" });
  });
});

describe("useSubclassParents", () => {
  beforeEach(() => {
    lists.system = [{ class_name: "Fighter", subclass_level: 3 }, { class_name: "Wizard", subclass_level: 2 }];
    lists.custom = [{ class_name: "Wizard", subclass_level: 5 }];
  });

  it("lets a homebrew class of the same name win, and lists the names sorted", () => {
    const parents = useSubclassParents(() => true);
    expect(parents.levelByClass.value.get("Wizard")).toBe(5);
    expect(parents.options.value.map((o) => o.name)).toEqual(["Fighter", "Wizard"]);
  });

  it("is loading until both lists have arrived, so a class not there yet is not called missing", () => {
    lists.custom = undefined;
    expect(useSubclassParents(() => true).loading.value).toBe(true);
    lists.custom = [];
    expect(useSubclassParents(() => true).loading.value).toBe(false);
  });
});
