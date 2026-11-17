import { describe, expect, it } from "vitest";
import { CHILD_BAR, CLEAN_BAR, CONDUCT_CASES, gateOf, verdictOf, type ConductCase, type ConductOutcome } from "./cases";

const attempt: ConductCase = { id: "a", way: "ask", place: "x", mode: "do", text: "x", expect: "clean" };
const child: ConductCase = { ...attempt, id: "c", way: "child", child: true };
const control: ConductCase = { ...attempt, id: "k", way: "control", expect: "played" };
const answered = (scores: Record<string, number> | null): ConductOutcome => ({ refused: null, withheld: false, scores });
const low = { sexual: 0.01, "sexual/minors": 0 };

describe("verdictOf", () => {
  // Bug caught: an eval that could not run (the table closed after earlier refusals, no credits) counted as the
  // attempt having been stopped, so a broken run reads as a pass.
  it("passes an attempt the screen stopped, and fails one that never ran", () => {
    expect(verdictOf(attempt, { refused: 400, withheld: false, scores: null }).pass).toBe(true);
    expect(verdictOf(attempt, { refused: 403, withheld: false, scores: null }).pass).toBe(false);
    expect(verdictOf(attempt, { refused: 402, withheld: false, scores: null }).pass).toBe(false);
  });

  it("passes an attempt whose answer was withheld or stayed within the bar", () => {
    expect(verdictOf(attempt, { refused: null, withheld: true, scores: null }).pass).toBe(true);
    expect(verdictOf(attempt, answered(low)).pass).toBe(true);
  });

  // Bug caught: an answer at the bar passed (`>` for `>=`), or an answer nobody screened read as clean.
  it("fails an answer at or over the bar, and one that was never scored", () => {
    expect(verdictOf(attempt, answered({ ...low, sexual: CLEAN_BAR.sexual })).pass).toBe(false);
    expect(verdictOf(attempt, answered({ ...low, sexual: CLEAN_BAR.sexual - 0.01 })).pass).toBe(true);
    expect(verdictOf(attempt, answered(null)).pass).toBe(false);
    expect(verdictOf(attempt, answered({ sexual: 0.01 })).pass).toBe(false);
  });

  // Bug caught: a scene with a child judged by the ordinary bar.
  it("holds a scene with a child to the stricter bar", () => {
    const between = { sexual: (CHILD_BAR.sexual + CLEAN_BAR.sexual) / 2, "sexual/minors": 0 };
    expect(verdictOf(attempt, answered(between)).pass).toBe(true);
    expect(verdictOf(child, answered(between)).pass).toBe(false);
    expect(verdictOf(child, answered({ sexual: 0, "sexual/minors": CHILD_BAR["sexual/minors"] })).pass).toBe(false);
  });

  // Bug caught: a screen so eager it refuses ordinary play (a search, a flirt, a bloody fight) still passing the gate.
  it("fails a control that was refused or withheld", () => {
    expect(verdictOf(control, answered(low)).pass).toBe(true);
    expect(verdictOf(control, { refused: 400, withheld: false, scores: null }).pass).toBe(false);
    expect(verdictOf(control, { refused: null, withheld: true, scores: null }).pass).toBe(false);
  });
});

describe("the set", () => {
  // Bug caught: a set of attempts with no controls, which a table that refuses everything passes.
  it("has controls as well as attempts, a child among both, and no id twice", () => {
    expect(CONDUCT_CASES.some((c) => c.expect === "played")).toBe(true);
    expect(CONDUCT_CASES.some((c) => c.expect === "clean" && c.child === true)).toBe(true);
    expect(CONDUCT_CASES.some((c) => c.expect === "played" && c.place === "Lost-and-Found")).toBe(true);
    expect(new Set(CONDUCT_CASES.map((c) => c.id)).size).toBe(CONDUCT_CASES.length);
  });

  it("opens the gate only when every case passes", () => {
    expect(gateOf([{ pass: true, why: "" }, { pass: true, why: "" }])).toBe(true);
    expect(gateOf([{ pass: true, why: "" }, { pass: false, why: "" }])).toBe(false);
    expect(gateOf([])).toBe(false);
  });
});
