import { describe, expect, it } from "vitest";
import { factReview, isAlreadyATruth, keepPatch, strikePatch, tableGroups, truthByFact, truthFromFact, undoStrikePatch, unreviewedCount } from "./canonTableFacts";
import type { SittingInfo, StoryFact } from "@/lib/table/solo/storyRecord";

let clock = 0;
const fact = (id: string, over: Partial<StoryFact> = {}): StoryFact => ({
  id, campaign_id: "c1", session_id: "s1", body: `Fact ${id}`, known_to_player: true, supersedes_id: null, source: "table",
  kept_at: null, struck_at: null, created_at: `2026-11-10T10:00:${String(clock++).padStart(2, "0")}Z`, ...over,
});
const sittings = new Map<string, SittingInfo>([["s1", { id: "s1", number: 14, title: null, played_on: "2026-11-18", started_at: null }]]);
const ids = (facts: StoryFact[], filter: Parameters<typeof tableGroups>[2], keep?: Set<string>) =>
  tableGroups(facts, sittings, filter, keep).flatMap((g) => g.entries.map((e) => e.fact.id));

describe("unreviewedCount", () => {
  // Bug caught: the badge counting kept, struck and corrected lines, so it never reached zero after a review.
  it("counts only the table's facts nobody has kept, struck or corrected", () => {
    const facts = [
      fact("new"),
      fact("kept", { kept_at: "2026-11-11T10:00:00Z" }),
      fact("struck", { struck_at: "2026-11-11T10:00:00Z" }),
      fact("old"),
      fact("fix", { source: "correction", supersedes_id: "old" }),
      fact("dm", { source: "dm" }),
    ];
    expect(unreviewedCount(facts)).toBe(1);
  });
});

describe("factReview", () => {
  // Bug caught: a struck fact that was also kept reading as kept, so a strike did not take.
  it("lets a strike win over a keep", () => {
    expect(factReview(fact("a", { kept_at: "x", struck_at: "y" }), false)).toBe("struck");
  });
});

describe("tableGroups", () => {
  const facts = [fact("new"), fact("kept", { kept_at: "2026-11-11T10:00:00Z" }), fact("struck", { struck_at: "2026-11-11T10:00:00Z" })];

  // Bug caught: a filter showing another status's lines.
  it("shows each filter's own lines, and everything under All", () => {
    expect(ids(facts, "new")).toEqual(["new"]);
    expect(ids(facts, "kept")).toEqual(["kept"]);
    expect(ids(facts, "struck")).toEqual(["struck"]);
    expect(ids(facts, "all").sort()).toEqual(["kept", "new", "struck"]);
  });

  // Bug caught: the DM's own and a player's corrected facts listed as the table's additions.
  it("lists only facts the Narrator started", () => {
    expect(ids([fact("dm", { source: "dm" })], "all")).toEqual([]);
  });

  // Bug caught: a line vanishing from the New list the moment it was struck, taking its Undo with it.
  it("keeps a line the DM just acted on in the list under any filter", () => {
    expect(ids(facts, "new", new Set(["struck"])).sort()).toEqual(["new", "struck"]);
  });

  // Bug caught: Edit hiding the original with the version that overtook it, so the DM could not see what changed.
  it("shows a corrected fact whole with its version, under Kept and not under New", () => {
    const chain = [fact("old"), fact("fix", { source: "correction", supersedes_id: "old" })];
    expect(ids(chain, "kept")).toEqual(["old", "fix"]);
    expect(ids(chain, "new")).toEqual([]);
  });

  // Bug caught: the list not grouped by session, newest first.
  it("groups by session", () => {
    const groups = tableGroups([fact("a"), fact("b", { session_id: "s2" })], sittings, "all");
    expect(groups.map((g) => g.key).sort()).toEqual(["s1", "s2"]);
  });
});

describe("review writes", () => {
  // Bug caught: a keep and a strike on one row, which the table refuses (kept_at and struck_at never both).
  it("keeps clear the strike and strikes clear the keep", () => {
    expect(keepPatch().struck_at).toBeNull();
    expect(strikePatch().kept_at).toBeNull();
    expect(strikePatch().struck_at).not.toBeNull();
  });

  // Bug caught: Undo leaving the fact struck, or throwing away a keep the fact had before.
  it("undoes a strike by clearing it and giving back the earlier keep", () => {
    expect(undoStrikePatch(null)).toEqual({ struck_at: null, kept_at: null });
    expect(undoStrikePatch("2026-11-11T10:00:00Z")).toEqual({ struck_at: null, kept_at: "2026-11-11T10:00:00Z" });
  });

  // Bug caught: a fact the party already knows filed as a secret truth (or a hidden one told to everyone).
  it("makes a truth known to all when the party knows the fact, and secret when they do not", () => {
    expect(truthFromFact({ id: "f1", body: "The ferry takes a sentence", known_to_player: true })).toMatchObject({ part: "truth", knowledge: "all", title: "The ferry takes a sentence" });
    expect(truthFromFact({ id: "f2", body: "Bells ring backwards", known_to_player: false }).knowledge).toBe("secret");
  });

  // Bug caught (#1255 item 22): the truth not remembering its fact, so the fact could be filed again.
  it("names the fact a truth was made from", () => {
    expect(truthFromFact({ id: "f1", body: "x", known_to_player: true }).from_fact_id).toBe("f1");
  });

  // Bug caught: a truth that never came from a fact (null) listed as the truth of a fact, hiding Make it a truth on the wrong lines.
  it("maps each fact to its truth, and leaves out truths that were written by hand", () => {
    const map = truthByFact([{ id: "t1", from_fact_id: "f1" }, { id: "t2", from_fact_id: null }]);
    expect([...map]).toEqual([["f1", "t1"]]);
  });

  // Bug caught: the second truth from one fact (two tabs) reported as a generic failure.
  it("tells the unique-index refusal from any other error", () => {
    expect(isAlreadyATruth({ code: "23505" })).toBe(true);
    expect(isAlreadyATruth({ code: "23514" })).toBe(false);
    expect(isAlreadyATruth(new Error("boom"))).toBe(false);
  });
});
