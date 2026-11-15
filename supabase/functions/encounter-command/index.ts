// encounter-command (#1201, stage 1c): advances a live fight on the server.
//
// Auth shape copied from import-match: the caller's own Authorization header
// derives `auth.uid()`, an admin (service-role) client does the work, and
// nothing in the request is trusted for identity. Only the campaign's owner or
// a member with role `dm` may command a fight; players have no access to the
// row at all. The rules are the browser's own (`src/rules/fight`), run by
// `runBatch`; this file only wires the database to it.
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { secureDie } from "../_shared/serverRoll.ts";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { libraryMonsterRow } from "../../../src/lib/library/libraryMonsterRow.ts";
import { DEFAULT_RULESET } from "../../../src/types/ruleset.types.ts";
import type { EncounterEvent } from "../../../src/types/encounter.types.ts";
import type { ExploreParty } from "../../../src/types/exploreParty.types.ts";
import type { Monster } from "../../../src/types/monster.types.ts";
import type { NpcListRow } from "../../../src/types/npc.types.ts";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import { idClock } from "../../../src/rules/fight/fightSpawn.ts";
import {
  FightCommandError,
  MAX_BODY_CHARACTERS,
  runBatch,
  validateRequest,
  type BatchDeps,
  type FightRow,
  type LoadedFight,
} from "./handler.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The sender the runner puts on its chat lines (EncounterRunner.vue). */
const BROADCAST_SENDER = "⚔ Encounter";

/** The monsters an event's spawns name, by the same rule the runner uses (`spawnedMonsterIds`), and the NPCs. */
function spawnIds(events: EncounterEvent[]): { monsterIds: string[]; npcIds: string[] } {
  const monsterIds = new Set<string>();
  const npcIds = new Set<string>();
  for (const event of events) {
    for (const action of event.actions) {
      if (action.type !== "spawn_combatants") continue;
      for (const spawn of action.spawns) (spawn.kind === "npc" ? npcIds : monsterIds).add(spawn.monster_id);
    }
  }
  return { monsterIds: [...monsterIds], npcIds: [...npcIds] };
}

async function loadMonsters(ids: string[]): Promise<Monster[]> {
  const libraryIds = ids.filter((id) => !isUuid(id));
  const customIds = ids.filter(isUuid);
  const found: Monster[] = [];
  if (libraryIds.length > 0) {
    const { data, error } = await admin.from("library_monsters").select("*").in("id", libraryIds);
    if (error) throw new Error(`library_monsters: ${error.message}`);
    found.push(...data.map(libraryMonsterRow));
  }
  if (customIds.length > 0) {
    const { data, error } = await admin.from("monsters").select("*").in("id", customIds);
    if (error) throw new Error(`monsters: ${error.message}`);
    found.push(...(data as Monster[]));
  }
  return found;
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });
  const userId = user.id;

  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARACTERS) throw new FightCommandError(400, "The request is too large.");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new FightCommandError(400, "The request body is not JSON.");
    }
    const request = validateRequest(body);

    // The campaign is derived from the encounter, never taken from the request.
    const { data: encounter, error: encounterError } = await admin
      .from("encounters")
      .select("id, campaign_id, events, lair_enabled, lair_owner_def_id")
      .eq("id", request.encounterId)
      .maybeSingle();
    if (encounterError) throw new Error(`encounters: ${encounterError.message}`);
    if (!encounter || !encounter.campaign_id) throw new FightCommandError(404, "Encounter not found.");
    const campaignId: string = encounter.campaign_id;

    const { data: campaign, error: campaignError } = await admin
      .from("campaigns").select("id, user_id, game_system").eq("id", campaignId).maybeSingle();
    if (campaignError) throw new Error(`campaigns: ${campaignError.message}`);
    if (!campaign) throw new FightCommandError(404, "Campaign not found.");
    // DM specifically, not any member: a fight is the DM's to advance.
    if (campaign.user_id !== userId) {
      const { data: membership, error: memberError } = await admin
        .from("campaign_members").select("role")
        .eq("campaign_id", campaignId).eq("user_id", userId).eq("role", "dm").maybeSingle();
      if (memberError) throw new Error(`campaign_members: ${memberError.message}`);
      if (!membership) return new Response("Forbidden", { status: 403 });
    }

    // Settings that do not change between the attempts of one batch are read once.
    const events = (encounter.events ?? []) as EncounterEvent[];
    const { monsterIds, npcIds } = spawnIds(events);
    const monsters = await loadMonsters(monsterIds);
    let npcs: NpcListRow[] = [];
    if (npcIds.length > 0) {
      const { data, error } = await admin.from("npcs").select("*").eq("campaign_id", campaignId).in("id", npcIds);
      if (error) throw new Error(`npcs: ${error.message}`);
      npcs = data as NpcListRow[];
    }
    // The runner reads the same rule: no row means the rule's own default, which is off.
    const { data: rule, error: ruleError } = await admin
      .from("campaign_rules").select("enabled")
      .eq("campaign_id", campaignId).eq("rule_key", "random_initiative").maybeSingle();
    if (ruleError) throw new Error(`campaign_rules: ${ruleError.message}`);

    const deps: BatchDeps = {
      async loadFight(encounterId) {
        const { data, error } = await admin
          .from("encounter_state")
          .select("id, version, combatants_live, current_round, active_combatant_index, events_fired, lair_fired_rounds, applied_command_ids, is_running, ended_at")
          .eq("encounter_id", encounterId)
          .eq("campaign_id", campaignId)
          .maybeSingle();
        if (error) throw new Error(`encounter_state: ${error.message}`);
        const loaded: LoadedFight = {
          row: data ? (data as FightRow) : null,
          events,
          lairEnabled: encounter.lair_enabled,
          lairOwnerDefId: encounter.lair_owner_def_id,
          ruleset: gameSystemEdition(campaign.game_system) ?? DEFAULT_RULESET,
          randomizeInitiativeEachRound: rule ? rule.enabled : false,
          monsters,
          npcs,
        };
        return loaded;
      },
      async createFight(encounterId, first) {
        const { data, error } = await admin
          .from("encounter_state")
          .insert({ ...first, encounter_id: encounterId, campaign_id: campaignId, user_id: userId })
          .select("id, version");
        // The one row per encounter is a unique constraint: losing the insert race is not a failure, the caller loads the winner's row.
        if (error) {
          if (error.code === "23505") return null;
          throw new Error(`encounter_state insert: ${error.message}`);
        }
        return { id: data[0].id as string, version: data[0].version as number };
      },
      async loadPartyRows(ids) {
        const { data, error } = await admin
          .from("party_members")
          .select("id, current_hp, temp_hp, current_initiative, conditions, concentration, wildshape_state, death_save_successes, death_save_failures")
          .eq("campaign_id", campaignId)
          .in("id", ids);
        if (error) throw new Error(`party_members: ${error.message}`);
        return data as PartyIngestRow[];
      },
      async saveFight(rowId, expectedVersion, next) {
        // The version guard is the whole point: zero rows back means another writer got there first.
        const { data, error } = await admin
          .from("encounter_state")
          .update(next)
          .eq("id", rowId)
          .eq("version", expectedVersion)
          .select("version");
        if (error) throw new Error(`encounter_state update: ${error.message}`);
        return data.length > 0 ? { version: data[0].version as number } : null;
      },
      async persistPartyMember(id, patch) {
        const { error } = await admin.from("party_members").update(patch).eq("id", id).eq("campaign_id", campaignId);
        if (error) throw new Error(`party_members update: ${error.message}`);
      },
      async persistCompanion(id, patch) {
        const { error } = await admin.from("companions").update(patch).eq("id", id).eq("campaign_id", campaignId);
        if (error) throw new Error(`companions update: ${error.message}`);
      },
      async stopOtherRunningFights(encounterId) {
        // One live fight per campaign, so a player's single-live-row view cannot flip between two.
        const { error } = await admin
          .from("encounter_state")
          .update({ is_running: false })
          .eq("campaign_id", campaignId)
          .eq("is_running", true)
          .neq("encounter_id", encounterId);
        if (error) throw new Error(`encounter_state stop: ${error.message}`);
      },
      async loadEndContext(siteId) {
        const { data, error } = await admin.from("campaigns").select("explore_party").eq("id", campaignId).maybeSingle();
        if (error) throw new Error(`campaigns: ${error.message}`);
        if (!data) throw new FightCommandError(404, "Campaign not found.");
        let site: string | null = null;
        if (siteId !== null) {
          // Resolved by the caller through the map stack; here it only has to be a place of this campaign.
          const { data: place, error: placeError } = await admin
            .from("locations").select("id").eq("id", siteId).eq("campaign_id", campaignId).maybeSingle();
          if (placeError) throw new Error(`locations: ${placeError.message}`);
          site = place ? siteId : null;
        }
        return { exploreParty: data.explore_party as ExploreParty | null, siteId: site };
      },
      async setExploreParty(party) {
        const { error } = await admin.from("campaigns").update({ explore_party: party }).eq("id", campaignId);
        if (error) throw new Error(`campaigns update: ${error.message}`);
      },
      async postBroadcast(message) {
        const { error } = await admin.from("campaign_messages").insert({
          campaign_id: campaignId,
          user_id: userId,
          recipient_user_id: null,
          sender_name: BROADCAST_SENDER,
          message,
          type: "system",
          metadata: null,
        });
        if (error) throw new Error(`campaign_messages: ${error.message}`);
      },
      rollD20: () => secureDie(20),
      rollD6: () => secureDie(6),
      now: idClock(),
      nowIso: () => new Date().toISOString(),
    };

    return json(await runBatch(request, deps));
  } catch (e) {
    if (e instanceof FightCommandError) return json({ error: e.message }, e.status);
    throw e; // withCors reports it and answers 500
  }
}));
