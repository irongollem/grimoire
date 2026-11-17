import { describe, expect, it } from "vitest";
import { keptLinesOf, LINES_KEPT, SITTINGS_KEPT, withKeptLines, type KeptLine } from "./boardKeep";

const margin = (text: string, after = 0): KeptLine => ({ after, line: { kind: "margin", text }, byServer: true });

describe("keptLinesOf", () => {
  // Bug caught: trusting what the browser stored, so an edited or older entry reaches the story as a line with no
  // text, a roll with no die, or a place among the turns that is not a number.
  it("leaves out anything that is not a whole line", () => {
    const stored = {
      s1: [
        { after: 2, line: { kind: "roll", die: 17, label: "Claws", detail: "a hit", critical: false }, byServer: true },
        { after: 2, line: { kind: "roll", die: "17", label: "Claws", detail: "a hit", critical: false }, byServer: true },
        { after: -1, line: { kind: "margin", text: "x" }, byServer: true },
        { after: 1.5, line: { kind: "margin", text: "x" }, byServer: true },
        { after: 3, line: { kind: "margin" }, byServer: true },
        "nonsense",
      ],
    };
    expect(keptLinesOf(stored, "s1")).toEqual([{ after: 2, line: { kind: "roll", die: 17, label: "Claws", detail: "a hit", critical: false }, byServer: true }]);
  });

  // Bug caught: one sitting's fight showing up in another sitting.
  it("answers only the sitting asked for", () => {
    const boards = withKeptLines(withKeptLines({}, "s1", [margin("one")]), "s2", [margin("two")]);
    expect(keptLinesOf(boards, "s2").map((k) => (k.line.kind === "margin" ? k.line.text : ""))).toEqual(["two"]);
    expect(keptLinesOf("not an object", "s1")).toEqual([]);
  });
});

describe("withKeptLines", () => {
  // Bug caught: every fight ever played staying in the browser until its storage is full and every write throws.
  it("keeps a sitting's latest lines and the sittings last played", () => {
    const many = Array.from({ length: LINES_KEPT + 5 }, (_, i) => margin(`line ${i}`));
    const one = withKeptLines({}, "s0", many);
    expect(one.s0).toHaveLength(LINES_KEPT);
    expect(one.s0[0]).toEqual(margin("line 5"));

    let boards = {};
    for (let i = 0; i <= SITTINGS_KEPT; i += 1) boards = withKeptLines(boards, `s${i}`, [margin("x")]);
    expect(Object.keys(boards)).toEqual(Array.from({ length: SITTINGS_KEPT }, (_, i) => `s${i + 1}`));
  });

  // Bug caught: a sitting played again counted as old because it was first written long ago, and dropped.
  it("counts a sitting written to again as the one last played", () => {
    let boards = {};
    for (let i = 0; i < SITTINGS_KEPT; i += 1) boards = withKeptLines(boards, `s${i}`, [margin("x")]);
    boards = withKeptLines(boards, "s0", [margin("again")]);
    boards = withKeptLines(boards, "new", [margin("x")]);
    expect(Object.keys(boards)).toContain("s0");
    expect(Object.keys(boards)).not.toContain("s1");
    expect(keptLinesOf(boards, "s0")).toHaveLength(2);
  });
});
