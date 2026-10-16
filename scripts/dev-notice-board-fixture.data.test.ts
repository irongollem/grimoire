import { describe, expect, it } from "vitest";
import {
  boardNameFor,
  FALLBACK_BOARD_NAME,
  FIXTURE_PINS,
  buildFixtureQuests,
  FALLBACK_BOUNTY_TARGET,
  layoutProblems,
  pickBoardPlace,
  tiptapDoc,
} from "./dev-notice-board-fixture.data.ts";

describe("notice board fixture data", () => {
  it("lays the pins out without overlap or leaving the board", () => {
    expect(layoutProblems(FIXTURE_PINS)).toEqual([]);
  });

  it("uses no em-dashes in any written text", () => {
    const text = [
      ...FIXTURE_PINS.flatMap((p) => [p.headline, p.body, p.reward ?? ""]),
      ...buildFixtureQuests(FALLBACK_BOUNTY_TARGET).flatMap((q) => [q.title, q.summary, q.handoutTitle, ...q.handout]),
    ].join("\n");
    expect(text).not.toContain("—");
  });

  it("keeps quest summaries to the one-line limit", () => {
    for (const q of buildFixtureQuests(FALLBACK_BOUNTY_TARGET)) expect(q.summary.length).toBeLessThanOrEqual(280);
  });

  it("links only to quests that exist", () => {
    for (const p of FIXTURE_PINS) {
      if (p.questIndex !== undefined) expect(buildFixtureQuests(FALLBACK_BOUNTY_TARGET)[p.questIndex]).toBeDefined();
    }
  });

  it("prefers an inn over a hall, a hall over the first place", () => {
    const places = [{ name: "Mithral Hall" }, { name: "Sigil" }, { name: "The Pulled Sugar Inn" }];
    expect(pickBoardPlace(places)?.name).toBe("The Pulled Sugar Inn");
    expect(pickBoardPlace(places.slice(0, 2))?.name).toBe("Mithral Hall");
    expect(pickBoardPlace([{ name: "Sigil" }])?.name).toBe("Sigil");
    expect(pickBoardPlace([])).toBeNull();
  });

  it("names the board after its place, or falls back", () => {
    expect(boardNameFor({ name: "The Pulled Sugar Inn" })).toBe("The Notice Board at The Pulled Sugar Inn");
    expect(boardNameFor(null)).toBe(FALLBACK_BOARD_NAME);
  });

  it("builds a paragraph per string", () => {
    expect(tiptapDoc(["a", "b"]).content).toHaveLength(2);
  });

  it.each([FALLBACK_BOUNTY_TARGET, "Apprentice Honeycomb"])("names %s on the quest and the writ alike", (subject) => {
    const bounty = buildFixtureQuests(subject)[0];
    expect(bounty?.title).toContain(subject === FALLBACK_BOUNTY_TARGET ? "Ratcatcher" : subject);
    expect(bounty?.summary).toContain(subject);
    expect(bounty?.handout.join(" ")).toContain(subject);
    expect(bounty?.handout.join(" ")).not.toContain(subject === FALLBACK_BOUNTY_TARGET ? "Honeycomb" : "Grell");
  });
});
