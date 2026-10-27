import { describe, expect, it } from "vitest";
import { heirOf, lineFromRows, memberRows, moveInLine, rankMap, seedKeys, toggleInLine } from "./succession";
import type { PersonKey } from "@/types/kinship.types";

const a: PersonKey = "npc:a";
const b: PersonKey = "npc:b";
const c: PersonKey = "pc:c";

describe("succession helpers", () => {
  const rows = memberRows(
    [
      { npc_id: "a", status: "Active", succession_rank: 2 },
      { npc_id: "b", status: "Expelled", succession_rank: 1 },
    ],
    [{ party_member_id: "c", status: "Active", succession_rank: 1 }],
  );

  it("seeds leave out the expelled and defected", () => {
    const withDefector = [...rows, ...memberRows([{ npc_id: "d", status: "Defected", succession_rank: 3 }], [])];
    expect([...seedKeys(withDefector)].sort()).toEqual([a, c]);
  });

  it("orders the line by rank and drops those who left or hold no rank", () => {
    const more = memberRows(
      [
        { npc_id: "d", status: "Defected", succession_rank: 3 },
        { npc_id: "e", status: "Active", succession_rank: null },
      ],
      [],
    );
    expect(lineFromRows([...rows, ...more])).toEqual([c, a]);
  });

  it("numbers the line from one", () => {
    expect(rankMap([c, a]).get(a)).toBe(2);
  });

  it("toggles a person in and out", () => {
    expect(toggleInLine([a], b)).toEqual([a, b]);
    expect(toggleInLine([a, b], a)).toEqual([b]);
  });

  it("moves within bounds only", () => {
    expect(moveInLine([a, b, c], b, -1)).toEqual([b, a, c]);
    expect(moveInLine([a, b, c], a, -1)).toEqual([a, b, c]);
    expect(moveInLine([a, b, c], c, 1)).toEqual([a, b, c]);
    expect(moveInLine([a, b, c], b, 1)).toEqual([a, c, b]);
    expect(moveInLine([a, b], "npc:stranger", 1)).toEqual([a, b]);
  });

  it("skips the dead when naming the heir", () => {
    expect(heirOf([a, b], (k) => k === a)).toBe(b);
    expect(heirOf([a], () => true)).toBeNull();
  });
});
