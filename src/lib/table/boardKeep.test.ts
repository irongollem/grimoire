import { describe, expect, it } from "vitest";
import { boardRows, keptLinesOf } from "./boardKeep";

describe("keptLinesOf", () => {
  // Bug caught: trusting stored jsonb, so a row with no text, a roll with no die, or a place among the turns that
  // is not a whole number reaches the story half drawn.
  it("leaves out anything that is not a whole line", () => {
    const rows = [
      { after_turns: 2, line: { kind: "roll", die: 17, label: "Claws", detail: "a hit", critical: false }, by_server: true },
      { after_turns: 2, line: { kind: "roll", die: "17", label: "Claws", detail: "a hit", critical: false }, by_server: true },
      { after_turns: -1, line: { kind: "margin", text: "x" }, by_server: true },
      { after_turns: 1.5, line: { kind: "margin", text: "x" }, by_server: true },
      { after_turns: 3, line: { kind: "margin" }, by_server: true },
      { after_turns: 4, line: { kind: "margin", text: "The fight is over", tone: "end" }, by_server: false },
      "nonsense",
    ];
    expect(keptLinesOf(rows)).toEqual([
      { after: 2, line: { kind: "roll", die: 17, label: "Claws", detail: "a hit", critical: false }, byServer: true },
      { after: 4, line: { kind: "margin", text: "The fight is over", tone: "end" }, byServer: false },
    ]);
  });
});

describe("boardRows", () => {
  // Bug caught: lines written without their place among the turns, so a reopened fight gathers at the top of the page.
  it("keeps each line with its sitting and how many turns had been played", () => {
    expect(boardRows("s1", 3, [{ kind: "margin", text: "Round 2 · your turn" }], true)).toEqual([
      { session_id: "s1", after_turns: 3, line: { kind: "margin", text: "Round 2 · your turn" }, by_server: true },
    ]);
    // What was written reads back as it was.
    expect(keptLinesOf(boardRows("s1", 3, [{ kind: "margin", text: "x" }], false))).toEqual([{ after: 3, line: { kind: "margin", text: "x" }, byServer: false }]);
  });
});
