import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWorldBlock = vi.fn(async (_id: string) => ({ world: "Sothery" }));
const keys = vi.hoisted(() => ({ text: false, image: false }));
const campaignMock = vi.hoisted(() => ({ activeCampaign: { id: "c1" } as { id: string } | null }));

vi.mock("./worldBlock", () => ({
  fetchWorldBlock: (id: string) => fetchWorldBlock(id),
  requireWorld: (w: unknown) => w,
}));
vi.mock("./localKeyMode", () => ({
  textRunsOnLocalKey: async () => keys.text,
  imagesRunOnLocalKey: async () => keys.image,
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignMock }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/localKeyVault", () => ({ localKeyModeChosen: () => false }));
vi.mock("@/ai/providers", () => ({ localImageChoice: () => null, getImageProvider: vi.fn() }));
vi.mock("@/composables/ai/useAiCredits", () => ({ logUsage: vi.fn() }));
vi.mock("@/ai/useImageJob", () => ({ waitForImageJob: vi.fn() }));
vi.mock("@/ai/systemPrompts", () => ({ fetchImageBasePrompt: vi.fn() }));

import {
  captureFailureMessage,
  captureImageGenerationContext,
  NoActiveCampaignError,
} from "./useImageGeneration";

beforeEach(() => {
  fetchWorldBlock.mockClear();
  keys.text = false;
  keys.image = false;
  campaignMock.activeCampaign = { id: "c1" };
});

describe("captureImageGenerationContext", () => {
  it("does not read the world block on the server path, where the edge function loads it itself", async () => {
    const context = await captureImageGenerationContext();
    expect(fetchWorldBlock).not.toHaveBeenCalled();
    expect(context.world).toBeNull();
  });

  it.each([
    ["text", { text: true, image: false }],
    ["image", { text: false, image: true }],
  ])("reads it once when the %s key runs locally", async (_name, set) => {
    Object.assign(keys, set);
    const context = await captureImageGenerationContext();
    expect(fetchWorldBlock).toHaveBeenCalledTimes(1);
    expect(fetchWorldBlock).toHaveBeenCalledWith("c1");
    expect(context.world).toEqual({ world: "Sothery" });
  });

  it("throws the no-campaign error when none is active", async () => {
    campaignMock.activeCampaign = null;
    await expect(captureImageGenerationContext()).rejects.toBeInstanceOf(NoActiveCampaignError);
  });
});

describe("captureFailureMessage", () => {
  it("says no campaign only for the no-campaign case", () => {
    expect(captureFailureMessage(new NoActiveCampaignError())).toBe("No active campaign selected.");
  });

  it("shows a world-read error's own message, never the no-campaign sentence", () => {
    expect(captureFailureMessage(new Error("permission denied for canon_entries"))).toBe(
      "permission denied for canon_entries",
    );
  });
});
