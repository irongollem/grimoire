import { personKey } from "@/lib/kinship/keys";
import type { PersonKey } from "@/types/kinship.types";

/** A membership row, reduced to what a House's line needs. */
export interface LineMemberRow {
  key: PersonKey;
  status: string;
  rank: number | null;
}

/** Those who left the house stay out of its tree and its line. */
const GONE = new Set(["Expelled", "Defected"]);

interface NpcRow {
  npc_id: string;
  status: string;
  succession_rank: number | null;
}
interface PcRow {
  party_member_id: string;
  status: string;
  succession_rank: number | null;
}

export function memberRows(npcs: readonly NpcRow[], pcs: readonly PcRow[]): LineMemberRow[] {
  return [
    ...npcs.map((r) => ({ key: personKey("npc", r.npc_id), status: r.status, rank: r.succession_rank })),
    ...pcs.map((r) => ({ key: personKey("pc", r.party_member_id), status: r.status, rank: r.succession_rank })),
  ];
}

/** Everyone still of the house: the seeds its lineage is drawn from. */
export function seedKeys(rows: readonly LineMemberRow[]): Set<PersonKey> {
  return new Set(rows.filter((r) => !GONE.has(r.status)).map((r) => r.key));
}

/** The line in order, heir first. A dead person keeps their place here; display skips them. */
export function lineFromRows(rows: readonly LineMemberRow[]): PersonKey[] {
  return rows
    .filter((r): r is LineMemberRow & { rank: number } => r.rank !== null && !GONE.has(r.status))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.key);
}

/** Each person's place (1 is the heir) for the tree's numbered badges. */
export function rankMap(line: readonly PersonKey[]): Map<PersonKey, number> {
  return new Map(line.map((k, i) => [k, i + 1] as const));
}

/** Click toggles: out if in the line, else last. */
export function toggleInLine(line: readonly PersonKey[], key: PersonKey): PersonKey[] {
  return line.includes(key) ? line.filter((k) => k !== key) : [...line, key];
}

/** Moves one person up (-1) or down (+1); stays put at either end. */
export function moveInLine(line: readonly PersonKey[], key: PersonKey, delta: -1 | 1): PersonKey[] {
  const from = line.indexOf(key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= line.length) return [...line];
  const next = [...line];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/** The first in line who is still alive; the dead keep their rank but do not inherit. */
export function heirOf(line: readonly PersonKey[], isDead: (key: PersonKey) => boolean): PersonKey | null {
  return line.find((k) => !isDead(k)) ?? null;
}
