/**
 * Faction membership as a badge on a graph node.
 *
 * A faction is not a peer of an NPC, so it is deliberately not a node: a
 * twelve-member guild drawn as a hub is a twelve-spoke star, and force layouts
 * give hubs enormous influence — the stars would dominate the layout and push
 * the NPC-to-NPC edges, which are the actual subject of the view, out to the
 * rim. Membership is also a different *kind* of fact from a relationship:
 * "Froya and Grynsk are rivals" is a relation, "Froya is in the Harbormasters"
 * is an attribute, and drawing both as lines makes them look comparable.
 *
 * So membership is encoded on the node instead. The emblem carries it rather
 * than a colour, because fill already means attitude-to-party and a campaign can
 * hold twenty factions against roughly seven distinguishable hues.
 */

/** Memberships that mean "currently in". Everything else is a former tie. */
const ACTIVE_STATUS = "Active";

/**
 * How many emblems fit beside a node before they crowd the edges around it.
 * Three, then a "+N" — measured against an 18px node radius and a 6px pip.
 */
export const MAX_PIPS = 3;

export interface FactionPip {
  factionId: string;
  factionName: string;
  emblemUrl: string | null;
  /** "Leader", "Informant"… Shown in the badge's tooltip, which is the only
   *  place the graph can say *how* someone belongs rather than just that they do. */
  role: string | null;
  /** The raw membership status, so the tooltip can name a former tie rather
   *  than leaving the reader to infer it from the fade. */
  status: string;
  /** First letter, for the fallback when a faction has no emblem uploaded. */
  initial: string;
  /**
   * `false` for Retired/Defected/Expelled/Deceased. Drawn faded rather than
   * dropped: an expelled member is exactly the kind of tie a DM opens this view
   * to find, and silently hiding it would make the graph disagree with the
   * faction sheet.
   */
  active: boolean;
}

export interface NodeFactionBadges {
  pips: FactionPip[];
  /** Memberships beyond MAX_PIPS, as a count. 0 when everything fits. */
  overflow: number;
}

interface MembershipRow {
  faction_id: string;
  role: string | null;
  status: string;
  faction: { id: string; name: string; emblem_url: string | null };
}

function toPip(row: MembershipRow): FactionPip {
  return {
    factionId: row.faction_id,
    factionName: row.faction.name,
    emblemUrl: row.faction.emblem_url,
    initial: row.faction.name.trim().charAt(0).toUpperCase() || "?",
    role: row.role,
    status: row.status,
    active: row.status === ACTIVE_STATUS,
  };
}

/**
 * Group membership rows onto graph node keys.
 *
 * Active memberships sort first so the three that survive the cap are the ones
 * that describe the NPC now; ties break on faction name so the badge order is
 * stable between renders rather than following row insertion order.
 */
export function factionBadgesByNode<T extends MembershipRow>(
  rows: readonly T[],
  nodeKey: (row: T) => string,
): Map<string, NodeFactionBadges> {
  const grouped = new Map<string, FactionPip[]>();

  for (const row of rows) {
    if (!row.faction) continue;
    const key = nodeKey(row);
    const pips = grouped.get(key);
    if (pips) pips.push(toPip(row));
    else grouped.set(key, [toPip(row)]);
  }

  const result = new Map<string, NodeFactionBadges>();
  for (const [key, pips] of grouped) {
    pips.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.factionName.localeCompare(b.factionName);
    });
    result.set(key, {
      pips: pips.slice(0, MAX_PIPS),
      overflow: Math.max(0, pips.length - MAX_PIPS),
    });
  }
  return result;
}

/**
 * Where each emblem sits relative to its node's centre, in graph coordinates.
 *
 * Top-right and marching outward: the node's label is rendered underneath it and
 * its edges leave in every direction, so the upper-right quadrant is the one
 * corner reliably free of both.
 */
export function pipOffsets(count: number, nodeRadius: number, pipRadius: number): { x: number; y: number }[] {
  const step = pipRadius * 2 + 1;
  // Hugs the rim rather than standing off it. The badges grew by half to be
  // identifiable at all, and at the old 0.7 stand-off a row of three reached
  // far enough from its node to sit closer to a neighbour than to its owner.
  const startX = nodeRadius * 0.5;
  const y = -nodeRadius * 0.62;
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * step, y }));
}

/**
 * How someone belongs, in as few words as carry information.
 *
 * "Member" is dropped when it is the whole story, because a badge already says
 * membership and repeating it costs a line that could have been blank. An
 * unremarkable status is dropped for the same reason. What survives is what a DM
 * would actually say out loud: "Leader", "Informant", "Agent · Expelled".
 *
 * Shared by the badge tooltip and the caption drawn under a focused member, so
 * the same membership cannot describe itself two ways on one screen.
 */
export function membershipCaption(
  membership: Pick<FactionPip, "role" | "status" | "active">,
): string {
  const role = membership.role && membership.role !== "Member" ? membership.role : null;
  const status = membership.active ? null : membership.status;
  const said = [role, status].filter(Boolean).join(" · ");
  return said || (membership.active ? "Member" : membership.status);
}
