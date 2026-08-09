import { describe, expect, it } from "vitest";
import { safeQuestReturnTo, withQuestReturnTo } from "./navigation";

describe("quest return navigation", () => {
  it("keeps local beat return URLs and rejects external redirects", () => {
    expect(safeQuestReturnTo("/quests/q?mode=build&beat=b", "/quests/q")).toContain("beat=b");
    expect(safeQuestReturnTo("https://evil.invalid", "/quests/q")).toBe("/quests/q");
    expect(safeQuestReturnTo("//evil.invalid", "/quests/q")).toBe("/quests/q");
  });

  it("preserves specialist query strings", () => {
    expect(withQuestReturnTo("/quests/q?edit=true", "/quests/q/beats/b")).toBe(
      "/quests/q?edit=true&returnTo=%2Fquests%2Fq%2Fbeats%2Fb",
    );
  });
});
