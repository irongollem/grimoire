// A fight's first roster, built on the server (#1021 row 16). The DM's browser used to build it and send it with `open`;
// now `open` names only the AI table's played character, and the roster is made here from the database with the same
// shared rules (`src/rules/fight/roster/`). Two parts: the assembly (pure, below) and the loader that reads its rows.
//
// The service-role client bypasses RLS, so every read is scoped to the campaign (or, for the art override, to the caller)
// in the query itself, and a failed read is thrown, never turned into "nothing".

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { ART_COLUMNS, mergeLibraryMonsterArtLayers, withLibraryArtAll, type LibraryArtRow } from "../../../src/lib/library/monsterArtLayers.ts";
import { activeMembers } from "../../../src/lib/party/activeMembers.ts";
import { calculateAc, wornGearByMember, type WornGear } from "../../../src/rules/armorClass.ts";
import { jackOfAllTrades, type JackOfAllTradesClassRow } from "../../../src/rules/skillCheck.ts";
import { buildRunCombatants, legendaryActionCaps } from "../../../src/rules/fight/roster/buildRoster.ts";
import { bystandersOf } from "../../../src/rules/fight/roster/bystanders.ts";
import { foughtEncounter } from "../../../src/rules/fight/roster/foughtEncounter.ts";
import type { Companion } from "../../../src/types/companion.types.ts";
import type { Encounter, RunCombatant } from "../../../src/types/encounter.types.ts";
import type { Monster } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";
import type { PartyMember } from "../../../src/types/party.types.ts";
import type { Species } from "../../../src/types/species.types.ts";
import { FightCommandError } from "../encounter-command/commandError.ts";
import { loadInventoryAndItems } from "./fightPlayerSheets.ts";
import { customContentScope, loadMonsters, loadNpcs } from "./fightStatBlocks.ts";

/** What the encounter says about who is in it. */
export type RosterEncounter = Pick<Encounter, "party_member_ids" | "companion_ids" | "party_member_factions" | "combatants" | "location_id">;

/** The columns of the encounter row a roster reads; the caller adds them to the select that loads the encounter. */
export const ROSTER_ENCOUNTER_COLUMNS = "party_member_ids, companion_ids, party_member_factions, combatants, location_id";

export interface ClassRowOf extends JackOfAllTradesClassRow {
  party_member_id: string;
}

export interface RosterRows {
  encounter: RosterEncounter;
  /** Every party member of the campaign. */
  party: PartyMember[];
  memorials: { party_member_id: string; restored_at: string | null }[];
  companions: Companion[];
  monsters: Monster[];
  npcs: NpcListRow[];
  species: Pick<Species, "id" | "size" | "subraces">[];
  wornGear: Record<string, WornGear[]>;
  classRows: ClassRowOf[];
}

/**
 * The encounter as it is fought, and the party members it fields. An AI table's played member must be one of the active party
 * (a fallen character is not): anything else is refused here, before a fight is written.
 */
export function foughtOf(
  encounter: RosterEncounter,
  active: readonly PartyMember[],
  playedMemberId: string | null,
): RosterEncounter {
  if (playedMemberId !== null && !active.some((m) => m.id === playedMemberId)) {
    throw new FightCommandError(400, "open: playedMemberId is not an active member of this campaign's party.");
  }
  return foughtEncounter(encounter, playedMemberId, (id) => active.some((m) => m.id === id && m.ai_speaks === true));
}

/** The first roster and the legendary-action caps, from the rows. Pure: the same rules the browser ran, on the server's rows. */
export function assembleRoster(rows: RosterRows, playedMemberId: string | null): { combatants: RunCombatant[]; legendaryCaps: Record<string, number> } {
  const active = activeMembers(rows.party, rows.memorials);
  const fought = foughtOf(rows.encounter, active, playedMemberId);
  const built = buildRunCombatants({
    encounter: fought,
    party: active,
    companions: rows.companions,
    monsters: rows.monsters,
    npcs: rows.npcs,
    species: rows.species,
    // Wild Shape is deliberately not applied: the form's AC rides on `RunCombatant.wildshape`, as it did from `useArmorClass().acFor`.
    acFor: (member) => calculateAc(member, rows.wornGear[member.id] ?? []).total,
    jackFor: (member) =>
      jackOfAllTrades(rows.classRows.filter((c) => c.party_member_id === member.id), member.ruleset),
  });
  // Only the AI table seats the characters who are in the room: a DM's own run adds whom they choose.
  const inTheRoom = playedMemberId !== null ? bystandersOf(rows.npcs, rows.encounter.location_id, built) : [];
  const combatants = [...built, ...inTheRoom];
  return { combatants, legendaryCaps: legendaryActionCaps(combatants, rows.monsters) };
}

async function loadMonstersWithArt(admin: SupabaseClient, campaignId: string, userId: string, ids: string[]): Promise<Monster[]> {
  const monsters = await loadMonsters(admin, campaignId, ids);
  const libraryIds = monsters.filter((m) => !isUuid(m.id)).map((m) => m.id);
  if (libraryIds.length === 0) return monsters;
  const canonical = await admin.from("library_monster_art_canonical").select(ART_COLUMNS).in("entry_id", libraryIds);
  if (canonical.error) throw new Error(`library_monster_art_canonical: ${canonical.error.message}`);
  // The override is the caller's own row, named in the query: the service role would otherwise read everyone's.
  const own = await admin.from("library_monster_art").select(ART_COLUMNS).in("entry_id", libraryIds).eq("user_id", userId);
  if (own.error) throw new Error(`library_monster_art: ${own.error.message}`);
  // The caller's own override lays over the canonical art field by field. The map holds only library ids, so a custom monster
  // (a uuid, carrying its own art) has no entry and is left alone.
  const art = mergeLibraryMonsterArtLayers(canonical.data as LibraryArtRow[], own.data as LibraryArtRow[]);
  return withLibraryArtAll(monsters, art);
}

async function loadSpecies(admin: SupabaseClient, campaignId: string, ids: string[]): Promise<Species[]> {
  const found: Species[] = [];
  const libraryIds = ids.filter((id) => !isUuid(id));
  const customIds = ids.filter(isUuid);
  if (libraryIds.length > 0) {
    const { data, error } = await admin.from("library_species").select("*").in("id", libraryIds);
    if (error) throw new Error(`library_species: ${error.message}`);
    found.push(...(data as unknown as Species[]));
  }
  if (customIds.length > 0) {
    const { data, error } = await admin.from("species").select("*").in("id", customIds).or(await customContentScope(admin, campaignId));
    if (error) throw new Error(`species: ${error.message}`);
    found.push(...(data as Species[]));
  }
  return found;
}

/**
 * Reads what the roster needs and builds it. `encounter` is the row `loadEncounterAsDm` returned (with `ROSTER_ENCOUNTER_COLUMNS`),
 * so it is this campaign's. A resume never calls this: it costs reads, and only a fresh fight needs them.
 */
export async function loadRoster(
  admin: SupabaseClient,
  ctx: { campaignId: string; userId: string; encounter: RosterEncounter },
  playedMemberId: string | null,
): Promise<{ combatants: RunCombatant[]; legendaryCaps: Record<string, number> }> {
  const { campaignId, userId, encounter } = ctx;
  const partyRes = await admin.from("party_members").select("*").eq("campaign_id", campaignId).order("sort_order", { ascending: true });
  if (partyRes.error) throw new Error(`party_members: ${partyRes.error.message}`);
  const party = partyRes.data as PartyMember[];
  const memorialRes = await admin.from("character_memorials").select("party_member_id, restored_at").eq("campaign_id", campaignId);
  if (memorialRes.error) throw new Error(`character_memorials: ${memorialRes.error.message}`);
  const memorials = memorialRes.data as RosterRows["memorials"];

  // Refused here, before any further read and long before a fight is written.
  const active = activeMembers(party, memorials);
  const fieldedIds = foughtOf(encounter, active, playedMemberId).party_member_ids.filter((id) => active.some((m) => m.id === id));
  const fielded = active.filter((m) => fieldedIds.includes(m.id));

  const companionIds = encounter.companion_ids;
  let companions: Companion[] = [];
  if (companionIds.length > 0) {
    const { data, error } = await admin.from("companions").select("*").eq("campaign_id", campaignId).in("id", companionIds);
    if (error) throw new Error(`companions: ${error.message}`);
    companions = data as Companion[];
  }

  const monsterIds = [...new Set(encounter.combatants.flatMap((c) => c.monster_id ?? []))];
  const monsters = await loadMonstersWithArt(admin, campaignId, userId, monsterIds);

  // The encounter's own NPCs, and for the AI table the ones standing in its room.
  const npcIds = [...new Set(encounter.combatants.flatMap((c) => c.npc_id ?? []))];
  const npcs = await loadNpcs(admin, campaignId, npcIds);
  if (playedMemberId !== null && encounter.location_id !== null) {
    const { data, error } = await admin.from("npcs").select("*").eq("campaign_id", campaignId).eq("location_id", encounter.location_id);
    if (error) throw new Error(`npcs: ${error.message}`);
    for (const npc of data as NpcListRow[]) if (!npcs.some((n) => n.id === npc.id)) npcs.push(npc);
  }

  const memberIds = fielded.map((m) => m.id);
  const species = await loadSpecies(admin, campaignId, [...new Set(fielded.flatMap((m) => m.species_id ?? []))]);
  let wornGear: Record<string, WornGear[]> = {};
  let classRows: ClassRowOf[] = [];
  if (memberIds.length > 0) {
    const { rows, items } = await loadInventoryAndItems(admin, campaignId, memberIds);
    wornGear = wornGearByMember(rows, items);
    // Keyed by members this campaign's own read returned.
    const { data, error } = await admin.from("character_classes").select("party_member_id, capabilities, levels").in("party_member_id", memberIds);
    if (error) throw new Error(`character_classes: ${error.message}`);
    classRows = data as ClassRowOf[];
  }

  return assembleRoster({ encounter, party, memorials, companions, monsters, npcs, species, wornGear, classRows }, playedMemberId);
}
