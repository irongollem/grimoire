// The stat blocks a fight's creatures came from, as the fight functions read them (`encounter-command`,
// `encounter-options`). Two parts: what a roster names (pure, below) and where the rows are read (the loaders).
//
// Every read of a campaign's own rows (NPCs, companions) is scoped to the campaign in the query itself: the
// service-role client bypasses RLS, so nothing here leans on it. Monsters are the shared library's (by text id, readable
// by anyone) or custom ones (by uuid), and a custom one is read only when this campaign's Dungeon Masters may use it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { libraryMonsterRow } from "../../../src/lib/library/libraryMonsterRow.ts";
import type { Companion } from "../../../src/types/companion.types.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import type { Monster, MonsterStatBlock } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";

/** The stat blocks the combatants of a fight came from. */
export interface StatBlockSources {
  monsters: Monster[];
  npcs: NpcListRow[];
  companions: Companion[];
}

/** The ids a roster's stat blocks are read by. */
export function statBlockIdsOf(combatants: readonly RunCombatant[]): { monsterIds: string[]; npcIds: string[]; companionIds: string[] } {
  const ids = (pick: (c: RunCombatant) => string | undefined | null) => [...new Set(combatants.flatMap((c) => pick(c) ?? []))];
  return { monsterIds: ids((c) => c.monster_id), npcIds: ids((c) => c.npc_id), companionIds: ids((c) => c.companion_id) };
}

/** The stat block behind a combatant, or null for a party member or a source that is gone. */
export function statBlockOf(c: RunCombatant, sources: StatBlockSources): MonsterStatBlock | null {
  if (c.monster_id) return sources.monsters.find((m) => m.id === c.monster_id)?.stat_block ?? null;
  if (c.npc_id) return sources.npcs.find((n) => n.id === c.npc_id)?.stat_block ?? null;
  if (c.companion_id) return sources.companions.find((x) => x.id === c.companion_id)?.stat_block ?? null;
  return null;
}

/**
 * The PostgREST `or` filter that keeps a custom monster to what this campaign's Dungeon Masters may use: a monster of this
 * campaign, or one authored by the campaign's owner or a member with the dm role (a DM's own monsters from their other
 * campaigns are usable here, which is why the browser reads them unscoped under RLS). Another account's private monster is
 * out. App convention.
 */
export async function customMonsterScope(admin: SupabaseClient, campaignId: string): Promise<string> {
  const { data: campaign, error: campaignError } = await admin.from("campaigns").select("user_id").eq("id", campaignId).maybeSingle();
  if (campaignError) throw new Error(`campaigns: ${campaignError.message}`);
  const { data: members, error: memberError } = await admin.from("campaign_members").select("user_id").eq("campaign_id", campaignId).eq("role", "dm");
  if (memberError) throw new Error(`campaign_members: ${memberError.message}`);
  const dmIds = new Set<string>((members as { user_id: string }[]).map((m) => m.user_id));
  if (campaign) dmIds.add((campaign as { user_id: string }).user_id);
  const clauses = [`campaign_id.eq.${campaignId}`];
  if (dmIds.size > 0) clauses.push(`user_id.in.(${[...dmIds].join(",")})`);
  return clauses.join(",");
}

/** Monsters by id: library ids (text) from `library_monsters`, custom ids (uuid) from `monsters`, kept to this campaign's DMs. */
export async function loadMonsters(admin: SupabaseClient, campaignId: string, ids: string[]): Promise<Monster[]> {
  const libraryIds = ids.filter((id) => !isUuid(id));
  const customIds = ids.filter(isUuid);
  const found: Monster[] = [];
  if (libraryIds.length > 0) {
    const { data, error } = await admin.from("library_monsters").select("*").in("id", libraryIds);
    if (error) throw new Error(`library_monsters: ${error.message}`);
    found.push(...data.map(libraryMonsterRow));
  }
  if (customIds.length > 0) {
    const { data, error } = await admin.from("monsters").select("*").in("id", customIds).or(await customMonsterScope(admin, campaignId));
    if (error) throw new Error(`monsters: ${error.message}`);
    found.push(...(data as Monster[]));
  }
  return found;
}

/** A campaign's NPCs by id, scoped to the campaign in the query. */
export async function loadNpcs(admin: SupabaseClient, campaignId: string, ids: string[]): Promise<NpcListRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.from("npcs").select("*").eq("campaign_id", campaignId).in("id", ids);
  if (error) throw new Error(`npcs: ${error.message}`);
  return data as NpcListRow[];
}

/** The stat blocks a roster names: monsters, this campaign's NPCs and this campaign's companions. */
export async function loadStatBlocks(
  admin: SupabaseClient,
  campaignId: string,
  ids: { monsterIds: string[]; npcIds: string[]; companionIds: string[] },
): Promise<StatBlockSources> {
  const monsters = await loadMonsters(admin, campaignId, ids.monsterIds);
  const npcs = await loadNpcs(admin, campaignId, ids.npcIds);
  let companions: Companion[] = [];
  if (ids.companionIds.length > 0) {
    const { data, error } = await admin.from("companions").select("*").eq("campaign_id", campaignId).in("id", ids.companionIds);
    if (error) throw new Error(`companions: ${error.message}`);
    companions = data as Companion[];
  }
  return { monsters, npcs, companions };
}
