/**
 * A gentle pull between people in the same faction.
 *
 * Without it a hull is drawn around wherever the relationship forces happened to
 * scatter a faction's members, which is usually a long thin shape wrapping half
 * the graph and overlapping everyone else. Nudging co-members together first
 * makes containment legible.
 *
 * Deliberately weak. The subject of this view is the relationships, and a strong
 * clustering force would rearrange the graph around org charts instead — the
 * same mistake as making factions nodes, arrived at through physics. It should
 * tighten a group that is already loosely together, not drag one across the map.
 */
export const FACTION_CLUSTER_STRENGTH = 0.06;

export interface ClusterNode {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

/**
 * A d3-force custom force.
 *
 * Groups are read through a getter on every tick rather than captured when the
 * force is built: `createSimulation` runs once, when the graph activates, and
 * membership arrives from its own query some time after that. A snapshot here is
 * empty forever on a cold load, which looks exactly like the force not working.
 */
export function factionClusteringForce(
  getGroups: () => ReadonlyMap<string, ReadonlySet<string>>,
  strength = FACTION_CLUSTER_STRENGTH,
) {
  let nodes: ClusterNode[] = [];

  const force = (alpha: number): void => {
    const byId = new Map(nodes.map((n) => [n.id, n]));

    for (const members of getGroups().values()) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const id of members) {
        const node = byId.get(id);
        if (!node || node.x === undefined || node.y === undefined) continue;
        sumX += node.x;
        sumY += node.y;
        count++;
      }
      // One member has nothing to cluster with, and pulling it toward itself
      // would be a no-op that still costs a pass.
      if (count < 2) continue;

      const cx = sumX / count;
      const cy = sumY / count;
      const k = alpha * strength;

      for (const id of members) {
        const node = byId.get(id);
        if (!node || node.x === undefined || node.y === undefined) continue;
        node.vx = (node.vx ?? 0) + (cx - node.x) * k;
        node.vy = (node.vy ?? 0) + (cy - node.y) * k;
      }
    }
  };

  force.initialize = (simulationNodes: ClusterNode[]): void => {
    nodes = simulationNodes;
  };

  return force;
}
