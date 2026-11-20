import { describe, expect, it } from "vitest";
import { inWrittenOrder, isPlayersPassage, passageByline, sharedWith, writtenWhen } from "./canonBackstory";

const sessions = [
  { number: 14, started_at: "2026-10-01T18:00:00Z" },
  { number: 15, started_at: "2026-10-08T18:00:00Z" },
  { number: 16, started_at: "2026-10-15T18:00:00Z" },
];

describe("writtenWhen", () => {
  // Bug caught: a passage written between sessions dated to the session after it (or the first), so "after session 15"
  // read as the story's wrong chapter.
  it("is after the latest session that had started before the passage, whatever order the log arrives in", () => {
    expect(writtenWhen("2026-10-10T09:00:00Z", [...sessions].reverse())).toBe("after session 15");
    expect(writtenWhen("2026-10-20T09:00:00Z", sessions)).toBe("after session 16");
  });

  it("is before play when no session had started yet", () => {
    expect(writtenWhen("2026-09-01T09:00:00Z", sessions)).toBe("before play");
    expect(writtenWhen("2026-09-01T09:00:00Z", [])).toBe("before play");
  });

  // Bug caught: a session logged by hand (never started in the app) counted as the latest, so everything after it
  // claimed to follow a session that cannot be placed in time.
  it("skips a session that was never started in the app, and says 'a session' for an unnumbered one", () => {
    expect(writtenWhen("2026-10-10T09:00:00Z", [...sessions, { number: 99, started_at: null }])).toBe("after session 15");
    expect(writtenWhen("2026-10-10T09:00:00Z", [{ number: 99, started_at: null }])).toBe("before play");
    expect(writtenWhen("2026-10-10T09:00:00Z", [{ number: null, started_at: "2026-10-09T18:00:00Z" }])).toBe("after a session");
  });
});

describe("whose passage", () => {
  const member = { owner_user_id: "lotte", player_name: "Lotte" };

  it("is the player's when the author is the character's owner", () => {
    expect(isPlayersPassage({ author_id: "lotte" }, member)).toBe(true);
    expect(isPlayersPassage({ author_id: "dm" }, member)).toBe(false);
  });

  // Bug caught: two nulls compared equal, so every passage of an unowned character (or of a deleted account) read as the player's.
  it("is nobody's but the DM's when either side is unknown", () => {
    expect(isPlayersPassage({ author_id: null }, { owner_user_id: null })).toBe(false);
    expect(isPlayersPassage({ author_id: "dm" }, { owner_user_id: null })).toBe(false);
    expect(isPlayersPassage({ author_id: null }, member)).toBe(false);
  });

  it("writes the byline the frame draws: the player and when, or 'Your passage'", () => {
    expect(passageByline({ author_id: "lotte", created_at: "2026-10-10T09:00:00Z" }, member, sessions)).toBe("Written by Lotte · after session 15");
    expect(passageByline({ author_id: "lotte", created_at: "2026-09-01T09:00:00Z" }, member, sessions)).toBe("Written by Lotte · before play");
    expect(passageByline({ author_id: "dm", created_at: "2026-10-10T09:00:00Z" }, member, sessions)).toBe("Your passage");
  });
});

describe("sharedWith", () => {
  // Bug caught: the toggle off still told the whole party, which is the one thing a private passage must not do.
  it("is the character alone when not shared, and always includes them when shared, once", () => {
    expect(sharedWith("m1", ["m1", "m2", "m3"], false)).toEqual(["m1"]);
    expect(sharedWith("m1", ["m1", "m2", "m3"], true)).toEqual(["m1", "m2", "m3"]);
    // A party list that has not loaded yet must not drop the writer's own character.
    expect(sharedWith("m1", [], true)).toEqual(["m1"]);
  });
});

describe("inWrittenOrder", () => {
  it("puts the story in the order it grew, the DM's order breaking a tie", () => {
    const rows = [
      { id: "c", written_at: "2026-10-09", sort_order: 0 },
      { id: "b", written_at: "2026-10-01", sort_order: 2 },
      { id: "a", written_at: "2026-10-01", sort_order: 1 },
    ];
    expect(inWrittenOrder(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
