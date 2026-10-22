import type { AiProvenance } from "@/ai/provenance";
import { kinInsertFor, personKey } from "@/lib/kinship/keys";
import { KIN_RELATIONS, type KinLinkInsert, type KinRelation } from "@/types/kinship.types";
import { normalizeEntityName } from "./entityName";
import type { EntityKinLinks } from "./normalize";
import type { NameLookupRow } from "./importPlan";

/** A kin link ready to insert: the row `kinInsertFor` builds, plus the campaign. */
export type KinWrite = KinLinkInsert & { campaign_id: string };

export interface PlannedKin {
  writes: KinWrite[];
  /** Names that matched no NPC, and relations outside the list. Counted, never listed. */
  unresolved: number;
}

function isKinRelation(v: unknown): v is KinRelation {
  return typeof v === "string" && (KIN_RELATIONS as readonly string[]).includes(v);
}

/**
 * Turns the family each imported NPC names into kin links. A page states a tie
 * from both ends ("Izek, the Baron's son" and "the Baron's children: Izek"),
 * and `kin_links` holds one link per pair, so the first statement of a pair
 * wins and the second is dropped here rather than refused by the database.
 *
 * `relation` is what the NAMED person is to the NPC the entry sits on, so the
 * named person is the subject of the link: on Izek, `{ Baron, parent }` is
 * "the Baron is the parent of Izek", which is the parent link Baron to Izek.
 */
export function planNpcKin(
  rows: readonly { id: string; links: object }[],
  npcs: readonly NameLookupRow[],
  campaignId: string,
  provenance: AiProvenance,
): PlannedKin {
  const byName = new Map<string, string>();
  for (const npc of npcs) {
    const key = normalizeEntityName(npc.name);
    if (key !== null && !byName.has(key)) byName.set(key, npc.id);
  }

  const writes: KinWrite[] = [];
  const seenPairs = new Set<string>();
  let unresolved = 0;

  for (const row of rows) {
    // `kin` rides in `links` beside the scalar names (see EntityKinLinks).
    for (const entry of (row.links as EntityKinLinks).kin ?? []) {
      const key = typeof entry.name === "string" ? normalizeEntityName(entry.name) : null;
      const otherId = key === null ? undefined : byName.get(key);
      if (otherId === undefined || !isKinRelation(entry.relation)) {
        unresolved++;
        continue;
      }
      if (otherId === row.id) continue; // a page naming an NPC as their own kin is noise, not a miss
      const pair = [row.id, otherId].sort().join("|");
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      writes.push({
        ...kinInsertFor(personKey("npc", otherId), entry.relation, personKey("npc", row.id), {
          ai_provenance: provenance,
        }),
        campaign_id: campaignId,
      });
    }
  }
  return { writes, unresolved };
}
