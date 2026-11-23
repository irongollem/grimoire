import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { cluesToFind, forcesMoving, loreToTell, nothingTonight, threadsLeftOpen, tonight, type TonightInput } from "./canonTonight";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import type { CanonClue, CanonForceStep, CanonForceTick, CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

let n = 0;
const stamp = () => `2026-11-20T10:00:${String(n++ % 60).padStart(2, "0")}Z`;

const passage = (id: string, entry_id: string, over: Partial<CanonLorePassage> = {}): CanonLorePassage => ({
  id, user_id: "u", campaign_id: "c1", entry_id, title: `Passage ${id}`, body: null, sort_order: 0, player_visible_to: [],
  told_at: null, told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, author_id: null, ai_provenance: null,
  created_at: stamp(), updated_at: stamp(), ...over,
});
const clue = (id: string, secret_id: string, over: Partial<CanonClue> = {}): CanonClue => ({
  id, user_id: "u", campaign_id: "c1", secret_id, title: `Clue ${id}`, sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  found_at: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: stamp(), updated_at: stamp(), ...over,
});
const step = (id: string, force_id: string, sort_order: number, reached_at: string | null = null): CanonForceStep => ({
  id, user_id: "u", campaign_id: "c1", force_id, title: `Step ${id}`, sort_order, reached_at, reached_session_id: null, ai_provenance: null,
  created_at: stamp(), updated_at: stamp(),
});
const tick = (force_id: string, delta: number): CanonForceTick => ({
  id: `t${n++}`, user_id: "u", campaign_id: "c1", force_id, delta, note: "", session_id: null, step_id: null,
  world_year: null, world_month: null, world_day: null, created_at: stamp(),
});
const member = (id: string, over: Partial<PartyMember> = {}): PartyMember => ({ id, name: `Hero ${id}`, owner_user_id: "player1", ...over }) as PartyMember;
const fact = (id: string): StoryFact => ({
  id, campaign_id: "c1", session_id: "s1", body: id, known_to_player: true, supersedes_id: null, source: "table",
  kept_at: null, struck_at: null, created_at: stamp(),
});

const lore = canonEntry({ id: "L1", part: "lore", title: "The Drowned Bell" });

describe("loreToTell", () => {
  // Bug caught: an entry's first passage listed, though it is told with the entry and offers no Tell button.
  it("never lists an entry's first passage but lists a later untold one", () => {
    const passages = [passage("p1", "L1", { sort_order: 0, location_id: "loc1" }), passage("p2", "L1", { sort_order: 1, location_id: "loc1" })];
    const groups = loreToTell([lore], passages);
    expect(groups.flatMap((g) => g.items.map((i) => i.passageId))).toEqual(["p2"]);
  });

  // Bug caught: the first passage judged by array position, so a later-written first passage was listed instead.
  it("takes the first passage by sort order, not by where it sits in the list", () => {
    const passages = [passage("late", "L1", { sort_order: 1, npc_id: "n1" }), passage("early", "L1", { sort_order: 0, npc_id: "n1" })];
    expect(loreToTell([lore], passages).flatMap((g) => g.items.map((i) => i.passageId))).toEqual(["late"]);
  });

  // Bug caught: a passage already told listed again.
  it("leaves out a told passage", () => {
    const passages = [passage("p1", "L1"), passage("p2", "L1", { sort_order: 1, location_id: "loc1", told_at: "2026-11-21T10:00:00Z" })];
    expect(loreToTell([lore], passages)).toEqual([]);
  });

  // Bug caught: passages that come out nowhere listed, with no place to group them under or cue to tell them.
  it("leaves out a passage that comes out nowhere", () => {
    const passages = [passage("p1", "L1"), passage("p2", "L1", { sort_order: 1 })];
    expect(loreToTell([lore], passages)).toEqual([]);
  });

  // Bug caught: a backstory's passages ignored because only part "lore" was read.
  it("lists a DM backstory passage and carries its entry's title", () => {
    const backstory = canonEntry({ id: "B1", part: "backstory", title: "Tansy", party_member_id: "m1" });
    const passages = [passage("b1", "B1"), passage("b2", "B1", { sort_order: 1, quest_beat_id: "beat1" })];
    const [group] = loreToTell([backstory], passages);
    expect(group?.at).toEqual({ location_id: null, npc_id: null, quest_beat_id: "beat1" });
    expect(group?.items[0]).toMatchObject({ entryId: "B1", entryTitle: "Tansy" });
  });

  // Bug caught: passages of a truth or a deleted entry listed under a title that is not lore.
  it("leaves out a passage whose entry is not lore or a backstory", () => {
    const truth = canonEntry({ id: "T1", part: "truth" });
    expect(loreToTell([truth], [passage("p1", "T1"), passage("p2", "T1", { sort_order: 1, location_id: "loc1" })])).toEqual([]);
  });

  // Bug caught: two passages at one place shown as two groups, so the place is named twice.
  it("groups passages by where they come out, places before people", () => {
    const passages = [
      passage("p0", "L1"),
      passage("a", "L1", { sort_order: 1, npc_id: "n1" }),
      passage("b", "L1", { sort_order: 2, location_id: "loc1" }),
      passage("c", "L1", { sort_order: 3, location_id: "loc1" }),
    ];
    const groups = loreToTell([lore], passages);
    expect(groups.map((g) => g.items.map((i) => i.passageId))).toEqual([["b", "c"], ["a"]]);
  });
});

describe("cluesToFind", () => {
  const secret = canonEntry({ id: "S1", part: "secret", title: "The bell is hollow" });

  // Bug caught: a clue already found listed as still to find.
  it("leaves out a found clue", () => {
    expect(cluesToFind([secret], [clue("c1", "S1", { location_id: "loc1", found_at: "2026-11-21T10:00:00Z" })], [])).toEqual([]);
  });

  // Bug caught: clues of a secret the party already knows kept on the list.
  it("leaves out the clues of a revealed secret", () => {
    const revealed = canonEntry({ id: "S1", part: "secret", revealed_at: "2026-11-21T10:00:00Z" });
    expect(cluesToFind([revealed], [clue("c1", "S1", { location_id: "loc1" })], [])).toEqual([]);
  });

  // Bug caught: a clue that is a lore passage filed under "Not placed anywhere yet" because its own place is empty.
  it("groups a clue that is a lore passage where the passage comes out", () => {
    const p = passage("p2", "L1", { sort_order: 1, npc_id: "n9" });
    const [group] = cluesToFind([secret], [clue("c1", "S1", { passage_id: "p2" })], [p]);
    expect(group?.at).toEqual({ location_id: null, npc_id: "n9", quest_beat_id: null });
  });

  // Bug caught: unplaced clues shown first, ahead of the ones with a place to go and look.
  it("puts what is not placed anywhere last, naming the secret", () => {
    const clues = [clue("loose", "S1"), clue("placed", "S1", { location_id: "loc1" })];
    const groups = cluesToFind([secret], clues, []);
    expect(groups.map((g) => g.at === null)).toEqual([false, true]);
    expect(groups[1]?.items[0]).toMatchObject({ clueId: "loose", secretId: "S1", secretTitle: "The bell is hollow" });
  });
});

describe("forcesMoving", () => {
  const force = canonEntry({ id: "F1", part: "force", title: "The Tithe Court", clock_size: 4 });

  // Bug caught: an ended force still listed as something that moves.
  it("leaves out an ended force", () => {
    const ended = canonEntry({ id: "F2", part: "force", closed_as: "stopped", closed_at: "2026-11-21T10:00:00Z" });
    expect(forcesMoving([ended], [], []).map((f) => f.entryId)).toEqual([]);
  });

  // Bug caught: the next step taken as the first in list order, or a reached step offered as next.
  it("names the first unreached step in order", () => {
    const steps = [step("s3", "F1", 2), step("s1", "F1", 0, "2026-11-20T10:00:00Z"), step("s2", "F1", 1), step("x", "F9", 0)];
    expect(forcesMoving([force], steps, [])[0]?.nextStep).toBe("Step s2");
  });

  // Bug caught: a force with no steps written showing another force's step or the word "undefined".
  it("has no next step when none is written", () => {
    expect(forcesMoving([force], [step("x", "F9", 0)], [])[0]?.nextStep).toBeNull();
  });

  // Bug caught: the clock counted from every force's ticks, and a full clock not flagged.
  it("counts only its own ticks and flags a full clock", () => {
    const ticks = [tick("F1", 2), tick("F1", 2), tick("F9", -1)];
    expect(forcesMoving([force], [], ticks)[0]?.clock).toEqual({ filled: 4, size: 4, full: true });
    expect(forcesMoving([force], [], [tick("F1", 3)])[0]?.clock).toEqual({ filled: 3, size: 4, full: false });
  });

  // Bug caught: a force with no clock shown as "0 of 0" and flagged full.
  it("has no clock when the force has none", () => {
    expect(forcesMoving([canonEntry({ id: "F3", part: "force" })], [], [])[0]?.clock).toBeNull();
  });
});

describe("threadsLeftOpen", () => {
  const backstory = canonEntry({ id: "B1", part: "backstory", title: "Tansy", party_member_id: "m1" });
  const question = canonEntry({ id: "Q1", part: "question", title: "Who burned the mill?" });
  const link = { from_kind: "canon", from_id: "B1", to_kind: "canon", to_id: "Q1", type: "related_to" } as const;

  // Bug caught: a character with nothing open still listed, so the block is a column of empty names.
  it("leaves out a character with no open thread and no untold passage", () => {
    const passages = [passage("b1", "B1", { told_at: "2026-11-21T10:00:00Z" })];
    expect(threadsLeftOpen([backstory], passages, [member("m1")], [])).toEqual([]);
  });

  // Bug caught: the player's own untold passage counted as the DM's to tell, and the open thread dropped.
  it("lists the open threads and counts only the DM's untold passages", () => {
    const passages = [passage("dm", "B1"), passage("mine", "B1", { author_id: "player1" }), passage("told", "B1", { told_at: "2026-11-21T10:00:00Z" })];
    expect(threadsLeftOpen([backstory, question], passages, [member("m1")], [link])).toEqual([
      { memberId: "m1", name: "Hero m1", threads: ["Who burned the mill?"], untoldPassages: 1 },
    ]);
  });
});

describe("tonight", () => {
  const empty: TonightInput = { entries: [], passages: [], clues: [], steps: [], ticks: [], party: [], links: [], facts: [] };

  // Bug caught: the table block present at zero, or counting reviewed facts.
  it("has no table block at zero and counts unreviewed facts above it", () => {
    expect(tonight(empty).tableUnreviewed).toBe(0);
    expect(tonight({ ...empty, facts: [fact("a"), { ...fact("b"), kept_at: "2026-11-21T10:00:00Z" }] }).tableUnreviewed).toBe(1);
  });

  // Bug caught: the empty state shown while one block still has something, or not shown when all are empty.
  it("is nothing only when every block is empty", () => {
    expect(nothingTonight(tonight(empty))).toBe(true);
    expect(nothingTonight(tonight({ ...empty, facts: [fact("a")] }))).toBe(false);
    expect(nothingTonight(tonight({ ...empty, entries: [canonEntry({ id: "F1", part: "force" })] }))).toBe(false);
  });
});
