import { afterEach, describe, expect, it, vi } from "vitest";
import { fullCampaignUrl } from "./demoTeaser";

describe("fullCampaignUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when the env var is unset", () => {
    vi.stubEnv("VITE_FULL_CAMPAIGN_URL", undefined);
    expect(fullCampaignUrl()).toBeNull();
  });

  it("returns null when the env var is an empty string", () => {
    vi.stubEnv("VITE_FULL_CAMPAIGN_URL", "");
    expect(fullCampaignUrl()).toBeNull();
  });

  it("returns null when the env var is whitespace only", () => {
    vi.stubEnv("VITE_FULL_CAMPAIGN_URL", "   ");
    expect(fullCampaignUrl()).toBeNull();
  });

  it("returns the trimmed URL when set", () => {
    vi.stubEnv("VITE_FULL_CAMPAIGN_URL", "  https://dungeongrimoire.com/late-in-the-kind-country  ");
    expect(fullCampaignUrl()).toBe("https://dungeongrimoire.com/late-in-the-kind-country");
  });
});
