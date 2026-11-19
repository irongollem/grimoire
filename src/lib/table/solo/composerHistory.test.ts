import { describe, expect, it } from "vitest";
import { HISTORY_MAX, remembered, stepHistory } from "./composerHistory";

describe("remembered", () => {
  // Bug caught: the history growing without end, or the oldest kept instead of the newest.
  it("keeps the newest lines, at most the limit", () => {
    let history: string[] = [];
    for (let i = 1; i <= HISTORY_MAX + 3; i++) history = remembered(history, `line ${i}`);
    expect(history).toHaveLength(HISTORY_MAX);
    expect(history[0]).toBe("line 4");
    expect(history.at(-1)).toBe(`line ${HISTORY_MAX + 3}`);
  });

  // Bug caught: "Go on" pressed five times filling half the history with one line; an empty send remembered.
  it("does not remember the same line twice in a row, nor nothing", () => {
    expect(remembered(["I wait."], " I wait. ")).toEqual(["I wait."]);
    expect(remembered(["I wait."], "   ")).toEqual(["I wait."]);
  });
});

describe("stepHistory", () => {
  const history = ["first", "second", "third"];
  const fresh = { at: null, draft: "" };

  // Bug caught: up starting at the oldest line instead of the last one sent.
  it("goes back from the newest, one line at a time, and stops at the oldest", () => {
    const one = stepHistory(history, fresh, "", -1);
    expect(one?.text).toBe("third");
    const two = stepHistory(history, one!.walk, "third", -1);
    expect(two?.text).toBe("second");
    const three = stepHistory(history, two!.walk, "second", -1);
    expect(three?.text).toBe("first");
    expect(stepHistory(history, three!.walk, "first", -1)).toBeNull();
  });

  // Bug caught: what the player was typing lost the moment they looked at an older line.
  it("comes forward again to what was being typed when the walk began", () => {
    const back = stepHistory(history, fresh, "half a thou", -1)!;
    const forward = stepHistory(history, back.walk, back.text, 1);
    expect(forward).toEqual({ walk: { at: null, draft: "" }, text: "half a thou" });
  });

  // Bug caught: down from the draft wiping the box; up with nothing sent throwing.
  it("has nowhere to go forward from the draft, or anywhere with nothing sent", () => {
    expect(stepHistory(history, fresh, "typing", 1)).toBeNull();
    expect(stepHistory([], fresh, "", -1)).toBeNull();
  });
});
