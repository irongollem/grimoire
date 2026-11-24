import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/ai/useImageGeneration", () => ({
  captureImageGenerationContext: async () => ({ campaignId: "c1" }),
  captureFailureMessage: () => "no",
  generateImage: mocks.generateImage,
}));

const { useLocationGeneration } = await import("./useLocationGeneration");

describe("useLocationGeneration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.invoke.mockReset();
    mocks.generateImage.mockReset();
    mocks.generateImage.mockResolvedValue("https://img/p.webp");
  });

  // Bug caught: a text function quietly painting a second, unrecorded picture. All art goes through the one image
  // job, so the call to generate-location must carry no picture switch at all.
  it("asks generate-location for text only, never for a picture or a map", async () => {
    mocks.invoke.mockResolvedValue({ data: { name: "Mill", image_prompt: "A mill." }, error: null });
    await useLocationGeneration().generate("a mill", { generateImage: true, generateMap: true });
    const body = mocks.invoke.mock.calls[0][1].body as Record<string, unknown>;
    expect(body).not.toHaveProperty("generate_image");
    expect(body).not.toHaveProperty("generate_map");
    expect(body).toMatchObject({ campaign_id: "c1", prompt: "a mill" });
  });
});
