import { beforeEach, describe, expect, it, vi } from "vitest";

const campaignMock = vi.hoisted(() => ({ activeCampaign: { id: "c1" } as { id: string } | null }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignMock }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/ai/useImageJob", () => ({ waitForImageJob: vi.fn() }));

import {
  captureFailureMessage,
  captureImageGenerationContext,
  NoActiveCampaignError,
} from "./useImageGeneration";

beforeEach(() => {
  campaignMock.activeCampaign = { id: "c1" };
});

describe("captureImageGenerationContext", () => {
  it("captures the active campaign's id, the only thing the server job needs from the client", async () => {
    expect(await captureImageGenerationContext()).toEqual({ campaignId: "c1" });
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

  it("shows another error's own message, never the no-campaign sentence", () => {
    expect(captureFailureMessage(new Error("permission denied for canon_entries"))).toBe(
      "permission denied for canon_entries",
    );
  });
});
