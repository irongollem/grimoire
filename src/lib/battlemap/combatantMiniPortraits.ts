// Frame 13: "A `minis` row with `format:'vtt'` is the portrait; the faction
// supplies the ring." Pure mapping from a run's combatants + the campaign's
// vtt minis to the per-combatant portrait override — factored out of
// useCombatantMinis so the source-precedence and newest-wins-per-source rules
// are unit-testable without a TanStack Query / Supabase harness.

import type { RunCombatant } from "@/types/encounter.types";
import type { MiniSourceTable } from "@/types/mini.types";

/** Just enough of a `minis` row to resolve a portrait — mirrors the columns
 *  `useCombatantMinis` selects. */
export interface MiniPortraitRow {
  source_table: MiniSourceTable;
  source_id: string;
  format: string;
  status: string;
  thumbnail_url: string | null;
  stylized_image_url: string | null;
  created_at: string;
}

/**
 * Which `minis` source a live combatant maps to. A combatant carries at most
 * one of party_member_id/npc_id/monster_id (useEncounterDifficulty and
 * useRunnerCombatant already lean on that same precedence), so the first one
 * present is the source.
 */
export function combatantMiniSource(
  combatant: Pick<RunCombatant, "party_member_id" | "npc_id" | "monster_id">,
): { table: MiniSourceTable; id: string } | null {
  if (combatant.party_member_id) return { table: "party_members", id: combatant.party_member_id };
  if (combatant.npc_id) return { table: "npcs", id: combatant.npc_id };
  if (combatant.monster_id) return { table: "monsters", id: combatant.monster_id };
  return null;
}

function sourceKey(table: MiniSourceTable, id: string): string {
  return `${table}:${id}`;
}

/**
 * instance_id -> portrait URL for every combatant with a ready, vtt-format
 * mini. Picks the newest ready mini per source, the same rule
 * `get_player_visible_mini` applies (ORDER BY created_at DESC) — a source can
 * accumulate more than one forge over a campaign's life, and the latest is
 * the one the table stands for. `thumbnail_url` (the rendered mini) is
 * preferred over `stylized_image_url` (the pre-sculpt reference), matching
 * `MiniCard`'s fallback.
 */
export function combatantPortraitOverrides(
  combatants: RunCombatant[],
  minis: MiniPortraitRow[],
): Map<string, string> {
  const bySource = new Map<string, string>();
  const sorted = [...minis].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const mini of sorted) {
    if (mini.format !== "vtt" || mini.status !== "ready") continue;
    const key = sourceKey(mini.source_table, mini.source_id);
    if (bySource.has(key)) continue;
    const url = mini.thumbnail_url ?? mini.stylized_image_url;
    if (url) bySource.set(key, url);
  }

  const overrides = new Map<string, string>();
  for (const combatant of combatants) {
    const source = combatantMiniSource(combatant);
    if (!source) continue;
    const url = bySource.get(sourceKey(source.table, source.id));
    if (url) overrides.set(combatant.instance_id, url);
  }
  return overrides;
}
