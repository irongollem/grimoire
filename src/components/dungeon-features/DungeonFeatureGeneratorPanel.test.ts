import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DungeonFeatureGeneratorPanel from "./DungeonFeatureGeneratorPanel.vue";

const mocks = vi.hoisted(() => ({
  createFeature: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
  logImage: vi.fn(),
  toastError: vi.fn(),
  ui: { dungeonFeatureGeneratorOpen: true },
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    error: mocks.toastError,
    fromError: (e: unknown) => (e instanceof Error ? e.message : "failed"),
  }),
}));
vi.mock("@/stores/ui/generators", () => ({ useGeneratorUiStore: () => mocks.ui }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    isAiEnabled: true,
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedOpenAiKey: null,
  }),
}));
vi.mock("@/composables/dungeon-features/useDungeonFeatures", () => ({
  useCreateDungeonFeature: () => ({ mutateAsync: mocks.createFeature }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: mocks.logImage }),
}));
vi.mock("@/ai/useDungeonFeatureGeneration", () => ({
  useDungeonFeatureGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    completedEntityId: ref(null),
    concept: ref(""),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
}));
vi.mock("@/ai/useNpcGeneration", () => ({
  toTiptapJson: (text: string) => `doc:${text}`,
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", async () => {
  const { ref } = await import("vue");
  return {
    useCampaignProviders: () => ({
      textProvider: ref("openai"),
      textIsByok: ref(false),
      textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base),
      imageProvider: ref("openai"),
      imageIsByok: ref(false),
      imageMultiplier: ref(1), imageCredits: (base: number) => Math.ceil(base),
    }),
  };
});
vi.mock("@/composables/ai/useGenerationGate", () => ({
  useGenerationGate: () => ({ canSpend: () => true, gateQuotaError: () => false, showQuotaPaywall: ref(false) }),
}));

const generated = {
  name: "Weeping Bookcase",
  feature_type: "Secret Door",
  description: "A bookcase.",
  trigger_type: "Bookshelf",
  trigger_description: "Pull the red tome.",
  perception_dc: 15,
  investigation_dc: 12,
  arcana_dc: null,
  feature_glyph: "secret_door",
  contents_description: null,
  notes: "Needle trap on a wrong pull.",
  tags: ["library"],
  image_prompt: "A bookcase ajar.",
  image_url: "asset-images/x.webp",
  ai_provenance: { edited: false },
};

function mountPanel() {
  return mount(DungeonFeatureGeneratorPanel, {
    global: { stubs: { RouterLink: RouterLinkStub, GenerationCostBadge: true } },
  });
}

describe("DungeonFeatureGeneratorPanel", () => {
  beforeEach(() => {
    mocks.createFeature.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    mocks.logImage.mockReset();
    mocks.toastError.mockReset();
    mocks.ui.dungeonFeatureGeneratorOpen = true;
  });

  it("maps the generated feature onto the create payload and navigates to it", async () => {
    mocks.generate.mockResolvedValue(generated);
    mocks.createFeature.mockResolvedValue({ id: "f1" });
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A bookcase that swings aside.");

    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.createFeature).toHaveBeenCalled());

    expect(mocks.createFeature).toHaveBeenCalledWith(expect.objectContaining({
      campaign_id: "campaign-1",
      name: "Weeping Bookcase",
      feature_type: "Secret Door",
      description: "doc:A bookcase.",
      contents_description: null,
      notes: "doc:Needle trap on a wrong pull.",
      perception_dc: 15,
      arcana_dc: null,
      feature_glyph: "secret_door",
      image_url: "asset-images/x.webp",
      ai_provenance: { edited: false },
    }));
    expect(mocks.logImage).toHaveBeenCalledWith(expect.objectContaining({ kind: "dungeon_feature", targetId: "f1" }));
    expect(mocks.push).toHaveBeenCalledWith("/dungeon-features/f1");
    expect(mocks.ui.dungeonFeatureGeneratorOpen).toBe(false);
  });

  it("creates nothing when generation fails", async () => {
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A bookcase.");

    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");

    expect(mocks.createFeature).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("toasts a failed save, keeps the panel open and does not navigate", async () => {
    mocks.generate.mockResolvedValue(generated);
    mocks.createFeature.mockRejectedValue(new Error("insert failed"));
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A bookcase that swings aside.");

    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("insert failed"));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.logImage).not.toHaveBeenCalled();
    expect(mocks.ui.dungeonFeatureGeneratorOpen).toBe(true);
  });

  it("keeps the paid result after a failed save and retries the create without generating again", async () => {
    mocks.generate.mockResolvedValue(generated);
    mocks.createFeature.mockRejectedValueOnce(new Error("insert failed")).mockResolvedValueOnce({ id: "f2" });
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A bookcase that swings aside.");

    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("could not be saved"));
    expect(mocks.generate).toHaveBeenCalledTimes(1);

    await wrapper.findAll("button").find((b) => b.text().includes("Save again"))!.trigger("click");
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dungeon-features/f2"));

    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.createFeature).toHaveBeenCalledTimes(2);
    expect(mocks.logImage).toHaveBeenCalledTimes(1);
    expect(mocks.ui.dungeonFeatureGeneratorOpen).toBe(false);
  });

  it("discards the kept result and goes back to generating", async () => {
    mocks.generate.mockResolvedValue(generated);
    mocks.createFeature.mockRejectedValue(new Error("insert failed"));
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A bookcase.");

    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await vi.waitFor(() => expect(wrapper.text()).toContain("could not be saved"));
    await wrapper.findAll("button").find((b) => b.text() === "Discard")!.trigger("click");

    expect(wrapper.text()).not.toContain("could not be saved");
    expect(wrapper.findAll("button").some((b) => b.text().includes("Generate with AI"))).toBe(true);
  });
});
