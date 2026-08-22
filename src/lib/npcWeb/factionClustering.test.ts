import { describe, expect, it } from "vitest";

import { factionClusteringForce, type ClusterNode } from "./factionClustering";

function run(nodes: ClusterNode[], groups: Map<string, Set<string>>, alpha = 1) {
  const force = factionClusteringForce(() => groups);
  force.initialize(nodes);
  force(alpha);
  return nodes;
}

describe("factionClusteringForce", () => {
  it("pulls co-members toward each other", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -100, y: 0, vx: 0, vy: 0 },
      { id: "b", x: 100, y: 0, vx: 0, vy: 0 },
    ];
    run(nodes, new Map([["f", new Set(["a", "b"])]]));

    // Centroid is the origin, so each is nudged inward.
    expect(nodes[0].vx!).toBeGreaterThan(0);
    expect(nodes[1].vx!).toBeLessThan(0);
  });

  it("leaves nodes outside the focused groups alone", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -100, y: 0, vx: 0, vy: 0 },
      { id: "b", x: 100, y: 0, vx: 0, vy: 0 },
      { id: "loner", x: 500, y: 500, vx: 0, vy: 0 },
    ];
    run(nodes, new Map([["f", new Set(["a", "b"])]]));

    expect(nodes[2].vx).toBe(0);
    expect(nodes[2].vy).toBe(0);
  });

  it("does nothing for a faction of one", () => {
    const nodes: ClusterNode[] = [{ id: "a", x: 10, y: 10, vx: 0, vy: 0 }];
    run(nodes, new Map([["f", new Set(["a"])]]));
    expect(nodes[0].vx).toBe(0);
  });

  // Membership arrives from its own query after the simulation is built, so a
  // force that captured its groups would be empty forever on a cold load.
  it("reads groups on every tick rather than capturing them", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -100, y: 0, vx: 0, vy: 0 },
      { id: "b", x: 100, y: 0, vx: 0, vy: 0 },
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

  // Weak on purpose: relationships are the subject, and a strong pull would
  // rearrange the graph around org charts instead.
  it("scales with alpha so it fades as the simulation cools", () => {
    const hot: ClusterNode[] = [{ id: "a", x: -100, y: 0, vx: 0, vy: 0 }, { id: "b", x: 100, y: 0, vx: 0, vy: 0 }];
    const cool: ClusterNode[] = [{ id: "a", x: -100, y: 0, vx: 0, vy: 0 }, { id: "b", x: 100, y: 0, vx: 0, vy: 0 }];
    run(hot, new Map([["f", new Set(["a", "b"])]]), 1);
    run(cool, new Map([["f", new Set(["a", "b"])]]), 0.1);

    expect(hot[0].vx!).toBeGreaterThan(cool[0].vx!);
  });

  it("ignores members with no position yet", () => {
    const nodes: ClusterNode[] = [
      { id: "a", x: -100, y: 0, vx: 0, vy: 0 },
      { id: "b", vx: 0, vy: 0 },
    ];
    expect(() => run(nodes, new Map([["f", new Set(["a", "b"])]]))).not.toThrow();
    expect(Number.isNaN(nodes[0].vx)).toBe(false);
  });
});
