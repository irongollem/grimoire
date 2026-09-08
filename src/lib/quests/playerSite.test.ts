import { describe, it, expect } from "vitest";
import { resolveQuestSiteLocationId } from "./playerSite";
import type { StagedBeat } from "./playerSite";

function beat(overrides: Partial<StagedBeat> = {}): StagedBeat {
  return {
    id: "beat-a",
    visibility: "revealed",
    story_order: 0,
    staged_at_location_id: null,
    ...overrides,
  };
}

describe("resolveQuestSiteLocationId", () => {
  it("falls back to the quest's own location when no beat stages anywhere", () => {
    expect(resolveQuestSiteLocationId([beat()], "fallback-loc")).toBe("fallback-loc");
  });

  it("falls back when there are no beats at all", () => {
    expect(resolveQuestSiteLocationId([], "fallback-loc")).toBe("fallback-loc");
  });

  it("returns null when nothing stages and there is no fallback", () => {
    expect(resolveQuestSiteLocationId([beat()], null)).toBeNull();
  });

  it("prefers a revealed beat's staged site over the fallback", () => {
    const beats = [beat({ id: "b1", staged_at_location_id: "site-1" })];
    expect(resolveQuestSiteLocationId(beats, "fallback-loc")).toBe("site-1");
  });

  // The whole reason this data reaches the client at all: a rumor names a
  // scene the party hasn't had yet, and its place is exactly the spoiler the
  // RPC withholds. Even if a malformed cache slipped one through, the client
  // must not treat it as a candidate.
  it("ignores a rumored beat's staging even when the field is populated", () => {
    const beats = [beat({ id: "b1", visibility: "rumored", staged_at_location_id: "site-1" })];
    expect(resolveQuestSiteLocationId(beats, "fallback-loc")).toBe("fallback-loc");
  });

  it("picks the revealed beat furthest along the story, not the first one listed", () => {
    const beats = [
      beat({ id: "early", story_order: 0, staged_at_location_id: "site-early" }),
      beat({ id: "late", story_order: 5, staged_at_location_id: "site-late" }),
      beat({ id: "middle", story_order: 2, staged_at_location_id: "site-middle" }),
    ];
    expect(resolveQuestSiteLocationId(beats, null)).toBe("site-late");
  });

  it("skips a revealed beat that stages nowhere in favour of an earlier one that does", () => {
    const beats = [
      beat({ id: "staged", story_order: 1, staged_at_location_id: "site-1" }),
      beat({ id: "unstaged", story_order: 9, staged_at_location_id: null }),
    ];
    expect(resolveQuestSiteLocationId(beats, null)).toBe("site-1");
  });

  it("breaks a story_order tie deterministically, independent of input order", () => {
    const beats = [
      beat({ id: "zzz", story_order: 3, staged_at_location_id: "site-z" }),
      beat({ id: "aaa", story_order: 3, staged_at_location_id: "site-a" }),
    ];
    expect(resolveQuestSiteLocationId(beats, null)).toBe(
      resolveQuestSiteLocationId([...beats].reverse(), null),
    );
  });
});
