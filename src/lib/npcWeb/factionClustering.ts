/**
 * A gentle pull between people in the same faction.
 *
 * Membership is a relationship the graph would otherwise throw away. Its edges
 * only know what two people are to each other; that two people answer to the same
 * banner is recorded on `faction_npcs` and, without this, has no bearing on where
 * either of them ends up.
 *
 * ## Why this is here twice
 *
 * It was added, removed, and restored. The removal was a mistake worth recording,
 * because the reasoning was wrong in an instructive way: a faction's fence had
 * come out as a long sliver, I inferred from that picture that the force was not
 * working, and deleted it. The sliver had a different cause — members genuinely
 * far apart, since fixed by drawing one shape per proximity group — and the
 * inference was never measured.
 *
 * What brought it back is the case it exists for: a member of one faction sitting
 * alone in the far corner of the map, every reload. That NPC's tie to those
 * people is real and already recorded — it is his `faction_npcs` row, with its
 * role and status — so the layout ignoring it was the graph discarding data it
 * had. The alternative was asking a DM to hand-write an NPC-to-NPC relation for
 * every pair in a faction, to say something membership already says.
 *
 * ## A neighbourhood, not a point
 *
 * The pull only applies to members further from their faction's centre than
 * `FACTION_GATHER_RADIUS`, and only to the excess. That rest distance is the
 * whole design, not a refinement.
 *
 * Without one this is a spring with zero rest length: it pulls until something
 * physically stops it, which is `forceCollide` at roughly 100 units. Measured,
 * co-members then sat *closer* than people with an actual relationship between
 * them — 118 against 147 — which says a shared banner is a stronger tie than
 * knowing someone, the opposite of what is true. Lowering the strength did not
 * help and could not: at 0.08 they still collapsed to the same floor, because
 * weakening a spring changes how fast it closes, not where it stops.
 *
 * With a rest radius, membership sets an outer bound — "these people are in the
 * same part of the map" — and inside it everyone is placed by their actual
 * relationships. That is the ordering it has to produce:
 *
 *     people who know each other  <  same faction  <  unrelated
 */
export const FACTION_CLUSTER_STRENGTH = 0.35;

/**
 * How far a member may sit from their faction's centre before it pulls.
 *
 * Comfortably above the layout's link distance of 100, so a relationship still
 * decides who stands next to whom; a faction only decides which neighbourhood
 * they are all standing in.
 */
export const FACTION_GATHER_RADIUS = 190;

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
  gatherRadius = FACTION_GATHER_RADIUS,
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

        const dx = cx - node.x;
        const dy = cy - node.y;
        const distance = Math.hypot(dx, dy);
        // Already in the neighbourhood: leave them exactly where their
        // relationships put them. This is what stops the group collapsing onto
        // its own centre.
        if (distance <= gatherRadius) continue;

        // Pull the excess only, so the further out a straggler is the harder
        // they are drawn back — and the pull vanishes as they arrive.
        const excess = (distance - gatherRadius) / distance;
        node.vx = (node.vx ?? 0) + dx * excess * k;
        node.vy = (node.vy ?? 0) + dy * excess * k;
      }
    }
  };

  force.initialize = (simulationNodes: ClusterNode[]): void => {
    nodes = simulationNodes;
  };

  return force;
}
