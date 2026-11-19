import { describe, expect, it } from "vitest";
import { resumeOf, type ResumableSitting } from "./resume";

const sitting = (id: string, over: Partial<ResumableSitting> = {}): ResumableSitting => ({
  id, party_member_id: "rosie", scene_location_id: "workshop", left_at: "2026-11-17T05:00:00Z", ...over,
});
const party = new Set(["rosie", "fresco"]);

describe("resumeOf", () => {
  // Bug caught: asking who you play and where again, when the last sitting already says both.
  it("begins again as the same character where the party was left", () => {
    expect(resumeOf([sitting("new"), sitting("old", { party_member_id: "fresco", scene_location_id: "inn" })], party)).toEqual({
      kind: "again", characterId: "rosie", placeId: "workshop",
    });
  });

  // Bug caught: a sitting that was never left started over as a new conversation, losing the story on the page.
  it("reopens the last sitting itself when it was never left", () => {
    expect(resumeOf([sitting("open", { left_at: null })], party)).toEqual({ kind: "open", sessionId: "open", characterId: "rosie" });
  });

  // Bug caught: an older sitting that was never left hijacking the table after a newer one was played and left.
  it("goes by the newest sitting, not by any older one left open", () => {
    expect(resumeOf([sitting("new"), sitting("stale", { left_at: null })], party).kind).toBe("again");
  });

  // Bug caught: resuming a character who was deleted from the party, onto a screen that cannot be played.
  it("passes over a sitting whose character is gone", () => {
    expect(resumeOf([sitting("ghost", { party_member_id: "gone", left_at: null }), sitting("ok")], party)).toEqual({
      kind: "again", characterId: "rosie", placeId: "workshop",
    });
    expect(resumeOf([sitting("ghost", { party_member_id: null })], party)).toEqual({ kind: "first" });
  });

  it("has nothing to pick up before the first sitting", () => {
    expect(resumeOf([], party)).toEqual({ kind: "first" });
  });

  it("begins again with no place when the party had none", () => {
    expect(resumeOf([sitting("s", { scene_location_id: null })], party)).toEqual({ kind: "again", characterId: "rosie", placeId: null });
  });
});
