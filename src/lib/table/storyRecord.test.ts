import { describe, expect, it } from "vitest";
import {
  checkCorrection,
  checkNewFact,
  factAbout,
  factChains,
  factOrigin,
  groupRecord,
  type SittingInfo,
  type StoryFact,
  type StoryFactLink,
} from "./storyRecord";

let clock = 0;
const fact = (id: string, over: Partial<StoryFact> = {}): StoryFact => ({
  id,
  campaign_id: "c1",
  session_id: null,
  body: `fact ${id}`,
  known_to_player: true,
  supersedes_id: null,
  source: "table",
  created_at: `2026-11-10T10:00:${String(clock++).padStart(2, "0")}Z`,
  ...over,
});

const sittings = new Map<string, SittingInfo>([
  ["s1", { id: "s1", number: 1, title: null, played_on: "2026-11-01", started_at: null }],
  ["s2", { id: "s2", number: 2, title: "The Mere", played_on: null, started_at: "2026-11-08T19:00:00Z" }],
]);

describe("factChains", () => {
  // Bug caught: a closed fact listed apart from what overtook it, so the story cannot be checked backwards.
  it("follows a closed fact with the fact that overtook it", () => {
    const [chain] = factChains([fact("b", { supersedes_id: "a" }), fact("a")]);
    expect(chain!.map((e) => [e.fact.id, e.closed])).toEqual([["a", true], ["b", false]]);
  });

  // Bug caught: only one hop followed, so a second correction floats loose or the middle fact reads as current.
  it("reads a chain of two corrections in order, closing all but the last", () => {
    const [chain] = factChains([fact("c", { supersedes_id: "b" }), fact("a"), fact("b", { supersedes_id: "a" })]);
    expect(chain!.map((e) => [e.fact.id, e.closed])).toEqual([["a", true], ["b", true], ["c", false]]);
  });

  // Bug caught: a fact whose predecessor the reader cannot see vanishing because no root leads to it.
  it("starts a chain at a fact whose predecessor is not in the set", () => {
    const chains = factChains([fact("b", { supersedes_id: "hidden" })]);
    expect(chains).toHaveLength(1);
    expect(chains[0]![0]!.closed).toBe(false);
  });

  // Bug caught: two simultaneous corrections of one fact dropping one of them.
  it("keeps both when two facts overtook the same one", () => {
    const [chain] = factChains([fact("a"), fact("b", { supersedes_id: "a" }), fact("c", { supersedes_id: "a" })]);
    expect(chain!.map((e) => e.fact.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupRecord", () => {
  // Bug caught: facts filed in one sitting listed under another, or with no sitting hidden instead of named.
  it("groups facts under their session and those without one under Outside a session, newest session first", () => {
    const groups = groupRecord(
      [fact("a", { session_id: "s1" }), fact("b", { session_id: "s2" }), fact("c"), fact("d", { session_id: "s1" })],
      sittings,
    );
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.fact.id)])).toEqual([
      ["Session 1", ["a", "d"]],
      ["Session 2: The Mere", ["b"]],
      ["Outside a session", ["c"]],
    ]);
  });

  // Bug caught: "newest first" ordering by session number instead of what was filed last.
  it("puts the sitting with the newest fact first", () => {
    const groups = groupRecord([fact("a", { session_id: "s2" }), fact("b", { session_id: "s1" })], sittings);
    expect(groups.map((g) => g.key)).toEqual(["s1", "s2"]);
  });

  // Bug caught: the filter hiding a struck-through predecessor (or its successor) so half a correction shows.
  it("filters by text and keeps a matching fact's whole chain", () => {
    const facts = [
      fact("a", { body: "The bridge is standing" }),
      fact("b", { body: "The bridge burned down", supersedes_id: "a" }),
      fact("c", { body: "The innkeeper is called Mara" }),
    ];
    const groups = groupRecord(facts, sittings, "STANDING");
    expect(groups.flatMap((g) => g.entries.map((e) => e.fact.id))).toEqual(["a", "b"]);
  });

  // Bug caught: a player (who cannot read the session log) seeing facts vanish because their sitting has no row.
  it("keeps facts whose sitting the reader cannot read, labelled by the day they were filed", () => {
    const groups = groupRecord([fact("a", { session_id: "unknown", created_at: "2026-11-05T10:00:00Z" })], sittings);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("A session");
    expect(groups[0]!.date).toBe("2026-11-05T10:00:00Z");
  });

  // Bug caught: a chain split across sittings, leaving the correction in a different place from what it corrects.
  it("keeps a chain together in the sitting of its newest fact", () => {
    const groups = groupRecord(
      [fact("a", { session_id: "s1" }), fact("b", { session_id: "s2", supersedes_id: "a" })],
      sittings,
    );
    expect(groups.map((g) => g.key)).toEqual(["s2"]);
    expect(groups[0]!.entries.map((e) => e.fact.id)).toEqual(["a", "b"]);
  });
});

describe("checkCorrection", () => {
  // Bug caught: a "correction" that says what the record already says, which overtakes a fact with a copy of it.
  it("refuses text equal to the original, ignoring surrounding space", () => {
    expect(checkCorrection("The key is brass", "  The key is brass ").ok).toBe(false);
  });
  // Bug caught: an empty or over-long correction reaching the database check instead of the person.
  it("refuses blank and over-long text", () => {
    expect(checkCorrection("x", "   ").ok).toBe(false);
    expect(checkCorrection("x", "y".repeat(601)).ok).toBe(false);
    expect(checkCorrection("x", "y".repeat(600)).ok).toBe(true);
  });
  // Bug caught: the saved sentence keeping the stray space the person typed around it.
  it("hands back the trimmed sentence", () => {
    expect(checkCorrection("a", "  b ")).toEqual({ ok: true, body: "b" });
  });
  it("accepts a new fact within limits and refuses a blank one", () => {
    expect(checkNewFact("  ").ok).toBe(false);
    expect(checkNewFact(" the door is barred ")).toEqual({ ok: true, body: "the door is barred" });
  });
});

describe("factOrigin", () => {
  // Bug caught: a player's correction passing for the table's own filing, or the table's filing being marked.
  it("marks corrections and hand-added facts and leaves the table's unmarked", () => {
    expect(factOrigin("table")).toBeNull();
    expect(factOrigin("dm")).toBe("Added by hand");
    expect(factOrigin("correction")).toBe("Corrected by the player");
  });
});

describe("factAbout", () => {
  const link = (over: Partial<StoryFactLink>): StoryFactLink => ({
    id: "l", fact_id: "a", campaign_id: "c1", kind: "npc",
    npc_id: null, location_id: null, quest_id: null, quest_beat_id: null, item_id: null, monster_id: null, ...over,
  });
  // Bug caught: reading the wrong target column, so a place link points at an NPC page.
  it("reads the target column the kind names and skips kinds the page does not show", () => {
    expect(
      factAbout([
        link({ kind: "npc", npc_id: "n1" }),
        link({ kind: "location", location_id: "p1" }),
        link({ kind: "quest", quest_id: "q1" }),
        link({ kind: "item", item_id: "i1" }),
      ]),
    ).toEqual([{ kind: "npc", id: "n1" }, { kind: "location", id: "p1" }, { kind: "quest", id: "q1" }]);
  });
});
