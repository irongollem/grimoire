import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { activeQuestBeatIds, cluesToFind, forcesMoving, looseEnds, loreToTell, nothingTonight, placesWithin, plannedItems, scopeCounts, scopeHidAll, scopeTonight, stepDueState, threadsLeftOpen, tonight, withoutDone, type LooseEndsInput, type TonightInput, type TonightScopeContext } from "./canonTonight";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import type { CanonClue, CanonForceStep, CanonForceTick, CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

let n = 0;
const stamp = () => `2026-11-20T10:00:${String(n++ % 60).padStart(2, "0")}Z`;

const passage = (id: string, entry_id: string, over: Partial<CanonLorePassage> = {}): CanonLorePassage => ({
  id, user_id: "u", campaign_id: "c1", entry_id, title: `Passage ${id}`, body: null, sort_order: 0, player_visible_to: [],
  told_at: null, told_session_id: null, location_id: null, npc_id: null, quest_beat_id: null, author_id: null, dm_edited_at: null, body_before_dm_edit: null, ai_provenance: null,
  created_at: stamp(), updated_at: stamp(), ...over,
});
const clue = (id: string, secret_id: string, over: Partial<CanonClue> = {}): CanonClue => ({
  id, user_id: "u", campaign_id: "c1", secret_id, title: `Clue ${id}`, sort_order: 0, location_id: null, npc_id: null, quest_beat_id: null,
  found_at: null, item_id: null, document_id: null, found_session_id: null, passage_id: null, ai_provenance: null, created_at: stamp(), updated_at: stamp(), ...over,
});
const step = (id: string, force_id: string, sort_order: number, reached_at: string | null = null): CanonForceStep => ({
  id, user_id: "u", campaign_id: "c1", force_id, title: `Step ${id}`, sort_order, reached_at, reached_session_id: null, due_year: null, due_month: null, due_day: null, calendar_event_id: null, ai_provenance: null,
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
    expect(group?.at).toEqual({ location_id: null, npc_id: null, quest_beat_id: "beat1", item_id: null, document_id: null });
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
    expect(group?.at).toEqual({ location_id: null, npc_id: "n9", quest_beat_id: null, item_id: null, document_id: null });
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
      { memberId: "m1", name: "Hero m1", threads: ["Who burned the mill?"], threadIds: ["Q1"], untoldPassages: 1 },
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

describe("scope", () => {
  // A town, a dungeon under it, a room in the dungeon; a second town with a room of its own.
  const places = [
    { id: "town", parent_id: null },
    { id: "dungeon", parent_id: "town" },
    { id: "room", parent_id: "dungeon" },
    { id: "elsewhere", parent_id: null },
    { id: "elsewhere-room", parent_id: "elsewhere" },
  ];
  const ctx = (over: Partial<TonightScopeContext> = {}): TonightScopeContext => ({ currentLocationId: "town", locations: places, activeBeatIds: new Set(["b1"]), ...over });
  const L = (id: string, over: Partial<CanonLorePassage>) => passage(id, "L1", { sort_order: 1, ...over });
  const plan = (): TonightInput => ({
    entries: [lore, canonEntry({ id: "S1", part: "secret", title: "A secret" })],
    passages: [passage("first", "L1", { sort_order: 0 }), L("inTown", { location_id: "town" }), L("inRoom", { location_id: "room" }), L("far", { location_id: "elsewhere-room" }), L("atBeat", { quest_beat_id: "b1" }), L("atOtherBeat", { quest_beat_id: "b2" }), L("atNpc", { npc_id: "n1" })],
    clues: [clue("kRoom", "S1", { location_id: "room" }), clue("kBeat", "S1", { quest_beat_id: "b1" }), clue("kNowhere", "S1")],
    steps: [], ticks: [], party: [], links: [], facts: [],
  });
  const ids = (t: ReturnType<typeof tonight>) => ({ lore: t.lore.flatMap((g) => g.items.map((i) => i.passageId)), clues: t.clues.flatMap((g) => g.items.map((i) => i.clueId)) });

  // Bug caught: only the party's own place matched, so a room inside the party's town was dropped from "Where the party is".
  it("where the party is keeps the place, a room inside it however deep, and nothing in another town", () => {
    const scoped = scopeTonight(tonight(plan()), "party", ctx());
    expect(ids(scoped)).toEqual({ lore: ["inTown", "inRoom"], clues: ["kRoom"] });
  });

  // Bug caught: a party with no place set matching every group (an unset id compared as a wildcard).
  it("where the party is keeps nothing when the campaign has no current place", () => {
    expect(ids(scopeTonight(tonight(plan()), "party", ctx({ currentLocationId: null })))).toEqual({ lore: [], clues: [] });
  });

  // Bug caught: the walk down parent_id following a loop forever, hanging the page on a bad tree.
  it("walks a place loop once", () => {
    const loop = [{ id: "a", parent_id: "b" }, { id: "b", parent_id: "a" }];
    expect([...placesWithin("a", loop)].sort()).toEqual(["a", "b"]);
  });

  // Bug caught: active quests keeping the beats of every quest, or a place group, instead of the active quests' beats only.
  it("active quests keeps only what lies at a beat of an active quest", () => {
    expect(ids(scopeTonight(tonight(plan()), "quests", ctx()))).toEqual({ lore: ["atBeat"], clues: ["kBeat"] });
  });

  // Bug caught: the active set built from every quest's beats, so a completed quest's beats still counted.
  it("builds the active beats from active quests only", () => {
    const beats = [{ id: "b1", quest_id: "q1" }, { id: "b2", quest_id: "q2" }];
    expect([...activeQuestBeatIds(beats, [{ id: "q1", status: "active" }, { id: "q2", status: "completed" }])]).toEqual(["b1"]);
  });

  // Bug caught: Everything narrowing anyway, or dropping what lies nowhere.
  it("everything keeps every group, including what lies nowhere", () => {
    expect(ids(scopeTonight(tonight(plan()), "all", ctx())).clues).toEqual(["kRoom", "kBeat", "kNowhere"]);
  });

  // Bug caught: forces and threads cut by a place scope they have no place for, hiding what moves.
  it("never narrows what moves", () => {
    const input = { ...plan(), entries: [...plan().entries, canonEntry({ id: "F1", part: "force" })] };
    expect(scopeTonight(tonight(input), "party", ctx()).forces).toHaveLength(1);
  });

  // Bug caught: the "nothing placed here" note shown when the scope hid nothing, or not when it hid everything.
  it("says the scope hid everything only when something existed and none of it is in scope", () => {
    const full = tonight(plan());
    expect(scopeHidAll(full, scopeTonight(full, "party", ctx()))).toBe(false);
    expect(scopeHidAll(full, scopeTonight(full, "party", ctx({ currentLocationId: null })))).toBe(true);
    const bare = tonight({ ...plan(), passages: [], clues: [] });
    expect(scopeHidAll(bare, scopeTonight(bare, "party", ctx()))).toBe(false);
  });
});

describe("looseEnds", () => {
  const base: LooseEndsInput = { entries: [], clues: [], steps: [], entryQuests: [], links: [], arcs: [], quests: [], sessions: [] };
  const secret = canonEntry({ id: "S1", part: "secret", title: "The mayor is a ghoul" });
  const kinds = (i: LooseEndsInput) => looseEnds(i).map((e) => `${e.kind}:${e.reasons.join("|")}`);
  const placed = (id: string) => clue(id, "S1", { location_id: "loc" });

  // Bug caught: the three-clue floor off by one (<=) so a secret with exactly three clues was flagged.
  it("flags a secret with fewer than three clues, not one with three placed", () => {
    expect(kinds({ ...base, entries: [secret], clues: [placed("a"), placed("b")] })).toEqual(["secret:2 clues, fewer than 3"]);
    expect(kinds({ ...base, entries: [secret], clues: [placed("a"), placed("b"), placed("c")] })).toEqual([]);
  });

  // Bug caught: a secret with no clues at all passing because "fewer than three" was only checked once one existed.
  it("flags a secret with no clues", () => {
    expect(kinds({ ...base, entries: [secret] })).toEqual(["secret:No clues yet"]);
  });

  // Bug caught: three clues lying nowhere counted as covered, though the DM has nowhere to find any of them.
  it("flags a secret whose clues are all unplaced, and treats a clue at an item or a passage as placed", () => {
    const loose = ["a", "b", "c"].map((id) => clue(id, "S1"));
    expect(kinds({ ...base, entries: [secret], clues: loose })).toEqual(["secret:No clue is placed anywhere"]);
    expect(kinds({ ...base, entries: [secret], clues: [clue("a", "S1", { item_id: "i" }), clue("b", "S1"), clue("c", "S1")] })).toEqual([]);
  });

  // Bug caught: a revealed secret still listed as thin.
  it("leaves a revealed secret alone", () => {
    expect(kinds({ ...base, entries: [{ ...secret, revealed_at: "2026-11-20T10:00:00Z" }] })).toEqual([]);
  });

  const force = canonEntry({ id: "F1", part: "force", title: "The Tithe Court" });
  // Bug caught: a force whose every step is reached still counted as having somewhere to go.
  it("flags a force with no unreached step, and one with no quest tied, each by its own reason", () => {
    expect(kinds({ ...base, entries: [force], steps: [step("s1", "F1", 0, "2026-11-20T10:00:00Z")], entryQuests: [{ entry_id: "F1" }] })).toEqual(["force:No step left to reach"]);
    expect(kinds({ ...base, entries: [force], steps: [step("s1", "F1", 0)] })).toEqual(["force:No quest tied to it"]);
    expect(kinds({ ...base, entries: [force], steps: [step("s1", "F1", 0)], entryQuests: [{ entry_id: "F1" }] })).toEqual([]);
  });

  // Bug caught: another force's step or quest tie satisfying this force.
  it("reads a force's own steps and quest ties only", () => {
    expect(kinds({ ...base, entries: [force], steps: [step("s1", "F2", 0)], entryQuests: [{ entry_id: "F2" }] })).toEqual(["force:No step left to reach|No quest tied to it"]);
  });

  // Bug caught: an ended force flagged, nagging about what is over.
  it("leaves an ended force alone", () => {
    expect(kinds({ ...base, entries: [{ ...force, closed_as: "faded" }] })).toEqual([]);
  });

  const question = canonEntry({ id: "Q1", part: "question", title: "Who rang the bell?", created_at: "2026-01-01T00:00:00Z" });
  const tied = [{ entry_id: "Q1" }];
  const sessionsAfter = (n: number) => Array.from({ length: n }, (_, i) => ({ created_at: `2026-02-0${i + 1}T00:00:00Z` }));
  // Bug caught: the boundary read as five-or-more, flagging a question open for exactly five sessions.
  it("flags a question open through more than five sessions, not five", () => {
    expect(kinds({ ...base, entries: [question], entryQuests: tied, sessions: sessionsAfter(5) })).toEqual([]);
    expect(kinds({ ...base, entries: [question], entryQuests: tied, sessions: sessionsAfter(6) })).toEqual(["question:Open through 6 sessions"]);
  });

  // Bug caught: sessions played before the question was asked counted against it.
  it("counts only the sessions since the question was asked, and skips an answered one", () => {
    const before = Array.from({ length: 8 }, () => ({ created_at: "2025-06-01T00:00:00Z" }));
    expect(kinds({ ...base, entries: [question], entryQuests: tied, sessions: before })).toEqual([]);
    expect(kinds({ ...base, entries: [{ ...question, closed_as: "answered" }], sessions: sessionsAfter(8) })).toEqual([]);
  });

  const backstory = canonEntry({ id: "B1", part: "backstory", title: "Lotte", party_member_id: "m1" });
  // Bug caught: a backstory with an unanswered question tied to it listed as having no thread, or one with none not listed.
  it("flags a backstory with no open thread and links to the character", () => {
    const open = canonEntry({ id: "Q2", part: "question" });
    const tie = { from_kind: "canon", from_id: "B1", to_kind: "canon", to_id: "Q2", type: "related_to" } as const;
    expect(kinds({ ...base, entries: [backstory, open], links: [tie], entryQuests: [{ entry_id: "Q2" }] })).toEqual([]);
    const ends = looseEnds({ ...base, entries: [backstory] });
    expect(ends.map((e) => e.reasons)).toEqual([["No open thread"]]);
    expect(ends[0]?.to).toEqual({ path: "/canon", query: { backstory: "m1" } });
  });

  const arc = { id: "A1", name: "The Drowned Bell", status: "running" };
  // Bug caught: the arc loose end opening the bare Canon page, so the DM hunts for the arc by hand.
  it("links a loose arc to that arc in the Arcs chapter", () => {
    expect(looseEnds({ ...base, arcs: [arc] })[0]?.to).toEqual({ path: "/canon/arcs", query: { arc: "A1" } });
  });

  // Bug caught: a running arc flagged though a force of its own is moving, or one that has only a planned arc flagged.
  it("flags a running arc with no moving force and no active quest, and clears it with either", () => {
    expect(kinds({ ...base, arcs: [arc] })).toHaveLength(1);
    expect(kinds({ ...base, arcs: [{ ...arc, status: "planned" }] })).toEqual([]);
    expect(kinds({ ...base, arcs: [arc], entries: [canonEntry({ id: "F9", part: "force", arc_id: "A1" })], steps: [step("s", "F9", 0)], entryQuests: [{ entry_id: "F9" }] })).toEqual([]);
    expect(kinds({ ...base, arcs: [arc], quests: [{ id: "q", status: "active", arc_id: "A1" }] })).toEqual([]);
  });

  // Bug caught: an ended force or a completed quest still keeping a running arc "alive".
  it("does not let an ended force or a completed quest keep a running arc moving", () => {
    const ended = canonEntry({ id: "F9", part: "force", arc_id: "A1", closed_as: "stopped" });
    expect(kinds({ ...base, arcs: [arc], entries: [ended], quests: [{ id: "q", status: "completed", arc_id: "A1" }] })).toHaveLength(1);
  });

  // Bug caught: a row linking to the wrong entry.
  it("links a secret row to its own entry", () => {
    expect(looseEnds({ ...base, entries: [secret] })[0]?.to).toEqual({ path: "/canon", query: { entry: "S1" } });
  });
});

describe("clues lying in an item or a handout (#1279 item 7)", () => {
  const sec = canonEntry({ id: "S1", part: "secret" });
  const empty: TonightInput = { entries: [], passages: [], clues: [], steps: [], ticks: [], party: [], links: [], facts: [] };
  const ctx = { currentLocationId: "town", locations: [{ id: "town", parent_id: null }], activeBeatIds: new Set<string>() };

  // Bug caught: an item clue and a handout clue filed under "Not placed anywhere yet" (a null place) beside the truly unplaced one.
  it("groups an item clue and a handout clue under their record, apart from the unplaced", () => {
    const groups = cluesToFind([sec], [clue("a", "S1", { item_id: "i1" }), clue("b", "S1", { document_id: "d1" }), clue("c", "S1", { item_id: "i1" }), clue("n", "S1")], []);
    expect(groups.map((g) => [g.at?.item_id ?? g.at?.document_id ?? null, g.items.map((i) => i.clueId)])).toEqual([["i1", ["a", "c"]], ["d1", ["b"]], [null, ["n"]]]);
  });

  // Bug caught: items and handouts leaking into "Where the party is" (they have no place) or vanishing from "Everything".
  it("keeps them out of Where the party is and shows them under Everything", () => {
    const plan = tonight({ ...empty, entries: [sec], clues: [clue("a", "S1", { item_id: "i1" }), clue("b", "S1", { document_id: "d1" })] });
    expect(scopeTonight(plan, "party", ctx).clues).toEqual([]);
    expect(scopeTonight(plan, "all", ctx).clues.flatMap((g) => g.items.map((i) => i.clueId))).toEqual(["a", "b"]);
  });
});

describe("withoutDone", () => {
  // Bug caught: a done row shown twice (once in the fold, once still in the stale plan), or an emptied group left as a bare heading.
  it("drops done items and the groups they leave empty", () => {
    const groups = [{ at: null, items: ["a", "b"] }, { at: { location_id: "l", npc_id: null, quest_beat_id: null }, items: ["c"] }];
    expect(withoutDone(groups, (i) => i === "a" || i === "c")).toEqual([{ at: null, items: ["b"] }]);
  });
});

describe("one loose-end rule (#1279 item 21)", () => {
  const base: LooseEndsInput = { entries: [], clues: [], steps: [], entryQuests: [], links: [], arcs: [], quests: [], sessions: [] };
  // Bug caught: Tonight keeping a rule of its own that misses what the read-through finds (a question no quest points at).
  it("flags an open question with no quest tied to it", () => {
    const q = canonEntry({ id: "Q1", part: "question", title: "Who?" });
    expect(looseEnds({ ...base, entries: [q] })[0]?.reasons).toEqual(["No quest tied to it"]);
  });
  // Bug caught: "Leave it" written but the row still listed, so the DM cannot dismiss a deliberate gap.
  it("skips an entry the DM left, and carries the entry id for it", () => {
    const left = canonEntry({ id: "F1", part: "force", loose_end_left_at: "2026-11-25T10:00:00Z" });
    expect(looseEnds({ ...base, entries: [left] })).toEqual([]);
    expect(looseEnds({ ...base, entries: [{ ...left, loose_end_left_at: null }] })[0]?.entryId).toBe("F1");
  });
});

describe("stepDueState (#1279 item 20)", () => {
  const due = (y: number | null, m: number | null, d: number | null) => ({ due_year: y, due_month: m, due_day: d, reached_at: null });
  const today = { year: 1000, month: 3, day: 5 };
  // Bug caught: a step due this month called overdue (or a past one only "due"), or a reached/undated step flagged at all.
  it("is due within the period it names, overdue after it, and nothing otherwise", () => {
    expect(stepDueState(due(1000, 3, 5), today)).toBe("due");
    expect(stepDueState(due(1000, 3, null), today)).toBe("due");
    expect(stepDueState(due(1000, 3, 4), today)).toBe("overdue");
    expect(stepDueState(due(999, null, null), today)).toBe("overdue");
    expect(stepDueState(due(1000, 4, null), today)).toBeNull();
    expect(stepDueState(due(1001, null, null), today)).toBeNull(); // a later year is not due yet
    expect(stepDueState(due(null, null, null), today)).toBeNull();
    expect(stepDueState({ ...due(1000, 3, 4), reached_at: "x" }, today)).toBeNull();
    expect(stepDueState(due(1000, 3, 4), null)).toBeNull();
  });
  // Bug caught: a late step that is not the first unreached one being lost behind the next step.
  it("lists every due step of a force, and its next step separately", () => {
    const f = canonEntry({ id: "F1", part: "force" });
    const s1 = step("s1", "F1", 0);
    const s2 = { ...step("s2", "F1", 1), due_year: 999 };
    const out = forcesMoving([f], [s1, s2], [], today)[0]!;
    expect(out.nextStepId).toBe("s1");
    expect(out.dueSteps).toEqual([{ stepId: "s2", title: "Step s2", state: "overdue" }]);
  });
});

describe("a person's place and scope counts (#1279 item 20)", () => {
  const sec = canonEntry({ id: "S1", part: "secret" });
  const empty: TonightInput = { entries: [sec], passages: [], clues: [clue("k", "S1", { npc_id: "n1" }), clue("k2", "S1", { npc_id: "n2" })], steps: [], ticks: [], party: [], links: [], facts: [] };
  const ctx: TonightScopeContext = { currentLocationId: "town", locations: [{ id: "town", parent_id: null }, { id: "inn", parent_id: "town" }], activeBeatIds: new Set(), npcLocationIds: new Map([["n1", "inn"], ["n2", "far"]]) };
  // Bug caught: a clue lying with a person dropped from "Where the party is" though the person is in the party's town.
  it("keeps what lies with a person who is where the party is", () => {
    const scoped = scopeTonight(tonight(empty), "party", ctx);
    expect(scoped.clues.flatMap((g) => g.items.map((i) => i.clueId))).toEqual(["k"]);
  });
  // Bug caught: counts that do not match what the scope shows.
  it("counts what each scope holds", () => {
    expect(scopeCounts(tonight(empty), ctx)).toEqual({ party: 1, quests: 0, all: 2 });
  });
});

describe("plannedItems (#1279 item 20)", () => {
  const pin = (id: string, over: Record<string, unknown>) => ({ id, user_id: "u", campaign_id: "c1", clue_id: null, passage_id: null, step_id: null, entry_id: null, sort_order: 0, created_at: "2026-01-01", updated_at: "2026-01-01", ...over });
  const sec = canonEntry({ id: "S1", part: "secret", title: "Secret" });
  const input = { entries: [sec], passages: [], clues: [clue("k1", "S1"), clue("k2", "S1", { found_at: "x" })], steps: [] };
  // Bug caught: pins listed out of the DM's order, or a pin of a clue already found still shown.
  it("lists pins in sort order and drops one whose clue is found", () => {
    const pins = [pin("p2", { clue_id: "k2", sort_order: 0 }), pin("p1", { entry_id: "S1", sort_order: 2 }), pin("p3", { clue_id: "k1", sort_order: 1 })];
    expect(plannedItems(pins, input).map((i) => i.pinId)).toEqual(["p3", "p1"]);
  });
  // Bug caught (#1279 review): a pinned clue left Planned once found, but a pinned question stayed after it was answered
  // and a pinned secret after it was revealed, listed as a thread to follow every session after.
  it("drops a pinned entry once it is played, and keeps one still open", () => {
    const entries = [
      canonEntry({ id: "Q", part: "question", closed_as: "answered", closed_at: "x" }),
      canonEntry({ id: "R", part: "secret", revealed_at: "x" }),
      canonEntry({ id: "T", part: "truth", knowledge: "all", revealed_at: "x" }),
      canonEntry({ id: "O", part: "secret" }),
    ];
    const pins = ["Q", "R", "T", "O"].map((id, i) => pin(`p${id}`, { entry_id: id, sort_order: i }));
    expect(plannedItems(pins, { entries, passages: [], clues: [], steps: [] }).map((i) => i.pinId)).toEqual(["pO"]);
  });
});
