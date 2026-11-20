// encounter-command (#1201, stage 1c): advances a live fight on the server.
//
// Who may command a fight (the caller, the campaign derived from the encounter, the DM check) is
// `_shared/fightAccess.ts`, shared with `encounter-options`. The rules are the browser's own (`src/rules/fight`), run
// by `runBatch`; this file only wires the database to it.
import { serve } from "std/http/server.ts";
import type { FactionSides } from "../../../src/rules/fight/sides.ts";
import { DEFAULT_FACTIONS } from "../../../src/types/encounter.types.ts";
import { withCors } from "../_shared/cors.ts";
import { adminClient, callerUserId, loadEncounterAsDm } from "../_shared/fightAccess.ts";
import { loadMonsters, loadNpcs, loadStatBlocks } from "../_shared/fightStatBlocks.ts";
import { loadSpellsListed, loadSpellsNamed } from "../_shared/fightSpells.ts";
import { loadFightMapInput } from "../_shared/fightMap.ts";
import { loadPartyIngestRows } from "../_shared/fightPartyIngest.ts";
import { loadPlayerSheets } from "../_shared/fightPlayerSheets.ts";
import { loadRoster, ROSTER_ENCOUNTER_COLUMNS, type RosterEncounter } from "../_shared/fightRoster.ts";
import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { fightMapOf } from "../../../src/rules/fight/terrain/battleMap.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { underNoteCap } from "../_shared/tacticsJudge.ts";
import { judge, JEV_MODEL, judgingKey } from "../_shared/typesafe.ts";
import { rollMessageRow, secureDie } from "../_shared/serverRoll.ts";
import { itemRefColumns } from "../../../src/lib/itemRef.ts";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { DEFAULT_RULESET } from "../../../src/types/ruleset.types.ts";
import type { EncounterEvent } from "../../../src/types/encounter.types.ts";
import type { ExploreParty } from "../../../src/types/exploreParty.types.ts";
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

const admin = adminClient();

/** The operation name of a note judgment's cost row (`ai_credit_ledger.reason`). It is also what the fight's cap counts. */
const NOTE_JUDGMENT_OPERATION = "tactics_note_judgment";

/** A judgment waits this long before the turn is picked without it, as search's rerank does. */
const NOTE_TIMEOUT_MS = 6_000;
/** How far back the cap looks for a fight that has not started yet. */
const NOTE_CAP_WINDOW_BEFORE_START_MS = 60 * 60 * 1000;

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

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const userId = await callerUserId(req);
  if (userId === null) return new Response("Unauthorized", { status: 401 });

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

    const access = await loadEncounterAsDm<RosterEncounter & {
      id: string; campaign_id: string | null; events: EncounterEvent[] | null; lair_enabled: boolean; lair_owner_def_id: string | null; factions: FactionSides | null;
    }>(admin, userId, request.encounterId, `id, campaign_id, events, lair_enabled, lair_owner_def_id, factions, ${ROSTER_ENCOUNTER_COLUMNS}`);
    if (!access.ok) return access.response;
    const { encounter, campaign } = access;
    const campaignId = campaign.id;

    // Settings that do not change between the attempts of one batch are read once.
    const events = (encounter.events ?? []) as EncounterEvent[];
    const { monsterIds, npcIds } = spawnIds(events);
    const monsters = await loadMonsters(admin, campaignId, monsterIds);
    const npcs = await loadNpcs(admin, campaignId, npcIds);
    // The runner reads the same rules.
    const { data: rules, error: ruleError } = await admin
      .from("campaign_rules").select("rule_key, enabled")
      .eq("campaign_id", campaignId).in("rule_key", ["random_initiative", "xp_levelling"]);
    if (ruleError) throw new Error(`campaign_rules: ${ruleError.message}`);
    // No row means the rule's own default, which is off for both.
    const ruleOn = (key: string) => (rules as { rule_key: string; enabled: boolean }[]).some((r) => r.rule_key === key && r.enabled);

    const deps: BatchDeps = {
      async loadFight(encounterId) {
        const { data, error } = await admin
          .from("encounter_state")
          .select("id, version, combatants_live, current_round, active_combatant_index, events_fired, lair_fired_rounds, applied_command_ids, is_running, ended_at, started_at")
          .eq("encounter_id", encounterId)
          .eq("campaign_id", campaignId)
          .maybeSingle();
        if (error) throw new Error(`encounter_state: ${error.message}`);
        const loaded: LoadedFight = {
          row: data ? (data as FightRow) : null,
          events,
          lairEnabled: encounter.lair_enabled,
          lairOwnerDefId: encounter.lair_owner_def_id,
          // An encounter saved with no factions of its own runs on the defaults, as the runner opens it.
          factions: encounter.factions && encounter.factions.length > 0 ? encounter.factions : DEFAULT_FACTIONS,
          ruleset: gameSystemEdition(campaign.game_system) ?? DEFAULT_RULESET,
          randomizeInitiativeEachRound: ruleOn("random_initiative"),
          xpLevelling: ruleOn("xp_levelling"),
          monsters,
          npcs,
        };
        return loaded;
      },
      buildRoster: (playedMemberId) => loadRoster(admin, { campaignId, userId, encounter }, playedMemberId),
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
      loadPartyRows: (ids) => loadPartyIngestRows(admin, campaignId, ids),
      async isCampaignSession(sessionId) {
        // A value that is no uuid names no session; asking the database would fail on the cast rather than answer no.
        if (!isUuid(sessionId)) return false;
        const { data, error } = await admin.from("campaign_sessions").select("id").eq("id", sessionId).eq("campaign_id", campaignId).maybeSingle();
        if (error) throw new Error(`campaign_sessions: ${error.message}`);
        return data !== null;
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
      async awardFightXp(award) {
        const { error } = await admin.rpc("award_fight_xp", {
          p_encounter_id: request.encounterId,
          p_member_ids: award.memberIds,
          p_each: award.each,
          p_total: award.total,
        });
        if (error) throw new Error(`award_fight_xp: ${error.message}`);
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
      loadStatBlocks: (ids) => loadStatBlocks(admin, campaignId, ids),
      loadSpells: (name) => loadSpellsNamed(admin, campaignId, campaign.user_id, name),
      loadSpellsListed: (names) => loadSpellsListed(admin, campaignId, campaign.user_id, names),
      loadPlayerSheets: (memberIds) => loadPlayerSheets(admin, campaignId, memberIds),
      async loadFightMap(encounterId) {
        // Read in this campaign's own scope (`loadFightMapInput` filters on it); null is "no map the rules can use".
        const input = await loadFightMapInput(admin, campaignId, encounterId);
        return input === null ? null : fightMapOf(input);
      },
      async postRoll({ result, speaker, serverRolled }) {
        // The campaign log row of a roll, as the client posts one; the stamp is only for dice the server threw.
        const row = rollMessageRow(result, { campaignId, userId, senderName: speaker, recipientUserId: null }, serverRolled);
        const { error } = await admin.from("campaign_messages").insert(row);
        if (error) throw new Error(`campaign_messages: ${error.message}`);
      },
      async dropThrown(drop, memberId, speaker) {
        // The campaign chat's thrown-weapon drop, as the browser posts one (`useThrownWeapon`): a recoverable item anyone grabs, never a Need or Greed roll.
        const { error } = await admin.from("campaign_messages").insert({
          campaign_id: campaignId,
          user_id: userId,
          recipient_user_id: null,
          sender_name: speaker,
          message: `dropped ${drop.name}`,
          type: "item_drop",
          metadata: {
            ...itemRefColumns(drop.itemRef),
            item_name: drop.name, item_rarity: drop.rarity, quantity: 1, is_container: false, quality: drop.quality, thrown: true,
            quantity_remaining: 1, claims: [], image_url: drop.imageUrl, description: drop.description,
            claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
            for_party_member_id: memberId,
          },
        });
        if (error) throw new Error(`campaign_messages: ${error.message}`);
      },
      async writeGear(writes) {
        // Scoped to this campaign: a row id of another campaign's is never touched.
        for (const write of writes) {
          const rows = admin.from("party_inventory");
          const { error } = write.kind === "remove"
            ? await rows.delete().eq("id", write.inventoryId).eq("campaign_id", campaignId)
            : await rows.update(write.kind === "quantity" ? { quantity: write.quantity } : { current_charges: write.charges }).eq("id", write.inventoryId).eq("campaign_id", campaignId);
          if (error) throw new Error(`party_inventory: ${error.message}`);
        }
      },
      async writeSpellSlots(memberId, slots) {
        // Scoped to this campaign: another campaign's member is never touched. The whole list, so a retry lands once.
        const { error } = await admin.from("party_members").update({ spell_slots: slots }).eq("id", memberId).eq("campaign_id", campaignId);
        if (error) throw new Error(`party_members: ${error.message}`);
      },
      async writeInnateUses(memberId, spellRowId, remaining) {
        // Scoped to this campaign: the grant must belong to a member of it, so another campaign's row is never touched. The absolute count, so a retry lands once.
        const { data: member, error: memberError } = await admin.from("party_members").select("id").eq("id", memberId).eq("campaign_id", campaignId).maybeSingle();
        if (memberError) throw new Error(`party_members: ${memberError.message}`);
        if (!member) throw new Error("party_members: no such member in this campaign");
        const { error } = await admin.from("character_spells").update({ uses_remaining: remaining }).eq("id", spellRowId).eq("party_member_id", memberId);
        if (error) throw new Error(`character_spells: ${error.message}`);
      },
      async writeClassResources(memberId, resources) {
        // Scoped to this campaign: another campaign's member is never touched. The whole object, so a retry lands once.
        const { error } = await admin.from("party_members").update({ class_resources: resources }).eq("id", memberId).eq("campaign_id", campaignId);
        if (error) throw new Error(`party_members: ${error.message}`);
      },
      async judgeNote(noteQuestions, alreadyThisBatch) {
        // The same rule as campaign search's rerank: AI on for the campaign and a platform key, else the rules pick alone.
        // Nothing in here may fail the turn: any problem reads as "no answer".
        try {
          const { data: ai, error: aiError } = await admin.from("campaigns").select("ai_enabled").eq("id", campaignId).maybeSingle();
          if (aiError) throw new Error(`campaigns: ${aiError.message}`);
          if (!ai) return null;
          const key = judgingKey(ai.ai_enabled, (await fetchPlatformKeys(admin, ["typesafe"])).typesafe);
          if (key === null) return null;
          // The cap counts this fight's cost rows: the DM's rows of this operation since the fight began (the ledger
          // carries no encounter id, and a DM runs one live fight per campaign, so this over-counts at worst).
          const { data: fightRow, error: fightError } = await admin
            .from("encounter_state").select("started_at").eq("encounter_id", request.encounterId).eq("campaign_id", campaignId).maybeSingle();
          if (fightError) throw new Error(`encounter_state: ${fightError.message}`);
          if (!fightRow) return null;
          // A fight that was opened but whose combat has not started has no start time (the row has no creation
          // time either), so its window is the last hour: more than the cap in an hour before a fight begins is a loop.
          const started = fightRow.started_at as string | null;
          const since = started !== null ? started : new Date(Date.now() - NOTE_CAP_WINDOW_BEFORE_START_MS).toISOString();
          const { count, error: countError } = await admin
            .from("ai_credit_ledger").select("id", { count: "exact", head: true })
            .eq("user_id", userId).eq("reason", NOTE_JUDGMENT_OPERATION).gte("created_at", since);
          if (countError) throw new Error(`ai_credit_ledger: ${countError.message}`);
          if (count === null) throw new Error("ai_credit_ledger: no count came back");
          if (!underNoteCap(count, alreadyThisBatch)) return null;
          return await judge(noteQuestions, { apiKey: key, timeoutMs: NOTE_TIMEOUT_MS });
        } catch (e) {
          console.error("encounter-command: note judgment failed, the rules pick alone:", e instanceof Error ? e.message : "unknown error");
          return null;
        }
      },
      recordNoteJudgment: (inputTokens) =>
        recordFreeGeneration(admin, userId, NOTE_JUDGMENT_OPERATION, { model: JEV_MODEL, provider: "typesafe", input_tokens: inputTokens }),
      rollDie: (sides) => secureDie(sides),
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
