import { describe, expect, it } from "vitest";
import { deriveQuestBeatPrepGaps, deriveQuestBeatPresentations, formatUnwrittenRoomsLabel, forwardReachableBeatIds, tallyQuestReach, visitedRouteEdgeIds } from "./presentation";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatEdge, QuestBeatTransition, QuestConsequence } from "@/types/quest.types";
import type { SiteReadiness } from "@/lib/locations/siteReadiness";

const beat = (id: string, visibility: QuestBeat["visibility"] = "hidden") => ({
  id, quest_id: "q", campaign_id: "c", title: id, visibility,
  dm_content: "Prepared guidance", how_it_plays: null,
  rumor_text: visibility === "rumored" ? "Safe rumor" : null,
  reveal_text: visibility === "revealed" ? "Safe reveal" : null,
  is_improvised: false, improv_reviewed_at: null,
}) as QuestBeat;
const edge = (id: string, source: string, target: string) => ({ id, source_beat_id: source, target_beat_id: target }) as QuestBeatEdge;
const transition = (from: string | null, to: string) => ({ from_beat_id: from, to_beat_id: to }) as QuestBeatTransition;
const readiness = (over: Partial<SiteReadiness> = {}): SiteReadiness => ({
  mapped: true, calibrated: true, traced: true, bound: true, waysOut: true,
  unboundSpaces: 0, untracedSpaces: 0, caption: null,
  ...over,
});

describe("quest beat presentation", () => {
  it("derives readiness, visibility-independent history, live, handout and disconnected states", () => {
    const attachment = { beat_id: "b", attachment_type: "handout", prep_gap: true } as QuestBeatAttachmentSummary;
    const result = deriveQuestBeatPresentations({
      beats: [beat("a", "revealed"), beat("b", "rumored"), beat("staging")],
      edges: [edge("ab", "a", "b"), edge("ba", "b", "a")],
      attachments: [attachment],
      runtime: [{ quest_id: "q", current_beat_id: "b" }] as never[],
      transitions: [transition(null, "a"), transition("a", "b")],
    });

    expect(result.a).toMatchObject({ isReady: true, isVisited: true, isCurrent: false, isDisconnected: false });
    expect(result.b).toMatchObject({ prepGapCount: 1, handoutCount: 1, isReady: false, isVisited: true, isCurrent: true });
    expect(result.staging.isDisconnected).toBe(true);
    expect(result.staging.prepGaps).toEqual([{ kind: "connection", label: "Connect this staging beat to the story flow" }]);
  });

  it("uses one typed readiness rule for narrative, visibility, attachments and improv", () => {
    const draft = {
      ...beat("draft", "revealed"), dm_content: null, how_it_plays: null, reveal_text: null,
      is_improvised: true, improv_reviewed_at: null,
    };
    const required = { prep_gap: true, label: "Missing map" } as QuestBeatAttachmentSummary;
    const optional = { prep_gap: false, label: "Optional sound" } as QuestBeatAttachmentSummary;
    expect(deriveQuestBeatPrepGaps(draft, [required, optional], { isDisconnected: true })).toEqual([
      { kind: "guidance", label: "Add DM guidance" },
      { kind: "player_copy", label: "Add reveal copy — players see nothing without it" },
      { kind: "attachment", label: "Replace Missing map" },
      { kind: "improv_review", label: "Review improvised beat" },
      { kind: "connection", label: "Connect this staging beat to the story flow" },
    ]);
    expect(deriveQuestBeatPrepGaps({ ...draft, visibility: "hidden", how_it_plays: "Skill challenge" }, [])).toEqual([
      { kind: "improv_review", label: "Review improvised beat" },
    ]);
  });

  it("raises a site gap when the crawl can't actually be walked, and none when it's clean", () => {
    const prepared = { ...beat("staged", "hidden"), how_it_plays: "Explore the vault" };
    expect(deriveQuestBeatPrepGaps(prepared, [], { site: readiness({ bound: false, unboundSpaces: 1, caption: "1 space unbound" }) }))
      .toEqual([{ kind: "site", label: "1 space unbound" }]);
    // Bound cleanly but no doors traced at all — no caption to report the
    // unbound/untraced count against, so the gap falls back to naming the
    // actual blocker: the party has nowhere to go.
    expect(deriveQuestBeatPrepGaps(prepared, [], { site: readiness({ waysOut: false }) }))
      .toEqual([{ kind: "site", label: "no ways out — the party cannot leave this site" }]);
    expect(deriveQuestBeatPrepGaps(prepared, [], { site: readiness() })).toEqual([]);
    // No site input at all (a beat staged nowhere, or a beat staged
    // somewhere nobody has fetched readiness for yet) reports nothing.
    expect(deriveQuestBeatPrepGaps(prepared, [])).toEqual([]);
  });

  it("threads a staged site's readiness into the beat's own prep gaps", () => {
    const result = deriveQuestBeatPresentations({
      beats: [{ ...beat("crawl", "hidden"), how_it_plays: "Explore", staged_at_location_id: "site-1" } as QuestBeat],
      edges: [],
      attachments: [],
      sites: {
        "site-1": {
          locationId: "site-1", name: "Ashmouth Undercroft", roomCount: 3, unwrittenRooms: [],
          readiness: readiness({ bound: false, unboundSpaces: 1, caption: "1 space unbound" }),
        },
      },
    });
    expect(result.crawl.prepGaps).toEqual([{ kind: "site", label: "1 space unbound" }]);
    expect(result.crawl.isReady).toBe(false);
  });

  it("raises no site gap for a site with no rooms — a tavern staged for a conversation was never meant to be walked", () => {
    const result = deriveQuestBeatPresentations({
      beats: [{ ...beat("chat", "hidden"), how_it_plays: "Talk to the barkeep", staged_at_location_id: "tavern-1" } as QuestBeat],
      edges: [],
      attachments: [],
      sites: {
        "tavern-1": {
          locationId: "tavern-1", name: "The Quiet Hamlet's tavern", roomCount: 0, unwrittenRooms: [],
          // Readiness that would raise a gap if it were consulted at all —
          // proving the guard skips it, not that this readiness is clean.
          readiness: readiness({ bound: false, waysOut: false, unboundSpaces: 1, caption: "1 space unbound" }),
        },
      },
    });
    expect(result.chat.prepGaps).toEqual([]);
    expect(result.chat.isReady).toBe(true);
  });

  it("scopes connectivity per quest", () => {
    const result = deriveQuestBeatPresentations({
      // Campaign-wide input, as the board passes it: quest "q" has two wired
      // flow beats, quest "other" has a single beat that cannot be connected.
      beats: [beat("a"), beat("b"), { ...beat("lonely"), quest_id: "other" } as QuestBeat],
      edges: [edge("ab", "a", "b")],
      attachments: [],
    });

    expect(result.lonely.isDisconnected).toBe(false);
    expect(result.a.isDisconnected).toBe(false);
  });

  it("separates what is still ahead from what the run has walked past", () => {
    // a -> b -> {c, d}; the party took b -> c, so d is prepared, wired, and
    // unreachable — the case a graph cannot show on its own.
    const result = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), beat("c"), beat("d"), beat("e")],
      edges: [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("bd", "b", "d"), edge("ce", "c", "e")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "c" }] as never[],
      transitions: [transition(null, "a"), transition("a", "b"), transition("b", "c")],
    });

    expect(result.a.reach).toBe("visited");
    expect(result.b.reach).toBe("visited");
    expect(result.c.reach).toBe("current");
    expect(result.d.reach).toBe("stranded");
    expect(result.e.reach).toBe("ahead");
    expect(tallyQuestReach(result)).toEqual({ visited: 3, ahead: 1, stranded: 1 });
  });

  // The case a single campaign-wide cursor could not express: two givers send the
  // party to the same cave, so both chains are genuinely being advanced at once.
  it("marks a beat current in every chain that is live, not just one", () => {
    const other = (id: string) => ({ ...beat(id), quest_id: "relic-hunt" }) as QuestBeat;
    const result = deriveQuestBeatPresentations({
      beats: [beat("boss-door"), beat("boss"), other("side-chamber"), other("relic")],
      edges: [edge("bd", "boss-door", "boss"), edge("sr", "side-chamber", "relic")],
      attachments: [],
      runtime: [
        { quest_id: "q", current_beat_id: "boss-door" },
        { quest_id: "relic-hunt", current_beat_id: "side-chamber" },
      ] as never[],
      transitions: [],
    });

    expect(result["boss-door"].isCurrent).toBe(true);
    expect(result["side-chamber"].isCurrent).toBe(true);
    // Each live chain contributes its own forward reach, so neither quest's
    // upcoming beats read as cut off just because the other one is on screen.
    expect(result.boss.reach).toBe("ahead");
    expect(result.relic.reach).toBe("ahead");
  });

  // #853: a single quest can now hold several live threads at once — a
  // parallel route spawns one without touching the other. Both threads
  // standing on the same converge-all beat must both show up, not just the
  // last one read.
  it("marks a beat current for every thread standing on it, within one quest", () => {
    const result = deriveQuestBeatPresentations({
      beats: [beat("split"), beat("converge")],
      edges: [edge("sc1", "split", "converge")],
      attachments: [],
      runtime: [
        { quest_id: "q", thread_id: "main", current_beat_id: "converge" },
        { quest_id: "q", thread_id: "side", current_beat_id: "converge" },
      ] as never[],
      transitions: [],
    });
    expect(result.converge.isCurrent).toBe(true);
    expect(result.converge.currentThreadIds).toEqual(["main", "side"]);
  });

  it("leaves a chain with no cursor entirely out of the run", () => {
    const result = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), { ...beat("untouched"), quest_id: "dormant" } as QuestBeat],
      edges: [edge("ab", "a", "b")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "a" }] as never[],
      transitions: [transition(null, "a")],
    });
    expect(result.untouched.reach).toBe("unplayed");
    expect(result.b.reach).toBe("ahead");
  });

  it("re-opens a branch the party can loop back to, and stays quiet outside the run", () => {
    const looping = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), beat("side")],
      edges: [edge("ab", "a", "b"), edge("ba", "b", "a"), edge("aside", "a", "side")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "b" }] as never[],
      transitions: [transition(null, "a"), transition("a", "b")],
    });
    // b -> a -> side is still walkable, so the untaken branch is not cut off.
    expect(looping.side.reach).toBe("ahead");

    const elsewhere = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b"), { ...beat("other"), quest_id: "other-quest" } as QuestBeat],
      edges: [edge("ab", "a", "b")],
      attachments: [],
      runtime: [{ quest_id: "q", current_beat_id: "a" }] as never[],
      transitions: [transition(null, "a")],
    });
    // Another quest's beats, with no cursor of their own, are not "cut off".
    expect(elsewhere.other.reach).toBe("unplayed");

    // No run in progress at all: nothing is ahead of or behind anybody.
    const idle = deriveQuestBeatPresentations({ beats: [beat("a"), beat("b")], edges: [edge("ab", "a", "b")], attachments: [] });
    expect(idle.a.reach).toBe("unplayed");
    expect(tallyQuestReach(idle)).toEqual({ visited: 0, ahead: 0, stranded: 0 });
  });

  it("walks edges forward without stalling on a cycle", () => {
    const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")];
    expect([...forwardReachableBeatIds("a", edges)].sort()).toEqual(["a", "b", "c"]);
    expect([...forwardReachableBeatIds("lonely", edges)]).toEqual([]);
  });

  it("marks route history without looping on cycles or convergence", () => {
    const edges = [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a"), edge("dc", "d", "c")];
    expect([...visitedRouteEdgeIds(edges, [transition("a", "b"), transition("b", "c"), transition("c", "a")])]).toEqual(["ab", "bc", "ca"]);
  });

  it("counts a beat's payoffs as its own arrival rules plus loot still held, and flags an unlock rule", () => {
    const unlock = { id: "c1", on_beat_id: "b", action: "unlock_quest" } as QuestConsequence;
    const reveal = { id: "c2", on_beat_id: "b", action: "reveal" } as QuestConsequence;
    const onARoute = { id: "c3", on_beat_id: null, on_edge_id: "ab", action: "raise" } as QuestConsequence;
    const result = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b")],
      edges: [edge("ab", "a", "b")],
      attachments: [],
      consequences: [unlock, reveal, onARoute],
      lootByBeat: { b: { total: 2, undispatched: 2, unclaimed: 0 } },
    });
    expect(result.b!.payoffCount).toBe(4); // two on-beat rules + two loot held
    expect(result.b!.unlocksQuest).toBe(true);
    expect(result.a!.payoffCount).toBe(0);
    expect(result.a!.unlocksQuest).toBe(false);
  });

  it("only names a converge mode once two or more routes actually arrive", () => {
    const single = deriveQuestBeatPresentations({
      beats: [beat("a"), beat("b")],
      edges: [edge("ab", "a", "b")],
      attachments: [],
    });
    expect(single.b!.convergeLabel).toBeNull();

    const merged = deriveQuestBeatPresentations({
      beats: [{ ...beat("a") }, { ...beat("b") }, { ...beat("c"), converge_mode: "all" } as QuestBeat],
      edges: [edge("ac", "a", "c"), edge("bc", "b", "c")],
      attachments: [],
    });
    expect(merged.c!.convergeLabel).toBe("all");
  });

  it("reports a staged site's room count and only mentions unwritten rooms when there are any", () => {
    const staged = { ...beat("dungeon"), staged_at_location_id: "loc-1" } as QuestBeat;
    const withGaps = deriveQuestBeatPresentations({
      beats: [staged],
      edges: [],
      attachments: [],
      sites: { "loc-1": { locationId: "loc-1", name: "The Drowned Vault", roomCount: 6, unwrittenRooms: [4, 5, 6] } },
    });
    expect(withGaps.dungeon!.site).toEqual({ name: "The Drowned Vault", roomCount: 6, emptyRoomLabel: "rooms 4–6 empty" });

    const complete = deriveQuestBeatPresentations({
      beats: [staged],
      edges: [],
      attachments: [],
      sites: { "loc-1": { locationId: "loc-1", name: "The Drowned Vault", roomCount: 6, unwrittenRooms: [] } },
    });
    expect(complete.dungeon!.site!.emptyRoomLabel).toBeNull();

    // A location with no rooms at all is just a place, not a site fact worth a chip.
    const roomless = deriveQuestBeatPresentations({
      beats: [staged],
      edges: [],
      attachments: [],
      sites: { "loc-1": { locationId: "loc-1", name: "A quiet hamlet", roomCount: 0, unwrittenRooms: [] } },
    });
    expect(roomless.dungeon!.site).toBeNull();

    // Unstaged, or staged somewhere never looked up.
    const unstaged = deriveQuestBeatPresentations({ beats: [beat("a")], edges: [], attachments: [] });
    expect(unstaged.a!.site).toBeNull();
  });
});

describe("formatUnwrittenRoomsLabel", () => {
  it("collapses a contiguous run into a range", () => {
    expect(formatUnwrittenRoomsLabel([4, 5, 6])).toBe("rooms 4–6 empty");
  });

  it("uses the singular for exactly one room", () => {
    expect(formatUnwrittenRoomsLabel([4])).toBe("room 4 empty");
  });

  it("mixes ranges and singles for a scattered set, sorted regardless of input order", () => {
    expect(formatUnwrittenRoomsLabel([5, 2, 4])).toBe("rooms 2, 4–5 empty");
  });

  it("says nothing when every room is written", () => {
    expect(formatUnwrittenRoomsLabel([])).toBeNull();
  });
});
