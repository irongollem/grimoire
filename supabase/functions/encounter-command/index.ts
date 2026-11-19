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
import { gameSystemEdition } from "../_shared/gameSystem.ts";
import { fightMapOf } from "../../../src/rules/fight/terrain/battleMap.ts";
import { recordFreeGeneration } from "../_shared/credits.ts";
import { fetchPlatformKeys } from "../_shared/platform-keys.ts";
import { underNoteCap } from "../_shared/tacticsJudge.ts";
import { judge, JEV_MODEL } from "../_shared/typesafe.ts";
import { rerankKey } from "../search-campaign/rerank.ts";
import { rollMessageRow, secureDie } from "../_shared/serverRoll.ts";
import { inventoryItemRef } from "../../../src/lib/itemRef.ts";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { libraryMonsterRow } from "../../../src/lib/library/libraryMonsterRow.ts";
import { DEFAULT_RULESET } from "../../../src/types/ruleset.types.ts";
import type { EncounterEvent } from "../../../src/types/encounter.types.ts";
import type { ExploreParty } from "../../../src/types/exploreParty.types.ts";
import type { PartyIngestRow } from "../../../src/rules/fight/partyIngest.ts";
import type { PartyInventoryItem } from "../../../src/types/inventory.types.ts";
import type { Item } from "../../../src/types/item.types.ts";
import { normalizeLibraryItem } from "../../../src/lib/items/normalizeLibraryItem.ts";
import type { BeastScores, PlayerSheetRow } from "../../../src/rules/fight/playerSheet.ts";
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

    const access = await loadEncounterAsDm<{
      id: string; campaign_id: string | null; events: EncounterEvent[] | null; lair_enabled: boolean; lair_owner_def_id: string | null; factions: FactionSides | null;
    }>(admin, userId, request.encounterId, "id, campaign_id, events, lair_enabled, lair_owner_def_id, factions");
    if (!access.ok) return access.response;
    const { encounter, campaign } = access;
    const campaignId = campaign.id;

    // Settings that do not change between the attempts of one batch are read once.
    const events = (encounter.events ?? []) as EncounterEvent[];
    const { monsterIds, npcIds } = spawnIds(events);
    const monsters = await loadMonsters(admin, monsterIds);
    const npcs = await loadNpcs(admin, campaignId, npcIds);
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
          // An encounter saved with no factions of its own runs on the defaults, as the runner opens it.
          factions: encounter.factions && encounter.factions.length > 0 ? encounter.factions : DEFAULT_FACTIONS,
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
      loadStatBlocks: (ids) => loadStatBlocks(admin, campaignId, ids),
      loadSpells: (name) => loadSpellsNamed(admin, campaignId, campaign.user_id, name),
      loadSpellsListed: (names) => loadSpellsListed(admin, campaignId, campaign.user_id, names),
      async loadPlayerSheets(memberIds) {
        // Every read is scoped to this campaign. The inventory ids come from this campaign's own rows (a database
        // trigger keeps an inventory row's item in the same campaign or a global row its owner may use), and an
        // item is read only when it is this campaign's or a global one, so a forged id names nothing of another account's.
        const { data: members, error: memberError } = await admin
          .from("party_members")
          .select("id, ruleset, class, subclass, ac_formula, class_choices, str, dex, con, int, wis, cha, proficiency_bonus, saving_throw_proficiencies, wildshape_state")
          .eq("campaign_id", campaignId)
          .in("id", memberIds);
        if (memberError) throw new Error(`party_members: ${memberError.message}`);
        const { data: inventory, error: inventoryError } = await admin
          .from("party_inventory").select("*").eq("campaign_id", campaignId).in("carried_by", memberIds);
        if (inventoryError) throw new Error(`party_inventory: ${inventoryError.message}`);
        const rows = inventory as PartyInventoryItem[];
        const refs = [...new Set(rows.flatMap((r) => inventoryItemRef(r) ?? []))];
        const items: Item[] = [];
        const customIds = refs.filter(isUuid);
        const libraryIds = refs.filter((id) => !isUuid(id));
        if (customIds.length > 0) {
          const { data, error } = await admin
            .from("items").select("*").in("id", customIds).or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
          if (error) throw new Error(`items: ${error.message}`);
          items.push(...(data as Item[]));
        }
        if (libraryIds.length > 0) {
          const { data, error } = await admin.from("library_items").select("*").in("id", libraryIds);
          if (error) throw new Error(`library_items: ${error.message}`);
          items.push(...data.map(normalizeLibraryItem));
        }
        // A Wild Shape form's STR, DEX and CON replace the character's own on a save.
        const formIds = [...new Set((members as PlayerSheetRow[]).flatMap((m) => m.wildshape_state?.monster_id ?? []))];
        const beasts: BeastScores[] = [];
        const libraryForms = formIds.filter((id) => !isUuid(id));
        const customForms = formIds.filter(isUuid);
        if (libraryForms.length > 0) {
          const { data, error } = await admin.from("library_monsters").select("*").in("id", libraryForms);
          if (error) throw new Error(`library_monsters: ${error.message}`);
          beasts.push(...data.map(libraryMonsterRow).map((m) => ({ id: m.id, stat_block: m.stat_block })));
        }
        if (customForms.length > 0) {
          const { data, error } = await admin
            .from("monsters").select("id, stat_block").in("id", customForms).or(`campaign_id.eq.${campaignId},campaign_id.is.null`);
          if (error) throw new Error(`monsters: ${error.message}`);
          beasts.push(...(data as BeastScores[]));
        }
        return { members: members as PlayerSheetRow[], inventory: rows, items, beasts };
      },
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
      async judgeNote(noteQuestions, alreadyThisBatch) {
        // The same rule as campaign search's rerank: AI on for the campaign and a platform key, else the rules pick alone.
        // Nothing in here may fail the turn: any problem reads as "no answer".
        try {
          const { data: ai, error: aiError } = await admin.from("campaigns").select("ai_enabled").eq("id", campaignId).maybeSingle();
          if (aiError) throw new Error(`campaigns: ${aiError.message}`);
          if (!ai) return null;
          const key = rerankKey(ai.ai_enabled, (await fetchPlatformKeys(admin, ["typesafe"])).typesafe);
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
