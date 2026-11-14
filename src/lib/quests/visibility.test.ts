import { describe, expect, it } from "vitest";
import { audienceLabel, partyBeatIdsOf, questAudienceOf, toggleAudienceMember, reachedBeatIdsOf, visibilityFloor, visibilityRank } from "./visibility";

const edges = [{ source_beat_id: "here", target_beat_id: "next" }];
const base = { beatId: "next", partyBeatIds: new Set(["here"]), reachedBeatIds: new Set<string>(), edges, secret: false };

describe("visibilityFloor", () => {
  it("is revealed for a beat the party stands on", () => {
    expect(visibilityFloor({ ...base, beatId: "here" })).toBe("revealed");
  });
  it("is revealed for a beat the party has already reached", () => {
    expect(visibilityFloor({ ...base, beatId: "old", reachedBeatIds: new Set(["old"]) })).toBe("revealed");
  });
  it("is rumored one route ahead of the party", () => {
    expect(visibilityFloor(base)).toBe("rumored");
  });
  it("stays hidden one route ahead when the beat is secret", () => {
    expect(visibilityFloor({ ...base, secret: true })).toBe("hidden");
  });
  it("is hidden when only a beat the party is not on leads to it", () => {
    expect(visibilityFloor({ ...base, edges: [{ source_beat_id: "elsewhere", target_beat_id: "next" }] })).toBe("hidden");
  });
});

describe("visibilityRank", () => {
  it("orders hidden below rumored below revealed", () => {
    expect([visibilityRank("hidden"), visibilityRank("rumored"), visibilityRank("revealed")]).toEqual([0, 1, 2]);
  });
});

describe("partyBeatIdsOf / reachedBeatIdsOf", () => {
  // Fails if a thread with no cursor (null) counts as the party standing on a beat called "null".
  it("leaves out threads that stand nowhere", () => {
    expect([...partyBeatIdsOf({ t1: "b1", t2: null })]).toEqual(["b1"]);
  });
  // Fails if a transition with no destination (a quest-level step) is read as reaching a beat.
  it("collects the beats the party arrived at, once each", () => {
    expect([...reachedBeatIdsOf([{ to_beat_id: "b1" }, { to_beat_id: null }, { to_beat_id: "b1" }])]).toEqual(["b1"]);
  });
});

const MEMBERS = [{ id: "a", name: "Brannigan" }, { id: "b", name: "Edda" }, { id: "c", name: "Corin" }];

describe("questAudienceOf", () => {
  // Fails if a hidden beat's audience leaks into the quest's, or an unshown quest is not hidden.
  it("ignores hidden beats", () => {
    expect(questAudienceOf([{ visibility: "hidden", visible_to: ["a"] }])).toEqual({ kind: "hidden" });
    expect(questAudienceOf([])).toEqual({ kind: "hidden" });
  });
  // Fails if a members-only beat narrows a quest that another shown beat gives to everyone.
  it("lets a whole-party beat win", () => {
    expect(questAudienceOf([{ visibility: "revealed", visible_to: ["a"] }, { visibility: "rumored", visible_to: null }])).toEqual({ kind: "party" });
  });
  // Fails if the union drops a member or repeats one.
  it("unions the members of shown beats", () => {
    expect(questAudienceOf([{ visibility: "revealed", visible_to: ["a", "b"] }, { visibility: "rumored", visible_to: ["b", "c"] }])).toEqual({ kind: "members", memberIds: ["a", "b", "c"] });
  });
});

describe("audienceLabel", () => {
  // Fails if null stops reading as the whole party or names are not joined.
  it("names the whole party, one, two, or counts", () => {
    expect(audienceLabel(null, MEMBERS)).toBe("Whole party");
    expect(audienceLabel(["a"], MEMBERS)).toBe("Brannigan");
    expect(audienceLabel(["a", "b"], MEMBERS)).toBe("Brannigan and Edda");
    expect(audienceLabel(["a", "b", "c"], MEMBERS)).toBe("3 of 3");
    expect(audienceLabel(["gone"], MEMBERS)).toBe("1 of 3");
  });
});

describe("toggleAudienceMember", () => {
  // Fails if unticking from the whole party does not leave everyone else.
  it("unticks one from the whole party", () => {
    expect(toggleAudienceMember(null, "b", MEMBERS)).toEqual(["a", "c"]);
  });
  // Fails if ticking the last missing member leaves an explicit full list instead of the whole party.
  it("returns to the whole party when everyone is ticked", () => {
    expect(toggleAudienceMember(["a", "b"], "c", MEMBERS)).toBeNull();
  });
  // Fails if the last member can be unticked (an empty audience).
  it("keeps the last member", () => {
    expect(toggleAudienceMember(["a"], "a", MEMBERS)).toEqual(["a"]);
  });
});
