/**
 * "Group by" (#1084): a faction's members, a place's residents or a deity's
 * faithful gathered in a hull instead of drawn as spokes.
 *
 * These are records, not lines, so a guild of twenty-three is never a star that
 * pushes everyone else to the rim. The set is computed from the same ties the
 * web reads, so what the hull holds can never disagree with the sheets.
 */
import { isPersonKind, nodeKey, parseNodeKey, type GroupKind, type WebKind } from "./kinds";
import { fromKey, tieFamily, toKey, type WorldTie } from "./ties";

/** The node keys gathered around `groupKey`; empty when it is not a group kind or holds no one. */
export function groupMembers(ties: readonly WorldTie[], groupKey: string): Set<string> {
  const ref = parseNodeKey(groupKey);
  const members = new Set<string>();
  if (!ref) return members;

  for (const tie of ties) {
    if (toKey(tie) !== groupKey) continue;
    const from = parseNodeKey(fromKey(tie));
    if (!from) continue;
    switch (ref.kind) {
      case "faction":
        // Every tie from a person to a faction is a membership.
        if (tie.source === "membership") members.add(fromKey(tie));
        break;
      case "location":
        // Residents: whose home it is, and the PCs who are there.
        if (tie.source === "npc_home" || tie.source === "pc_place") members.add(fromKey(tie));
        break;
      case "deity":
        // The faithful: a patron deity, or any person or faction tied to the god in faith.
        if (tie.source === "patron_deity" || (isFaithful(from.kind) && tieFamily(tie) === "faith")) members.add(fromKey(tie));
        break;
      default:
        break;
    }
  }
  return members;
}

function isFaithful(kind: WebKind): boolean {
  return kind === "faction" || isPersonKind(kind);
}

/** One group a DM can choose, with how many it gathers. */
export interface GroupOption {
  id: string;
  name: string;
  count: number;
}

/** Every faction, place or deity that gathers at least one member, biggest first. */
export function groupOptions(ties: readonly WorldTie[], kind: GroupKind): GroupOption[] {
  const byId = new Map<string, GroupOption>();
  for (const tie of ties) {
    if (tie.to_kind !== kind) continue;
    const key = nodeKey(tie.to_kind, tie.to_id);
    if (byId.has(tie.to_id)) continue;
    const count = groupMembers(ties, key).size;
    if (count === 0) continue;
    byId.set(tie.to_id, { id: tie.to_id, name: tie.to_name, count });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
