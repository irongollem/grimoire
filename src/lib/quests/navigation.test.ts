import { describe, expect, it } from "vitest";
import { questLink, questLinkHref, safeQuestReturnTo, withQuestReturnTo } from "./navigation";

describe("quest return navigation", () => {
  it("keeps local beat return URLs and rejects external redirects", () => {
    expect(safeQuestReturnTo("/quests/q?mode=build&beat=b", "/quests/q")).toContain("beat=b");
    expect(safeQuestReturnTo("https://evil.invalid", "/quests/q")).toBe("/quests/q");
    expect(safeQuestReturnTo("//evil.invalid", "/quests/q")).toBe("/quests/q");
    expect(safeQuestReturnTo(undefined, "/quests/q")).toBe("/quests/q");
    expect(safeQuestReturnTo(["/quests/other"], "/quests/q")).toBe("/quests/q");
  });

  it("starts a query string on a path that has none", () => {
    expect(withQuestReturnTo("/quests/q", "/quests/q/beats/b")).toBe("/quests/q?returnTo=%2Fquests%2Fq%2Fbeats%2Fb");
  });

  it("preserves specialist query strings", () => {
    expect(withQuestReturnTo("/quests/q?edit=true", "/quests/q/beats/b")).toBe(
      "/quests/q?edit=true&returnTo=%2Fquests%2Fq%2Fbeats%2Fb",
    );
  });

});

describe("questLink", () => {
  it("selects a beat with ?beat= and opens it with open=1", () => {
    expect(questLink("q", { beat: "b" })).toEqual({ path: "/quests/q", query: { beat: "b" } });
    expect(questLink("q", { beat: "b", open: true })).toEqual({ path: "/quests/q", query: { beat: "b", open: "1" } });
  });

  it("opens the quest's own wide part with open and no beat, and never on a route", () => {
    expect(questLink("q", { open: true })).toEqual({ path: "/quests/q", query: { open: "1" } });
    expect(questLink("q", { edge: "e", open: true })).toEqual({ path: "/quests/q", query: { edge: "e" } });
  });

  it("names a route with ?edge= and the party's beat with open=party plus its thread", () => {
    expect(questLink("q", { edge: "e" })).toEqual({ path: "/quests/q", query: { edge: "e" } });
    expect(questLink("q", { party: true, thread: "t" })).toEqual({ path: "/quests/q", query: { open: "party", thread: "t" } });
  });

  it("renders the same link as a string for a returnTo", () => {
    expect(questLinkHref("q", { beat: "b", open: true })).toBe("/quests/q?beat=b&open=1");
    expect(questLinkHref("q")).toBe("/quests/q");
  });
});
