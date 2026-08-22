import { describe, expect, it } from "vitest";

import {
  FACTION_GATHER_RADIUS,
  factionClusteringForce,
  type ClusterNode,
} from "./factionClustering";

/** Comfortably outside the neighbourhood, so the force has work to do. */
const FAR = FACTION_GATHER_RADIUS * 2;

function run(nodes: ClusterNode[], groups: Map<string, Set<string>>, alpha = 1) {
  const force = factionClusteringForce(() => groups);
  force.initialize(nodes);
  force(alpha);
  return nodes;
}

describe("factionClusteringForce", () => {
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
    const near = FACTION_GATHER_RADIUS * 0.5;
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

    expect(pullAt(FACTION_GATHER_RADIUS * 4)).toBeGreaterThan(pullAt(FACTION_GATHER_RADIUS * 1.2));
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
    const force = factionClusteringForce(() => groups);
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
