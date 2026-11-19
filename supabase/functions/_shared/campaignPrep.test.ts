import { describe, expect, it } from "vitest";
import { closedLevels, keptProposals, questIdsForTitles, prepPrompt, proposalInput, type PrepDigest, type PrepExisting } from "./campaignPrep";

// Prep proposing where the party's levels come (#1021 row 27). What would go wrong silently: a milestone proposed in
// a campaign that levels by XP (where it means nothing), a level proposed twice or over one the DM already set, or a
// milestone that needs more quests than it names (the editor's save would refuse it after the DM ticked it).

const none: PrepExisting = {
  hazard: new Set(), place: new Set(), item: new Set(), roll_table: new Set(), feature: new Set(), milestone: new Set(),
};
const LEVEL_3 = {
  kind: "milestone", name: "Level three", why: "The first two quests close the opening chapter.",
  description: "The party has settled Sugarwell's first troubles.", level: 3, needs: 2,
  quests: ["The Locked Workshop", "Before the Count", "The Salt Road"],
};
const levelling = (over: Partial<PrepDigest["levelling"]> = {}): PrepDigest["levelling"] => ({ mode: "milestone", partyLevel: null, milestones: [], ...over });

describe("milestone proposals", () => {
  it("names a milestone by its level, whatever the model called it, so one level is never offered twice", () => {
    const kept = keptProposals([LEVEL_3, { ...LEVEL_3, name: "Third level", why: "Again." }], none);
    expect(kept).toHaveLength(1);
    expect(proposalInput(kept[0]!)).toMatchObject({ kind: "milestone", name: "Level 3", level: 3, needs: 2, quests: LEVEL_3.quests });
  });

  it.each([
    ["needs more quests than it names", { needs: 4 }],
    ["needs none", { needs: 0 }],
    ["names no quest", { quests: [] }],
    ["is level 1, where every party starts", { level: 1 }],
    ["is past level 20", { level: 21 }],
  ])("drops a milestone that %s", (_why, over) => {
    expect(keptProposals([{ ...LEVEL_3, ...over }], none)).toEqual([]);
  });

  it("counts a quest named twice once, so 'any 2' cannot be met by one quest", () => {
    expect(keptProposals([{ ...LEVEL_3, quests: ["The Salt Road", "the salt road"], needs: 2 }], none)).toEqual([]);
  });

  it("does not propose a level the DM has already set", () => {
    const existing = { ...none, milestone: closedLevels(levelling({ milestones: [{ level: 3, needs: 1, quests: ["The Salt Road"] }] })) };
    expect(keptProposals([LEVEL_3], existing)).toEqual([]);
  });

  it("proposes no milestone at all in a campaign that levels by experience", () => {
    const existing = { ...none, milestone: closedLevels(levelling({ mode: "experience" })) };
    expect(keptProposals([LEVEL_3, { ...LEVEL_3, level: 20 }], existing)).toEqual([]);
  });

  it("tells the model how the campaign levels, and what it has set", () => {
    const digest = (l: PrepDigest["levelling"]): PrepDigest => ({ campaign: "Sugarwell", quests: [], places: [], hazards: [], items: [], tables: [], features: [], levelling: l });
    expect(prepPrompt(digest(levelling({ mode: "experience" })))).toContain("propose no milestone");
    const set = prepPrompt(digest(levelling({ partyLevel: 2, milestones: [{ level: 2, needs: 1, quests: ["Before the Count"] }] })));
    expect(set).toContain("Its level now: 2");
    expect(set).toContain("Level 2: any 1 of Before the Count");
  });
});

describe("questIdsForTitles", () => {
  const quests = [
    { id: "q1", title: "The  Salt Road" },
    { id: "q2", title: "Before the Count" },
    { id: "q3", title: "The Old Map" },
    { id: "q4", title: "the old map" },
  ];

  // CodeRabbit on #1227: the parser collapses "The  Salt Road" to one space, and the lookup kept both, so a title the
  // model copied exactly found nothing.
  it("matches a title the way the parser keeps it: spaces collapsed, case ignored", () => {
    expect(questIdsForTitles(quests, ["The Salt Road", "BEFORE THE COUNT"])).toEqual({ ok: true, ids: ["q1", "q2"] });
  });

  // CodeRabbit on #1227: titles are not unique, and the last quest of a shared title was silently taken.
  it("refuses a title two quests share rather than guess which", () => {
    expect(questIdsForTitles(quests, ["The Old Map"])).toMatchObject({ ok: false, reason: expect.stringContaining("Two quests") });
  });

  it("refuses a title the campaign does not have", () => {
    expect(questIdsForTitles(quests, ["The Salt Road", "A made-up quest"])).toMatchObject({ ok: false });
  });
});
