import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ create: vi.fn(), generate: vi.fn() }));
const busy = ref(false);
const genError = ref<string | null>(null);

vi.mock("@/composables/items/useItems", () => ({ useCreateItem: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/ai/useItemGeneration", () => ({ useItemGeneration: () => ({ generate: mocks.generate, error: genError }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: busy }));
vi.mock("@/lib/items/generatedItemPayload", () => ({
  generatedItemPayload: (result: { name: string }, campaignId: string | null) => ({ name: result.name, campaign_id: campaignId }),
}));

const { useGenerateItem } = await import("./useGenerateItem");

const generated = (over: Record<string, unknown> = {}) => ({ name: "Stormbone Staff", image_url: "https://img/i.webp", ...over });

describe("useGenerateItem", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({ id: "i1" });
    mocks.generate.mockReset().mockResolvedValue(generated());
    busy.value = false;
    genError.value = null;
  });

  it("creates the generated item in the campaign it was generated for and names it", async () => {
    const outcome = await useGenerateItem().generateAndCreateItem("a storm staff", { generateImage: true });
    expect(mocks.generate).toHaveBeenCalledWith("a storm staff", { generateImage: true });
    expect(mocks.create).toHaveBeenCalledWith({ name: "Stormbone Staff", campaign_id: "c1" });
    expect(outcome).toEqual({ id: "i1", error: null, name: "Stormbone Staff", picture: "saved" });
  });

  it("says the item is saved with a picture that failed, so a caller can offer to paint it again", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect((await useGenerateItem().generateAndCreateItem("a staff", { generateImage: true })).picture).toBe("failed");
  });

  it("does not call a picture nobody asked for a failure", async () => {
    mocks.generate.mockResolvedValue(generated({ image_url: null }));
    expect((await useGenerateItem().generateAndCreateItem("a staff", { generateImage: false })).picture).toBe("none");
  });

  it("creates nothing while another generation is running, and does not report a stale earlier error", async () => {
    busy.value = true;
    genError.value = "an old failure";
    const outcome = await useGenerateItem().generateAndCreateItem("a staff");
    expect(outcome).toMatchObject({ id: null, error: "Another AI generation is already in progress." });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("creates nothing when generation returns nothing, and carries its error", async () => {
    mocks.generate.mockResolvedValue(null);
    genError.value = "Provider down";
    const outcome = await useGenerateItem().generateAndCreateItem("a staff");
    expect(outcome).toMatchObject({ id: null, error: "Provider down", name: null });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("lets a failed save throw, so the caller can say the generation was paid for", async () => {
    mocks.create.mockRejectedValue(new Error("save failed"));
    await expect(useGenerateItem().generateAndCreateItem("a staff")).rejects.toThrow("save failed");
  });
});
