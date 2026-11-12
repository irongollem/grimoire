import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  upload: vi.fn(),
  ack: vi.fn(),
  campaign: { isAiEnabled: true, activeCampaignId: "campaign-1" as string | null },
  prepare: vi.fn(),
  prepareExtend: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/storage", () => ({ uploadToBucket: mocks.upload }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaign }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: (_t: string, o: { size: string }) => (o.size === "1024x1024" ? 50 : 75) }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ imageMultiplierFor: () => 1 }) }));
vi.mock("@/composables/ai/useLikenessGate", () => ({ useLikenessGate: () => ({ ensureLikenessAck: mocks.ack }) }));
vi.mock("@/scriptorium/illuminator/lib/loadImage", () => ({ loadDomImage: async () => ({ naturalWidth: 1000, naturalHeight: 1000 }) }));
vi.mock("@/scriptorium/illuminator/lib/aiPictureCanvas", () => ({
  preparePicture: mocks.prepare,
  prepareExtend: mocks.prepareExtend,
  restoreOriginal: mocks.restore,
}));

import { useIlluminatePicture, useIlluminatePictureCost } from "./useIlluminatePicture";

const IMAGE_B64 = btoa("fake-webp-bytes");
const run = { baseUrl: "https://cdn/o.webp", documentId: "doc-1", campaignId: "campaign-1", userId: "u1" };

describe("useIlluminatePicture", () => {
  beforeEach(() => {
    for (const m of [mocks.invoke, mocks.upload, mocks.ack, mocks.prepare, mocks.prepareExtend, mocks.restore]) m.mockReset();
    mocks.campaign.isAiEnabled = true;
    mocks.campaign.activeCampaignId = "campaign-1";
    mocks.ack.mockResolvedValue(true);
    mocks.prepare.mockResolvedValue({ image: new Blob(["png"]), size: "1024x1024" });
    mocks.invoke.mockResolvedValue({ data: { image_b64: IMAGE_B64 }, error: null });
    mocks.upload.mockResolvedValue("https://cdn/u1/ill-ai-1.webp");
  });

  it("sends the campaign, document, action, size and picture, uploads the result and returns its URL", async () => {
    const { run: go, isGenerating } = useIlluminatePicture();
    const url = await go({ ...run, action: "cutout" });

    expect(url).toBe("https://cdn/u1/ill-ai-1.webp");
    expect(mocks.invoke).toHaveBeenCalledWith("illuminate-picture", {
      body: { campaign_id: "campaign-1", document_id: "doc-1", action: "cutout", size: "1024x1024", image_b64: btoa("png") },
    });
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({ bucket: "assetImages", contentType: "image/webp" });
    expect(mocks.upload.mock.calls[0][0].path).toMatch(/^u1\/ill-ai-[0-9a-f]{8}\.webp$/);
    expect(isGenerating.value).toBe(false);
  });

  // Bug: a book of another campaign (or an account-wide one) sent the active campaign's id and failed 404 server-side.
  it.each([["another campaign", "campaign-2"], ["an unnamed campaign", ""]])("refuses, with no request, for %s", async (_n, campaignId) => {
    await expect(useIlluminatePicture().run({ ...run, campaignId, action: "cutout" })).rejects.toThrow(/campaign/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  // Bug: AI-off campaigns could still reach the paid function through a stale panel.
  it("refuses, with no request, when AI is off for the campaign", async () => {
    mocks.campaign.isAiEnabled = false;
    await expect(useIlluminatePicture().run({ ...run, action: "cutout" })).rejects.toThrow(/disabled/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  // Bug: a restyle of a possible real person went out before the likeness notice was acknowledged.
  it("asks the likeness question for a restyle, and sends nothing when the author declines", async () => {
    mocks.ack.mockResolvedValue(false);
    expect(await useIlluminatePicture().run({ ...run, action: "ink" })).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("does not ask for cut out or extend, which change no likeness", async () => {
    await useIlluminatePicture().run({ ...run, action: "cutout" });
    expect(mocks.ack).not.toHaveBeenCalled();
  });

  it("match sends its look", async () => {
    await useIlluminatePicture().run({ ...run, action: "match", look: "grimoire" });
    expect(mocks.invoke.mock.calls[0][1].body.look).toBe("grimoire");
  });

  it("extend sends the padded picture with its mask, and lays the original back over the result", async () => {
    mocks.prepareExtend.mockResolvedValue({ image: new Blob(["field"]), mask: new Blob(["mask"]), size: "1536x1024" });
    mocks.restore.mockResolvedValue(new Blob(["restored"], { type: "image/webp" }));
    await useIlluminatePicture().run({ ...run, action: "extend", edge: "right" });

    const body = mocks.invoke.mock.calls[0][1].body;
    expect(body).toMatchObject({ action: "extend", size: "1536x1024", image_b64: btoa("field"), mask_b64: btoa("mask") });
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect(await (mocks.upload.mock.calls[0][0].blob as Blob).text()).toBe("restored");
  });

  it("extend needs an edge, and says so when the picture already fills it", async () => {
    await expect(useIlluminatePicture().run({ ...run, action: "extend" })).rejects.toThrow(/edge/);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("surfaces a server error and leaves it in `error`, uploading nothing", async () => {
    mocks.invoke.mockResolvedValue({ data: { image_b64: null, error: "rate_limited" }, error: null });
    const g = useIlluminatePicture();
    await expect(g.run({ ...run, action: "cutout" })).rejects.toThrow("rate_limited");
    expect(g.error.value).toBe("rate_limited");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(g.isGenerating.value).toBe(false);
  });

  it("fails when the upload returns no URL, so a missing URL never becomes a step", async () => {
    mocks.upload.mockResolvedValue(null);
    await expect(useIlluminatePicture().run({ ...run, action: "cutout" })).rejects.toThrow(/store/);
  });
});

describe("useIlluminatePictureCost", () => {
  it("prices by size, so a landscape action shows more than a square", () => {
    const { costFor } = useIlluminatePictureCost();
    expect(costFor("1024x1024")).toBe(50);
    expect(costFor("1536x1024")).toBe(75);
  });
});
