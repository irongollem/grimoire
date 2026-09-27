import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  upload: vi.fn(),
  logImageGeneration: vi.fn(),
  campaign: { isAiEnabled: true, activeCampaign: { id: "campaign-1" } as { id: string } | null },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => mocks.campaign,
}));

vi.mock("@/composables/useImageUpload", () => ({
  useImageUpload: () => ({ upload: mocks.upload }),
}));

vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: mocks.logImageGeneration }),
}));

import { useCutoutGeneration } from "./useCutoutGeneration";

// A tiny valid base64 payload — its content never matters, only that it
// round-trips through atob() into bytes useCutoutGeneration hands to upload().
const IMAGE_B64 = btoa("fake-webp-bytes");

describe("useCutoutGeneration", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.upload.mockReset();
    mocks.logImageGeneration.mockReset();
    mocks.campaign.isAiEnabled = true;
    mocks.campaign.activeCampaign = { id: "campaign-1" };
  });

  it("refuses without calling the edge function when AI is disabled for the campaign", async () => {
    mocks.campaign.isAiEnabled = false;
    const { generate, error } = useCutoutGeneration();

    const url = await generate({ table: "monsters", id: "m1", bucket: "monster-images" });

    expect(url).toBeNull();
    expect(error.value).toBe("AI features are disabled for this campaign.");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("refuses without calling the edge function when there is no active campaign", async () => {
    mocks.campaign.activeCampaign = null;
    const { generate, error } = useCutoutGeneration();

    const url = await generate({ table: "monsters", id: "m1", bucket: "monster-images" });

    expect(url).toBeNull();
    expect(error.value).toBe("No active campaign selected.");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("invokes generate-cutout with the active campaign, table and id, then uploads and logs the result", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    mocks.upload.mockResolvedValue("https://cdn.example/monster-images/u1/cutout.webp");

    const { generate, isGenerating, error } = useCutoutGeneration();
    const url = await generate({ table: "monsters", id: "m1", bucket: "monster-images" });

    expect(mocks.invoke).toHaveBeenCalledWith("generate-cutout", {
      body: { campaign_id: "campaign-1", table: "monsters", id: "m1" },
    });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const uploadedFile = mocks.upload.mock.calls[0][0] as File;
    expect(uploadedFile.type).toBe("image/webp");

    expect(mocks.logImageGeneration).toHaveBeenCalledWith({
      kind: "monster_cutout",
      imageUrl: "https://cdn.example/monster-images/u1/cutout.webp",
      targetId: "m1",
      targetColumn: "cutout_url",
      size: "1024x1536",
      provider: "openai",
    });

    expect(url).toBe("https://cdn.example/monster-images/u1/cutout.webp");
    expect(isGenerating.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("logs the npcs kind for an npc cutout", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    mocks.upload.mockResolvedValue("https://cdn.example/npc-portraits/u1/cutout.webp");

    const { generate } = useCutoutGeneration();
    await generate({ table: "npcs", id: "n1", bucket: "npc-portraits" });

    expect(mocks.logImageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "npc_cutout", targetId: "n1" }),
    );
  });

  it("surfaces a structured edge-function error without uploading anything", async () => {
    mocks.invoke.mockResolvedValue({ data: { error: "no_picture" }, error: null });

    const { generate, error } = useCutoutGeneration();
    const url = await generate({ table: "monsters", id: "m1", bucket: "monster-images" });

    expect(url).toBeNull();
    expect(error.value).toBe("no_picture");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("fails when the upload comes back empty", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    mocks.upload.mockResolvedValue(null);

    const { generate, error } = useCutoutGeneration();
    const url = await generate({ table: "monsters", id: "m1", bucket: "monster-images" });

    expect(url).toBeNull();
    expect(error.value).toBe("Failed to upload the generated cutout.");
    expect(mocks.logImageGeneration).not.toHaveBeenCalled();
  });

  it("never invokes the edge function twice concurrently", async () => {
    let resolveInvoke: (value: unknown) => void = () => {};
    mocks.invoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));

    const { generate, isGenerating } = useCutoutGeneration();
    const first = generate({ table: "monsters", id: "m1", bucket: "monster-images" });
    expect(isGenerating.value).toBe(true);

    const second = await generate({ table: "monsters", id: "m1", bucket: "monster-images" });
    expect(second).toBeNull();

    resolveInvoke({ data: { image_b64: IMAGE_B64 }, error: null });
    mocks.upload.mockResolvedValue("https://cdn.example/x.webp");
    await first;
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
