import { describe, expect, it } from "vitest";
import { formatSnapshot, parseSnapshot } from "./snapshot";

describe("parseSnapshot", () => {
  it("#1234 reads a snapshot that is not an object as empty instead of throwing", () => {
    expect(parseSnapshot(null)).toEqual({});
    expect(parseSnapshot("round 3")).toEqual({});
    expect(parseSnapshot([{ name: "x" }])).toEqual({});
  });

  it("drops a combatant without a name or side, and keeps the rest", () => {
    const parsed = parseSnapshot({
      combatants: [null, { faction: "goblins" }, { name: "Brute", faction: "goblins", hp_pct: 40 }],
    });
    expect(parsed.combatants).toEqual([{ name: "Brute", faction: "goblins", hp_pct: 40, is_player: false }]);
  });

  it("ignores a combatants field that is not a list", () => {
    expect(parseSnapshot({ name: "Ambush", combatants: "lots" })).toEqual({ name: "Ambush" });
  });
});

describe("formatSnapshot", () => {
  // app convention: a combatant whose HP the client did not send reads as unhurt, never as NaN%.
  it("shows a missing HP as 100% rather than NaN", () => {
    const text = formatSnapshot(parseSnapshot({ combatants: [{ name: "Brute", faction: "goblins" }] }));
    expect(text).toContain("Brute|goblins|100%");
  });
});
