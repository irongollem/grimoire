import { describe, expect, it } from "vitest";
import { asDmRoll, shownDmRoll } from "./dmRoll";

// The roll tool's answer, as `_shared/mcp/tools.ts` returns it.
const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    total: 17, label: "How warmly Honeycomb takes to you", faces: [15], dropped_faces: [4], modifier: 2,
    critical: false, fumble: false, hidden: false, message_id: "m1", summary: "SUMMARY-MARK", ...over,
  });

describe("shownDmRoll", () => {
  it("keeps what the table would see of the DM's dice and nothing else of the tool's answer", () => {
    const roll = shownDmRoll(answer());
    expect(roll).toEqual({ label: "How warmly Honeycomb takes to you", dice: null, faces: [15], dropped: [4], modifier: 2, total: 17 });
    expect(JSON.stringify(roll)).not.toContain("SUMMARY-MARK");
    expect(JSON.stringify(roll)).not.toContain("m1");
  });

  it("shows nothing of a roll made hidden, not even that it happened", () => {
    expect(shownDmRoll(answer({ hidden: true }))).toBeNull();
  });

  it("treats an answer that does not say it was open as hidden, so a changed tool cannot leak a secret roll", () => {
    const { hidden: _hidden, ...rest } = JSON.parse(answer()) as Record<string, unknown>;
    expect(shownDmRoll(JSON.stringify(rest))).toBeNull();
    expect(shownDmRoll(answer({ hidden: "false" }))).toBeNull();
  });

  it("shows nothing for an answer that is not a roll: an error text, a truncated answer, a roll with no dice", () => {
    expect(shownDmRoll("That campaign was not found.")).toBeNull();
    expect(shownDmRoll(answer().slice(0, 40))).toBeNull();
    expect(shownDmRoll(answer({ faces: [] }))).toBeNull();
    expect(shownDmRoll(answer({ total: "17" }))).toBeNull();
  });

  it("shows a roll with no label as unnamed rather than dropping it", () => {
    expect(shownDmRoll(answer({ label: "  " }))?.label).toBeNull();
  });
});

describe("asDmRoll", () => {
  const stored = { label: null, dice: "2d4-1", faces: [3, 5], dropped: [], modifier: -1, total: 7 };

  it("reads back a stored roll", () => {
    expect(asDmRoll(stored)).toEqual(stored);
  });

  it("drops a stored roll whose dice are not whole numbers of at least 1, so a tampered row is not drawn", () => {
    expect(asDmRoll({ ...stored, faces: [0] })).toBeNull();
    expect(asDmRoll({ ...stored, faces: [2.5] })).toBeNull();
    expect(asDmRoll({ ...stored, dropped: "none" })).toBeNull();
  });

  it("shows the dice asked for only when they are plain notation, so the model's own text never reaches the page through it", () => {
    expect(shownDmRoll(answer(), " 1D20 + 2 ")?.dice).toBe("1d20+2");
    expect(shownDmRoll(answer(), "1d20+2 (DC 15 to notice the trap)")?.dice).toBeNull();
    expect(shownDmRoll(answer(), "15")?.dice).toBeNull();
    expect(shownDmRoll(answer(), 20)?.dice).toBeNull();
  });
});
