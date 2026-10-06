import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/lib/nav";

describe("the campaign nav group", () => {
  const campaign = NAV_GROUPS.find((g) => g.label === "Campaign");

  it("ends with Sessions directly above Settings", () => {
    const labels = campaign?.items.map((i) => i.label) ?? [];
    expect(labels.slice(-2)).toEqual(["Sessions", "Settings"]);
  });

  it("gates Sessions on an active campaign", () => {
    const sessions = campaign?.items.find((i) => i.to === "/sessions");
    expect(sessions?.requiresCampaign).toBe(true);
  });
});
