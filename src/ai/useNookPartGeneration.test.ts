import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  campaign: { isAiEnabled: true, activeCampaign: { id: "campaign-1" } as { id: string } | null },
  costOf: vi.fn(),
  multiplier: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaign }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: mocks.costOf }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ imageMultiplierFor: mocks.multiplier }) }));

import { useNookPartCost, useNookPartGeneration } from "./useNookPartGeneration";

const IMAGE_B64 = btoa("fake-webp-bytes");

const textOf = (blob: Blob) => blob.text();

describe("useNookPartGeneration", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.campaign.isAiEnabled = true;
    mocks.campaign.activeCampaign = { id: "campaign-1" };
  });

  it("paint sends the campaign, nook, mode and subject only, and returns the decoded bytes as webp (a Blob, not an upload)", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    const { paint, isGenerating } = useNookPartGeneration();

    const blob = await paint("nook-1", "a copper kettle");

    expect(mocks.invoke).toHaveBeenCalledWith("generate-nook-part", {
      body: { campaign_id: "campaign-1", nook_id: "nook-1", mode: "paint", subject: "a copper kettle" },
    });
    expect(blob.type).toBe("image/webp");
    expect(await textOf(blob)).toBe("fake-webp-bytes");
    expect(isGenerating.value).toBe(false);
  });

  it("lift sends the crop as base64 and the hint only when given", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    const { lift } = useNookPartGeneration();
    const crop = new Blob(["crop-bytes"], { type: "image/png" });

    await lift("nook-1", crop);
    await lift("nook-1", crop, "the kettle");

    const first = mocks.invoke.mock.calls[0][1].body;
    expect(first).toEqual({ campaign_id: "campaign-1", nook_id: "nook-1", mode: "lift", image_b64: btoa("crop-bytes") });
    expect(first).not.toHaveProperty("subject");
    expect(mocks.invoke.mock.calls[1][1].body.subject).toBe("the kettle");
  });

  it("fill sends both the crop and the mask", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    const { fill } = useNookPartGeneration();

    await fill("nook-1", new Blob(["crop"], { type: "image/png" }), new Blob(["mask"], { type: "image/png" }));

    expect(mocks.invoke.mock.calls[0][1].body).toEqual({
      campaign_id: "campaign-1", nook_id: "nook-1", mode: "fill", image_b64: btoa("crop"), mask_b64: btoa("mask"),
    });
  });

  it("refuses without calling the edge function when AI is off or there is no campaign", async () => {
    const { paint, error } = useNookPartGeneration();
    mocks.campaign.isAiEnabled = false;
    await expect(paint("n", "a kettle")).rejects.toThrow("AI features are disabled for this campaign.");
    expect(error.value).toBe("AI features are disabled for this campaign.");

    mocks.campaign.isAiEnabled = true;
    mocks.campaign.activeCampaign = null;
    await expect(paint("n", "a kettle")).rejects.toThrow("No active campaign selected.");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("surfaces a structured error body, and clears isGenerating so the next try can run", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "no_room_picture" }, error: null });
    const { paint, error, isGenerating } = useNookPartGeneration();

    await expect(paint("n", "a kettle")).rejects.toThrow("no_room_picture");
    expect(error.value).toBe("no_room_picture");
    expect(isGenerating.value).toBe(false);
  });

  it("fails when the response carries no image", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: null }, error: null });
    const { paint } = useNookPartGeneration();
    await expect(paint("n", "a kettle")).rejects.toThrow("The nook part generator returned no image.");
  });
});

describe("useNookPartCost", () => {
  it("prices one picture as the cut-out cost at 1024x1024 times the OpenAI multiplier, whole credits", () => {
    mocks.costOf.mockReturnValue(3);
    mocks.multiplier.mockReturnValue(1.5);

    expect(useNookPartCost().picture.value).toBe(5); // 4.5 rounded up to whole credits
    expect(mocks.costOf).toHaveBeenCalledWith("entity_cutout", { size: "1024x1024" });
    expect(mocks.multiplier).toHaveBeenCalledWith("openai");
  });
});
