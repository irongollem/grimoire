import { describe, expect, it } from "vitest";
import { effectiveMode, parseRollAsk, parseRolled, rollBody, rollLine } from "./tableRoll";
import type { Rolled } from "./soloTypes";

const ask = { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" };
const rolled = { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: false };

describe("parseRollAsk", () => {
  it("reads a skill check, a plain ability check and a save", () => {
    expect(parseRollAsk(ask)).toEqual(ask);
    expect(parseRollAsk({ ...ask, skill: null })).toMatchObject({ skill: null });
    expect(parseRollAsk({ label: "Dexterity save", kind: "save", ability: "dex", skill: null })).toMatchObject({ kind: "save" });
  });

  // Bug caught: the number to beat riding along into the page's state, where a player could read it from devtools.
  it("keeps only the four fields the card needs", () => {
    expect(Object.keys(parseRollAsk({ ...ask, dc: 4242 }) ?? {}).sort()).toEqual(["ability", "kind", "label", "skill"]);
  });

  // Bug caught: a malformed ask (unknown ability, kind or skill, a save with a skill, no label) drawing a card that
  // sends the server something it refuses.
  it.each([
    ["an unknown ability", { ...ask, ability: "luck" }],
    ["an unknown kind", { ...ask, kind: "attack" }],
    ["a skill the sheet does not have", { ...ask, skill: "cooking" }],
    ["a missing skill", { label: "x", kind: "check", ability: "wis" }],
    ["a save with a skill", { ...ask, kind: "save" }],
    ["a blank label", { ...ask, label: "  " }],
    ["not an object", "roll"],
  ])("refuses %s", (_what, raw) => {
    expect(parseRollAsk(raw)).toBeNull();
  });
});

describe("parseRolled", () => {
  it("reads the server's roll", () => {
    expect(parseRolled(rolled)).toEqual(rolled);
    expect(parseRolled({ ...rolled, faces: [13, 7], mode: "advantage", atTable: false })).toMatchObject({ kept: 13 });
  });

  // Bug caught: drawing a total the dice do not add up to, or a kept face that was never rolled.
  it.each([
    ["kept not among the faces", { ...rolled, kept: 12, total: 16 }],
    ["a total that is not kept plus bonus", { ...rolled, total: 18 }],
    ["a face of 21", { ...rolled, faces: [21], kept: 21, total: 25 }],
    ["a face of 0", { ...rolled, faces: [0], kept: 0, total: 4 }],
    ["a fractional face", { ...rolled, faces: [13.5], kept: 13.5, total: 17.5 }],
    ["an unknown mode", { ...rolled, mode: "lucky" }],
    ["two faces on a normal roll", { ...rolled, faces: [13, 2] }],
    ["three faces", { ...rolled, faces: [1, 2, 3], mode: "advantage", kept: 3, total: 7 }],
    ["atTable not a boolean", { ...rolled, atTable: "yes" }],
    ["a bonus beyond any sheet", { ...rolled, bonus: 41, total: 54 }],
  ])("refuses %s", (_what, raw) => {
    expect(parseRolled(raw)).toBeNull();
  });
});

describe("rollBody", () => {
  // Bug caught: a typed face of 0 or 21 sent on, which the server refuses; or the edges 1 and 20 refused.
  it("refuses a typed face outside 1 to 20 and accepts 1 and 20", () => {
    expect(rollBody({ source: "table", face: 0 }, "normal", 2)).toBeNull();
    expect(rollBody({ source: "table", face: 21 }, "normal", 2)).toBeNull();
    expect(rollBody({ source: "table", face: 1.5 }, "normal", 2)).toBeNull();
    expect(rollBody({ source: "table", face: 1 }, "normal", 2)).toMatchObject({ faces: [1] });
    expect(rollBody({ source: "table", face: 20 }, "normal", 2)).toMatchObject({ faces: [20] });
  });

  // Bug caught: the body carrying the wrong number of faces, which the server refuses (one for normal, two for an
  // on-screen advantage, one for a typed advantage roll).
  it("carries one face for normal, two for on-screen advantage and one for a typed advantage roll", () => {
    expect(rollBody({ source: "screen", faces: [9] }, "normal", 1)).toEqual({ faces: [9], mode: "normal", bonus: 1, atTable: false });
    expect(rollBody({ source: "screen", faces: [9, 3] }, "advantage", 1)).toMatchObject({ faces: [9, 3], atTable: false });
    expect(rollBody({ source: "screen", faces: [9] }, "advantage", 1)).toBeNull();
    expect(rollBody({ source: "screen", faces: [9, 3] }, "normal", 1)).toBeNull();
    expect(rollBody({ source: "table", face: 9 }, "advantage", 1)).toEqual({ faces: [9], mode: "advantage", bonus: 1, atTable: true });
  });

  it("refuses a bonus the server would", () => {
    expect(rollBody({ source: "table", face: 9 }, "normal", 41)).toBeNull();
    expect(rollBody({ source: "table", face: 9 }, "normal", -21)).toBeNull();
    expect(rollBody({ source: "table", face: 9 }, "normal", 0.5)).toBeNull();
  });
});

describe("effectiveMode", () => {
  // PHB 2014 "Advantage and Disadvantage": advantage and disadvantage cancel to a straight roll.
  // Bug caught: a chosen advantage winning over a condition's disadvantage.
  it("makes chosen advantage plus forced disadvantage a normal roll", () => {
    expect(effectiveMode("advantage", true)).toBe("normal");
    expect(effectiveMode("normal", true)).toBe("disadvantage");
    expect(effectiveMode("advantage", false)).toBe("advantage");
  });
});

describe("rollLine", () => {
  const line = (over: Partial<Rolled>) => rollLine({ ...(rolled as Rolled), ...over }, "Rosie");

  it("writes the three texts of the story's roll line", () => {
    expect(line({})).toEqual({ total: "17", title: "Rosie rolled Wisdom (Perception)", detail: "d20 (13) + 4" });
  });

  // Bug caught: "+ -1" for a penalty, or a dangling "+ 0".
  it("writes a negative bonus with a minus and leaves a zero bonus out", () => {
    expect(line({ bonus: -1, total: 12 }).detail).toBe("d20 (13) - 1");
    expect(line({ bonus: 0, total: 13 }).detail).toBe("d20 (13)");
  });

  // Bug caught: a roll typed in at the table drawn as if the page had rolled it, and an on-screen one claiming it was not.
  it("says 'rolled at the table' only for a typed roll", () => {
    expect(line({ atTable: true }).detail).toBe("d20 (13) + 4 · rolled at the table");
    expect(line({ atTable: false }).detail).not.toContain("table");
  });

  it("shows both dice of an advantage or disadvantage roll and which was kept", () => {
    expect(line({ faces: [13, 7], mode: "advantage" }).detail).toBe("d20 (13, 7) + 4, the higher");
    expect(line({ faces: [13, 7], kept: 7, total: 11, mode: "disadvantage" }).detail).toBe("d20 (13, 7) + 4, the lower");
    expect(line({ faces: [13], mode: "advantage" }).detail).toBe("d20 (13) + 4");
  });
});
