import { describe, expect, it } from "vitest";

import {
  GROUP_CLUSTER_STRENGTH,
  GROUP_GATHER_RADIUS,
  groupClusteringForce,
  groupFenceForce,
  type ClusterNode,
} from "./groupClustering";

/** Comfortably outside the neighbourhood, so the force has work to do. */
const FAR = GROUP_GATHER_RADIUS * 2;

function run(nodes: ClusterNode[], groups: Map<string, Set<string>>, alpha = 1) {
  const force = groupClusteringForce(() => groups);
  force.initialize(nodes);
  force(alpha);
  return nodes;
}

describe("groupClusteringForce", () => {
  it("draws distant co-members toward each other", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -FAR, y: 0, vx: 0, vy: 0 },
      { id: "b", x: FAR, y: 0, vx: 0, vy: 0 },
    ];
    run(nodes, new Map([["f", new Set(["a", "b"])]]));

    // Centroid is the origin, so each is nudged inward.
    expect(nodes[0].vx!).toBeGreaterThan(0);
    expect(nodes[1].vx!).toBeLessThan(0);
  });

  // The rest distance is the design, not a refinement. Without it this is a
  // spring with zero rest length: it pulls until forceCollide physically stops
  // it, and measured on a real graph co-members then sat *closer* than people
  // with an actual relationship — a shared banner reading as a stronger tie than
  // knowing someone. Weakening it does not help, because strength changes how
  // fast a spring closes, not where it stops.
  it("leaves members already in the neighbourhood exactly where they are", () => {
    const near = GROUP_GATHER_RADIUS * 0.5;
    const nodes: ClusterNode[] = [
      { id: "a", x: -near, y: 0, vx: 0, vy: 0 },
      { id: "b", x: near, y: 0, vx: 0, vy: 0 },
    ];
    run(nodes, new Map([["f", new Set(["a", "b"])]]));

    expect(nodes[0].vx).toBe(0);
    expect(nodes[1].vx).toBe(0);
  });

  // Only the excess is pulled, so arriving at the boundary is where it stops
  // rather than somewhere past it.
  it("pulls the straggler harder the further out they are", () => {
    const pullAt = (x: number) => {
      const nodes: ClusterNode[] = [
        { id: "a", x, y: 0, vx: 0, vy: 0 },
        { id: "b", x: -x, y: 0, vx: 0, vy: 0 },
      ];
      run(nodes, new Map([["f", new Set(["a", "b"])]]));
      return Math.abs(nodes[0].vx!);
    };

    expect(pullAt(GROUP_GATHER_RADIUS * 4)).toBeGreaterThan(pullAt(GROUP_GATHER_RADIUS * 1.2));
  });

  it("pulls exactly the excess past the neighbourhood, scaled by alpha and strength", () => {
    const over = 10;
    const x = GROUP_GATHER_RADIUS + over;
    const nodes: ClusterNode[] = [
      { id: "a", x: -x, y: 0, vx: 0, vy: 0 },
      { id: "b", x, y: 0, vx: 0, vy: 0 },
    ];
    run(nodes, new Map([["f", new Set(["a", "b"])]]), 0.5);
    // Each sits `over` beyond the radius from the centroid, so it is drawn in by over * alpha * strength.
    expect(nodes[0].vx).toBeCloseTo(over * 0.5 * GROUP_CLUSTER_STRENGTH);
    expect(nodes[1].vx).toBeCloseTo(-over * 0.5 * GROUP_CLUSTER_STRENGTH);
  });

  it("leaves nodes outside the groups alone", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -FAR, y: 0, vx: 0, vy: 0 },
      { id: "b", x: FAR, y: 0, vx: 0, vy: 0 },
      { id: "loner", x: 5000, y: 5000, vx: 0, vy: 0 },
    ];
    run(nodes, new Map([["f", new Set(["a", "b"])]]));

    expect(nodes[2].vx).toBe(0);
    expect(nodes[2].vy).toBe(0);
  });

  it("does nothing for a faction of one", () => {
    const nodes: ClusterNode[] = [{ id: "a", x: FAR, y: FAR, vx: 0, vy: 0 }];
    run(nodes, new Map([["f", new Set(["a"])]]));
    expect(nodes[0].vx).toBe(0);
  });

  // Membership arrives from its own query after the simulation is built, so a
  // force that captured its groups would be empty forever on a cold load.
  it("reads groups on every tick rather than capturing them", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -FAR, y: 0, vx: 0, vy: 0 },
      { id: "b", x: FAR, y: 0, vx: 0, vy: 0 },
    ];
    const groups = new Map<string, Set<string>>();
    const force = groupClusteringForce(() => groups);
    force.initialize(nodes);

    force(1);
    expect(nodes[0].vx).toBe(0);

    groups.set("f", new Set(["a", "b"]));
    force(1);
    expect(nodes[0].vx!).toBeGreaterThan(0);
  });

  it("scales with alpha so it fades as the simulation cools", () => {
    const at = (alpha: number) => {
      const nodes: ClusterNode[] = [
        { id: "a", x: -FAR, y: 0, vx: 0, vy: 0 },
        { id: "b", x: FAR, y: 0, vx: 0, vy: 0 },
      ];
      run(nodes, new Map([["f", new Set(["a", "b"])]]), alpha);
      return nodes[0].vx!;
    };

    expect(at(1)).toBeGreaterThan(at(0.1));
  });

  it("ignores members with no position yet", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -FAR, y: 0, vx: 0, vy: 0 },
      { id: "b", vx: 0, vy: 0 },
    ];
    expect(() => run(nodes, new Map([["f", new Set(["a", "b"])]]))).not.toThrow();
    expect(Number.isNaN(nodes[0].vx)).toBe(false);
  });
});

describe("groupFenceForce", () => {
  const nodes = (): ClusterNode[] => [
    { id: "gate", x: 0, y: 500, vx: 0, vy: 0 },
    { id: "a", x: -100, y: 0, vx: 0, vy: 0 },
    { id: "b", x: 100, y: 0, vx: 0, vy: 0 },
  ];

  it("draws the group's own node to the outline above its members", () => {
    const list = nodes();
    const force = groupFenceForce(() => ({ anchor: "gate", members: new Set(["a", "b"]) }));
    force.initialize(list);
    force(1);
    // Centroid is (0, 0) and the reach is 100, so the target is well above the members.
    expect(list[0].vy!).toBeLessThan(0);
    expect(list[0].vx!).toBeCloseTo(0);
  });

  it("draws the node up beside the members' centroid, not down", () => {
    const list: ClusterNode[] = [
      { id: "gate", x: 40, y: 0, vx: 0, vy: 0 },
      { id: "a", x: -100, y: 0, vx: 0, vy: 0 },
      { id: "b", x: 100, y: 0, vx: 0, vy: 0 },
    ];
    const force = groupFenceForce(() => ({ anchor: "gate", members: new Set(["a", "b"]) }));
    force.initialize(list);
    force(1);
    expect(list[0].vy!).toBeLessThan(0); // screen y grows downward: the fence node is pulled above the shape
    expect(list[0].vx!).toBeLessThan(0); // and in toward the centroid's x
  });

  it("leaves the members where they are", () => {
    const list = nodes();
    const force = groupFenceForce(() => ({ anchor: "gate", members: new Set(["a", "b"]) }));
    force.initialize(list);
    force(1);
    expect([list[1].vx, list[1].vy, list[2].vx, list[2].vy]).toEqual([0, 0, 0, 0]);
  });

  it("does nothing when nothing is grouped", () => {
    const list = nodes();
    const force = groupFenceForce(() => null);
    force.initialize(list);
    force(1);
    expect(list[0].vy).toBe(0);
  });
});
