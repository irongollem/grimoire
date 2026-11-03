import { describe, expect, it } from "vitest";
import {
  OPEN_GROUND,
  groupMove,
  moveLabel,
  planMove,
  snapAnchor,
  stepStates,
  type MoveTerrain,
} from "./movement";
import type { WallSegment } from "./walls";

const wall = (id: string, a: [number, number], b: [number, number]): WallSegment => ({ id, a, b });
const open = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  planMove({ from, to, footprint: 1, terrain: OPEN_GROUND }).steps.map((s) => s.to);
const squeezes = (at: { x: number; y: number }, footprint: number, walls: WallSegment[]) =>
  planMove({ from: { x: at.x - 1, y: at.y }, to: at, footprint, terrain: { difficult: new Set(), walls } }).steps[0].squeezing;
const terrain = (difficult: string[], walls: WallSegment[] = []): MoveTerrain => ({ difficult: new Set(difficult), walls });

describe("a move costs 5 ft a square", () => {
  // PHB 2014 "Movement and Position" / PHB 2024 "Moving": a diagonal square is 5 ft like any other.
  it("a diagonal step is 5 ft, not 7", () => {
    const plan = planMove({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, footprint: 1, terrain: OPEN_GROUND });
    expect(plan.feet).toBe(5);
  });

  it("four squares across and three down is four steps, 20 ft: the diagonals do not cost extra", () => {
    const plan = planMove({ from: { x: 0, y: 0 }, to: { x: 4, y: 3 }, footprint: 1, terrain: OPEN_GROUND });
    expect(plan.steps).toHaveLength(4);
    expect(plan.feet).toBe(20);
  });

  it("goes diagonally first, then straight, and ends on the target", () => {
    const cells = open({ x: 0, y: 0 }, { x: 3, y: 1 });
    expect(cells).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it("walks backwards as well as forwards", () => {
    expect(open({ x: 2, y: 2 }, { x: 0, y: 1 })).toEqual([
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it("staying put costs nothing", () => {
    expect(planMove({ from: { x: 2, y: 2 }, to: { x: 2, y: 2 }, footprint: 1, terrain: OPEN_GROUND }).feet).toBe(0);
  });

  it("a waypoint bends the path, and the bend is paid for", () => {
    // Straight (0,0) -> (4,0) is 4 squares; going via (0,3) first is 3 down, then 4 across on the diagonal.
    const bent = planMove({ from: { x: 0, y: 0 }, via: [{ x: 0, y: 3 }], to: { x: 4, y: 0 }, footprint: 1, terrain: OPEN_GROUND });
    expect(bent.feet).toBe(5 * (3 + 4));
    expect(bent.steps[2].to).toEqual({ x: 0, y: 3 });
  });
});

describe("difficult terrain", () => {
  // PHB 2014 / 2024 "Difficult Terrain": each foot costs 1 extra foot, so a square is 10 ft.
  it("a square in a difficult zone costs 10 ft, the others 5", () => {
    const plan = planMove({ from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, footprint: 1, terrain: terrain(["2,0"]) });
    expect(plan.steps.map((s) => s.feet)).toEqual([5, 10, 5]);
    expect(plan.feet).toBe(20);
    expect(plan.difficult).toBe(true);
  });

  it("the square you leave does not count, only the one you enter", () => {
    const plan = planMove({ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, footprint: 1, terrain: terrain(["1,0"]) });
    expect(plan.feet).toBe(5);
    expect(plan.difficult).toBe(false);
  });

  it("a Large token is slowed when any square it covers is difficult", () => {
    // Large, anchored at (3,0), covers (3,0) (4,0) (3,1) (4,1); only (4,1) is difficult.
    const plan = planMove({ from: { x: 2, y: 0 }, to: { x: 3, y: 0 }, footprint: 2, terrain: terrain(["4,1"]) });
    expect(plan.feet).toBe(10);
  });
});

describe("squeezing", () => {
  // PHB 2014 / 2024 "Squeezing into a Smaller Space": a gap one size smaller costs 1 extra foot per foot.
  // A Large token (2x2) wedged across a wall that a Medium token would clear.
  const across = [wall("w", [3, 0], [3, 2])];

  it("a Large token whose box is cut by a wall a Medium one would clear is squeezing", () => {
    expect(squeezes({ x: 2, y: 0 }, 2, across)).toBe(true);
  });

  it("a wall along the edge of the box is not squeezing", () => {
    expect(squeezes({ x: 3, y: 0 }, 2, across)).toBe(false);
  });

  it("a Medium token never squeezes: there is no smaller box on the grid", () => {
    expect(squeezes({ x: 2, y: 0 }, 1, [wall("w", [2.5, 0], [2.5, 2])])).toBe(false);
  });

  it("a box crossed by walls in every corner has no smaller box that fits, so it is not a squeeze", () => {
    const cage = [wall("a", [2, 0], [4, 2]), wall("b", [4, 0], [2, 2])];
    expect(squeezes({ x: 2, y: 0 }, 2, cage)).toBe(false);
  });

  it("a squeezed step costs 10 ft and the plan says so", () => {
    const plan = planMove({ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, footprint: 2, terrain: terrain([], across) });
    expect(plan.steps[0]).toMatchObject({ feet: 10, squeezing: true });
    expect(plan.squeezing).toBe(true);
  });

  it("squeezing through difficult ground stacks: 15 ft a square", () => {
    const plan = planMove({ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, footprint: 2, terrain: terrain(["2,0"], across) });
    expect(plan.feet).toBe(15);
  });
});

describe("speed", () => {
  // PHB "Dash": extra movement equal to speed, so up to twice the speed.
  it("within the speed, then a Dash up to twice it, then beyond", () => {
    // One 5 ft square at a time, so the totals land on 30, 35, 60 and 65 against a speed of 30.
    const plan = planMove({ from: { x: 0, y: 0 }, to: { x: 13, y: 0 }, footprint: 1, terrain: OPEN_GROUND });
    const states = stepStates(plan, 0, 30);
    expect(states[5]).toBe("within");
    expect(states[6]).toBe("dash");
    expect(states[11]).toBe("dash");
    expect(states[12]).toBe("beyond");
  });

  it("feet already moved this turn count against the speed", () => {
    const plan = planMove({ from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, footprint: 1, terrain: OPEN_GROUND });
    // 25 ft moved already, speed 30: steps land at 30 (within), 35, 40, 45 (dash).
    expect(stepStates(plan, 25, 30)).toEqual(["within", "dash", "dash", "dash"]);
  });

  it("a long path turns red where it passes twice the speed", () => {
    const plan = planMove({ from: { x: 0, y: 0 }, to: { x: 14, y: 0 }, footprint: 1, terrain: OPEN_GROUND });
    const states = stepStates(plan, 0, 30);
    expect(states[5]).toBe("within");
    expect(states[6]).toBe("dash");
    expect(states[11]).toBe("dash");
    expect(states[12]).toBe("beyond");
  });
});

describe("the label on a path", () => {
  it("names a Dash and what made the path dear", () => {
    const plan = { feet: 40, difficult: true, squeezing: false };
    expect(moveLabel(plan, 0, 30)).toBe("40 ft · a Dash · difficult terrain");
  });

  it("says 'squeezing' for a squeeze and nothing about speed when none is known", () => {
    expect(moveLabel({ feet: 10, difficult: false, squeezing: true }, 0, null)).toBe("10 ft · squeezing");
  });

  it("a path past twice the speed says so", () => {
    expect(moveLabel({ feet: 65, difficult: false, squeezing: false }, 0, 30)).toBe("65 ft · past a Dash");
  });

  it("a Dash counts the feet already moved this turn, but the label shows only this path", () => {
    expect(moveLabel({ feet: 15, difficult: false, squeezing: false }, 20, 30)).toBe("15 ft · a Dash");
  });
});

describe("moving together", () => {
  const party = [
    { id: "a", position: { x: 1, y: 1 }, footprint: 1 },
    { id: "b", position: { x: 2, y: 1 }, footprint: 1 },
    { id: "c", position: { x: 1, y: 2 }, footprint: 1 },
  ];

  it("everyone moves by the leader's own offset, so the formation keeps its shape", () => {
    const g = groupMove({ members: party, leaderId: "a", leaderTo: { x: 5, y: 4 }, terrain: OPEN_GROUND });
    expect(g.moves.map((m) => [m.id, m.plan.to])).toEqual([
      ["a", { x: 5, y: 4 }],
      ["b", { x: 6, y: 4 }],
      ["c", { x: 5, y: 5 }],
    ]);
  });

  it("reports the dearest member's cost, so one in rough ground is not hidden", () => {
    const g = groupMove({ members: party, leaderId: "a", leaderTo: { x: 3, y: 1 }, terrain: terrain(["4,1"]) });
    // a: 2 squares (10 ft); b ends at (4,1), difficult: 2 squares, one of them 10 ft (15 ft).
    expect(g.feet).toBe(15);
  });

  it("an unknown leader moves nobody", () => {
    expect(groupMove({ members: party, leaderId: "zz", leaderTo: { x: 0, y: 0 }, terrain: OPEN_GROUND }).moves).toEqual([]);
  });
});

describe("where the token sits", () => {
  it("a Medium token's middle at the pointer takes the square under it", () => {
    expect(snapAnchor({ x: 3.4, y: 2.9 }, 1)).toEqual({ x: 3, y: 2 });
  });

  it("a Large token's middle at the pointer sits on the grid corner nearest it", () => {
    expect(snapAnchor({ x: 3.4, y: 2.9 }, 2)).toEqual({ x: 2, y: 2 });
  });

  it("a Tiny token snaps to half squares so four can share one", () => {
    expect(snapAnchor({ x: 3.6, y: 2.2 }, 0.5)).toEqual({ x: 3.5, y: 2 });
  });

  // PHB 2024 "Creature Size": a Huge creature covers 3x3 squares; a Tiny one shares a single square.
  it("a Huge creature is slowed by difficult ground in any of its nine squares", () => {
    const corner = planMove({ from: { x: 0, y: 3 }, to: { x: 1, y: 3 }, footprint: 3, terrain: terrain(["3,5"]) });
    expect(corner.difficult).toBe(true);
    const outside = planMove({ from: { x: 0, y: 3 }, to: { x: 1, y: 3 }, footprint: 3, terrain: terrain(["4,5"]) });
    expect(outside.difficult).toBe(false);
  });

  it("a Tiny creature is slowed by the one square it stands in, not its neighbours", () => {
    const here = planMove({ from: { x: 1, y: 3 }, to: { x: 2.5, y: 3 }, footprint: 0.5, terrain: terrain(["2,3"]) });
    expect(here.difficult).toBe(true);
    const next = planMove({ from: { x: 1, y: 3 }, to: { x: 2.5, y: 3 }, footprint: 0.5, terrain: terrain(["3,3"]) });
    expect(next.difficult).toBe(false);
  });
});
