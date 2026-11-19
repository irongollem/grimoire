import { describe, expect, it } from "vitest";
import type { WallSegment } from "../../../lib/battlemap/walls.ts";
import type { MonsterSize } from "../../../types/monster.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import { pathTo, reachable, type ReachCreature, type ReachInput } from "./reach.ts";

const wall = (id: string, a: [number, number], b: [number, number]): WallSegment => ({ id, a, b });
const creature = (x: number, y: number, size: MonsterSize, o: Partial<ReachCreature> = {}): ReachCreature => {
  const footprint = { tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 }[size];
  return { anchor: { x, y }, footprint, size, hostile: false, incapacitated: false, ...o };
};

function run(o: {
  at?: { x: number; y: number } | null;
  size?: MonsterSize;
  footprint?: number;
  budget: number;
  difficult?: string[];
  blocking?: WallSegment[];
  solid?: string[];
  others?: ReachCreature[];
  ruleset?: RulesetKey;
  bounds?: ReachInput["terrain"]["bounds"];
}) {
  const input: ReachInput = {
    mover: { anchor: o.at === undefined ? { x: 0, y: 0 } : o.at, footprint: o.footprint ?? 1, size: o.size ?? "medium" },
    budgetFeet: o.budget,
    terrain: {
      difficult: new Set(o.difficult ?? []),
      blocking: o.blocking ?? [],
      solid: new Set(o.solid ?? []),
      // Far wider than any search below, so the edge only matters in the tests that set `bounds`.
      bounds: o.bounds ?? { minX: -50, minY: -50, maxX: 50, maxY: 50 },
    },
    others: o.others ?? [],
    ruleset: o.ruleset ?? "2014",
  };
  return reachable(input);
}
const feetAt = (r: ReturnType<typeof run>, x: number, y: number) => r.cells.get(`${x},${y}`)?.feet;
const route = (r: ReturnType<typeof run>, x: number, y: number) => pathTo(r, { x, y })?.map((c) => `${c.x},${c.y}`).join(" ");

// A one-row corridor: the row of cells y=0, walled along y=0 and y=1 (the centre line y=0.5 never touches them).
const CORRIDOR = [wall("n", [-20, 0], [20, 0]), wall("s", [-20, 1], [20, 1])];

describe("the budget (PHB 2014 ch. 9 'Movement and Position': every square 5 ft, diagonals too)", () => {
  it("reaches a square at exactly the budget and not one 5 ft beyond", () => {
    // Open ground, mover at (0,0), 10 ft: two squares in any direction, cost 5 per square (Chebyshev distance).
    const r = run({ budget: 10 });
    expect(feetAt(r, 2, 2)).toBe(10);
    expect(feetAt(r, 3, 0)).toBeUndefined();
    expect(r.cells.size).toBe(25);
  });

  it("a budget of 0 reaches only where it stands, at no cost", () => {
    const r = run({ budget: 0 });
    expect([...r.cells.keys()]).toEqual(["0,0"]);
    expect(feetAt(r, 0, 0)).toBe(0);
  });

  it("a creature with no position reaches nothing and has no start", () => {
    const r = run({ at: null, budget: 30 });
    expect(r.start).toBeNull();
    expect(r.cells.size).toBe(0);
  });

  it("a Tiny mover stands on, and searches, whole cells", () => {
    // A Tiny at the half-cell (0.5, 0): the search starts from the whole cell 0,0 it stands in.
    const r = run({ at: { x: 0.5, y: 0 }, footprint: 0.5, size: "tiny", budget: 5 });
    expect(r.start).toEqual({ x: 0, y: 0 });
    expect(feetAt(r, 0, 0)).toBe(0);
    expect(feetAt(r, 1, 1)).toBe(5);
  });
});

describe("what a step costs is the move counter's price (PHB 2014 'Difficult Terrain', 'Squeezing into a Smaller Space')", () => {
  it("a difficult square costs 10, and a cheaper detour around it is taken", () => {
    // Difficult at (1,0). Straight to (1,0) is 10 ft. To (2,0): straight is 10+5 = 15, but (0,0) -> (1,1) -> (2,0)
    // is two plain diagonals, 10 ft, so with a 10 ft budget (2,0) is reachable and the path avoids (1,0). Over (1,-1) and
    // (1,1) the tie goes to the earlier-settled one, the smaller y: (1,-1).
    const r = run({ budget: 10, difficult: ["1,0"] });
    expect(feetAt(r, 1, 0)).toBe(10);
    expect(feetAt(r, 2, 0)).toBe(10);
    expect(route(r, 2, 0)).toBe("0,0 1,-1 2,0");
  });

  it("a big token squeezing past a wall pays the squeeze on top (5 base + 5)", () => {
    // Large (2x2) at (0,0). A wall along x=1 from y=1 to y=3 cuts the Large's box at (0,1) down its middle, yet a
    // Small-size box in a corner of it is clear, so the step south into (0,1) is a squeeze: 5 + 5 = 10 ft.
    const r = run({ footprint: 2, size: "large", budget: 10, blocking: [wall("w", [1, 1], [1, 3])] });
    expect(feetAt(r, 0, 1)).toBe(10);
    expect(feetAt(r, 0, 2)).toBeUndefined(); // another squeeze would be 20 ft
  });
});

describe("walls and doors stop a step (app convention: touching a segment, even its end, blocks)", () => {
  it("a wall between two squares forces the way round", () => {
    // Mover at (0,1); a wall along x=1 for y 1 to 2 stands between (0,1) and (1,1). Round the end of it:
    // (0,1) -> (0,0) -> (1,0) -> (1,1), 15 ft. The diagonal (0,1) -> (1,0) would cut the wall's end point (1,1): blocked.
    const r = run({ at: { x: 0, y: 1 }, budget: 15, blocking: [wall("w", [1, 1], [1, 2])] });
    expect(feetAt(r, 1, 1)).toBe(15);
    expect(route(r, 1, 1)).toBe("0,1 0,0 1,0 1,1");
  });

  it("with no wall the same square is one step away", () => {
    const r = run({ at: { x: 0, y: 1 }, budget: 15 });
    expect(feetAt(r, 1, 1)).toBe(5);
  });

  it("a diagonal cannot slip through the corner where two walls meet", () => {
    // Walls along x=1 (y 0 to 1) and y=1 (x 0 to 1) meet at (1,1). Mover at (0,0) steps diagonally to (1,1): its
    // centre line (0.5,0.5) -> (1.5,1.5) passes exactly through that corner. Blocked, so (1,1) costs more than 5.
    const r = run({ budget: 20, blocking: [wall("a", [1, 0], [1, 1]), wall("b", [0, 1], [1, 1])] });
    expect(feetAt(r, 1, 1)).toBeGreaterThan(5);
  });

  it("a wall that does not lie between the squares blocks nothing", () => {
    // A wall far to the south, along y=5: moving east on row 0 is untouched.
    const r = run({ budget: 10, blocking: [wall("w", [-9, 5], [9, 5])] });
    expect(feetAt(r, 2, 0)).toBe(10);
  });

  it("solid rock cannot be entered", () => {
    // Rock at (1,0) inside a corridor: nothing past it on that row is reachable.
    const r = run({ budget: 30, blocking: CORRIDOR, solid: ["1,0"] });
    expect(feetAt(r, 1, 0)).toBeUndefined();
    expect(feetAt(r, 2, 0)).toBeUndefined();
  });

  it("a token cannot enter rock with any square of its box", () => {
    // Large at (0,0). Rock at (3,1). Stepping east to (2,0) would cover (3,1): refused. (1,0) covers x 1-2 only.
    const r = run({ footprint: 2, size: "large", budget: 10, solid: ["3,1"] });
    expect(feetAt(r, 1, 0)).toBe(5);
    expect(feetAt(r, 2, 0)).toBeUndefined();
  });
});

describe("moving around other creatures, 2014 (PHB ch. 9 'Moving Around Other Creatures')", () => {
  // Corridor row 0, mover at (0,0), the other creature at (1,0).
  it("passes through a nonhostile creature, pays difficult terrain for its square, and cannot stop in it", () => {
    // (1,0) costs 10 (another creature's space is difficult terrain), (2,0) costs 5 more = 15.
    const r = run({ budget: 15, blocking: CORRIDOR, others: [creature(1, 0, "medium")] });
    expect(feetAt(r, 1, 0)).toBeUndefined();
    expect(feetAt(r, 2, 0)).toBe(15);
    expect(feetAt(run({ budget: 10, blocking: CORRIDOR, others: [creature(1, 0, "medium")] }), 2, 0)).toBeUndefined();
  });

  it("cannot pass a hostile creature of its own size", () => {
    const r = run({ budget: 30, blocking: CORRIDOR, others: [creature(1, 0, "medium", { hostile: true })] });
    expect(feetAt(r, 2, 0)).toBeUndefined();
  });

  it("cannot pass a hostile creature only one size larger", () => {
    // Medium (rank 2) against Large (rank 3): one size apart, so blocked.
    const r = run({ budget: 40, blocking: CORRIDOR, others: [creature(1, 0, "large", { hostile: true })] });
    expect(feetAt(r, 3, 0)).toBeUndefined();
  });

  it("passes a hostile creature two sizes larger", () => {
    // Small (rank 1) against Large (rank 3): two apart. Large covers (1,0) and (2,0) (both on the corridor row),
    // each difficult: 10 + 10, then (3,0) at 5 = 25.
    const r = run({ size: "small", budget: 25, blocking: CORRIDOR, others: [creature(1, 0, "large", { hostile: true })] });
    expect(feetAt(r, 3, 0)).toBe(25);
    expect(feetAt(r, 2, 0)).toBeUndefined(); // inside the Large's space
  });

  it("does not let a Small pass a hostile Tiny (only two sizes apart passes)", () => {
    // Small (1) against Tiny (0): one apart. In 2014 blocked (2024 lets it by, below).
    const r = run({ size: "small", budget: 30, blocking: CORRIDOR, others: [creature(1, 0, "tiny", { hostile: true })] });
    expect(feetAt(r, 2, 0)).toBeUndefined();
  });

  it("does not let a hostile Incapacitated creature be passed", () => {
    const r = run({ budget: 30, blocking: CORRIDOR, others: [creature(1, 0, "medium", { hostile: true, incapacitated: true })] });
    expect(feetAt(r, 2, 0)).toBeUndefined();
  });
});

describe("moving around other creatures, 2024 (PHB 2024 'Moving around Other Creatures'; unverified against the text)", () => {
  it("an ally's space is not difficult terrain: (1,0) would cost 5, so (2,0) costs 10", () => {
    const r = run({ ruleset: "2024", budget: 10, blocking: CORRIDOR, others: [creature(1, 0, "medium")] });
    expect(feetAt(r, 2, 0)).toBe(10);
  });

  it("passes a hostile Tiny creature, and its space is not difficult terrain", () => {
    const r = run({ ruleset: "2024", size: "small", budget: 10, blocking: CORRIDOR, others: [creature(1, 0, "tiny", { hostile: true })] });
    expect(feetAt(r, 2, 0)).toBe(10);
  });

  it("passes a hostile Incapacitated creature, but its space is difficult terrain", () => {
    // (1,0) costs 10, (2,0) 5 more: 15 and not 10.
    const r = run({ ruleset: "2024", budget: 15, blocking: CORRIDOR, others: [creature(1, 0, "medium", { hostile: true, incapacitated: true })] });
    expect(feetAt(r, 2, 0)).toBe(15);
    expect(feetAt(run({ ruleset: "2024", budget: 10, blocking: CORRIDOR, others: [creature(1, 0, "medium", { hostile: true, incapacitated: true })] }), 2, 0)).toBeUndefined();
  });

  it("still cannot pass a conscious hostile creature of its own size", () => {
    const r = run({ ruleset: "2024", budget: 30, blocking: CORRIDOR, others: [creature(1, 0, "medium", { hostile: true })] });
    expect(feetAt(r, 2, 0)).toBeUndefined();
  });
});

describe("determinism and who is hostile", () => {
  it("picks the same path every time, the earlier-settled neighbour on a tie", () => {
    // (0,0) to (2,1) in two steps: via (1,0) or via (1,1), both 10 ft. (1,0) settles first (smaller y), so it wins.
    const a = run({ budget: 10 });
    const b = run({ budget: 10 });
    expect(route(a, 2, 1)).toBe("0,0 1,0 2,1");
    expect(route(b, 2, 1)).toBe(route(a, 2, 1));
  });
});

describe("the edge of the map (#1202): a step that would cover a cell off the picture is refused", () => {
  // A picture 16 squares across and 12 down (1000 by 750 px: 16 x 0.75 = 12 rows), so x runs 0 to 15 and y runs 0 to 11.
  const EDGES = { minX: 0, minY: 0, maxX: 15, maxY: 11 };

  it("the last column and the last row are reachable and the one past each is not", () => {
    // Bug it fails on: no edge at all, so a fleeing creature ran to x = -10. Mover at (14,10) with 15 ft (three squares):
    // x can reach 15 (1 step) but not 16; y can reach 11 but not 12.
    const r = run({ at: { x: 14, y: 10 }, budget: 15, bounds: EDGES });
    expect(feetAt(r, 15, 10)).toBe(5);
    expect(feetAt(r, 16, 10)).toBeUndefined();
    expect(feetAt(r, 14, 11)).toBe(5);
    expect(feetAt(r, 14, 12)).toBeUndefined();
    expect(feetAt(r, 15, 11)).toBe(5);
    expect(feetAt(r, 16, 12)).toBeUndefined();
  });

  it("the first column and the first row are reachable and the one before each is not", () => {
    // Bug it fails on: bounding only the far side. Mover at (1,1), 15 ft: (0,0) is one diagonal step; (-1,0) and (0,-1) are off.
    const r = run({ at: { x: 1, y: 1 }, budget: 15, bounds: EDGES });
    expect(feetAt(r, 0, 0)).toBe(5);
    expect(feetAt(r, -1, 0)).toBeUndefined();
    expect(feetAt(r, 0, -1)).toBeUndefined();
  });

  it("a Large creature may not stand with its far cells off the picture", () => {
    // Bug it fails on: checking only the anchor. A Large (2x2) anchored at (14,10) covers 14..15 by 10..11: on the map.
    // Anchored at (15,10) it would cover x = 16: refused. Anchored at (14,11) it would cover y = 12: refused.
    const r = run({ at: { x: 14, y: 10 }, size: "large", footprint: 2, budget: 15, bounds: EDGES });
    expect(feetAt(r, 14, 10)).toBe(0);
    expect(feetAt(r, 15, 10)).toBeUndefined();
    expect(feetAt(r, 14, 11)).toBeUndefined();
    expect(feetAt(r, 13, 9)).toBe(5);
  });

  it("a creature that old data left off the map may step back onto it but not further out", () => {
    // Bug it fails on: judging the bounds only from the start, so a creature already at x = 16 could keep walking away.
    // Mover at (16,5), 15 ft: (15,5) is back on the map; (17,5) is further out.
    const r = run({ at: { x: 16, y: 5 }, budget: 15, bounds: EDGES });
    expect(feetAt(r, 15, 5)).toBe(5);
    expect(feetAt(r, 14, 5)).toBe(10);
    expect(feetAt(r, 17, 5)).toBeUndefined();
    expect(feetAt(r, 16, 5)).toBe(0);
  });
});
