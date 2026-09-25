import { describe, expect, it } from "vitest";
import { isDemoOutdated, isDemoStatus, type DemoStatus } from "./useDemoCampaign";

function status(patch: Partial<DemoStatus> = {}): DemoStatus {
  return {
    published: true,
    version: "2026-09-25T00:00:00Z",
    demo_campaign_id: "campaign-1",
    loaded_version: "2026-09-25T00:00:00Z",
    ...patch,
  };
}

describe("isDemoStatus", () => {
  it("accepts what get_demo_status returns", () => {
    expect(isDemoStatus(status())).toBe(true);
    expect(isDemoStatus(status({ published: false, version: null, demo_campaign_id: null, loaded_version: null }))).toBe(true);
  });

  it("rejects anything else rather than guessing", () => {
    expect(isDemoStatus(null)).toBe(false);
    expect(isDemoStatus("published")).toBe(false);
    expect(isDemoStatus({ ...status(), published: "yes" })).toBe(false);
    expect(isDemoStatus({ ...status(), version: 3 })).toBe(false);
  });
});

describe("isDemoOutdated", () => {
  it("is false for a copy of the current version", () => {
    expect(isDemoOutdated(status())).toBe(false);
  });

  it("is true once the template has been republished", () => {
    expect(isDemoOutdated(status({ version: "2026-10-01T00:00:00Z" }))).toBe(true);
  });

  // Nothing to be out of date with: no copy, or no demo published any more.
  it("is false without a copy or without a published demo", () => {
    expect(isDemoOutdated(status({ loaded_version: null, demo_campaign_id: null }))).toBe(false);
    expect(isDemoOutdated(status({ published: false, version: null }))).toBe(false);
  });
});
