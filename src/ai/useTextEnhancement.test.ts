import { describe, it, expect, vi } from "vitest";
import { useTextEnhancement } from "./useTextEnhancement";

const campaignMock = { isAiEnabled: true, decryptedApiKey: "sk-test" as string | null, activeCampaign: null };
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignMock }));
vi.mock("./providers", () => ({ getTextProvider: () => ({ complete: vi.fn() }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ logUsage: vi.fn() }));

describe("useTextEnhancement", () => {
  it("offers Enhance only while AI is on and a key exists", () => {
    campaignMock.isAiEnabled = true;
    campaignMock.decryptedApiKey = "sk-test";
    expect(useTextEnhancement().hasTextProvider()).toBe(true);
    campaignMock.decryptedApiKey = null;
    expect(useTextEnhancement().hasTextProvider()).toBe(false);
  });

  it("hides Enhance and refuses to run when the campaign's AI is off, key or not", async () => {
    campaignMock.isAiEnabled = false;
    campaignMock.decryptedApiKey = "sk-test";
    const { hasTextProvider, enhance } = useTextEnhancement();
    expect(hasTextProvider()).toBe(false);
    await expect(enhance("text", "note")).rejects.toThrow("AI is off");
  });
});
