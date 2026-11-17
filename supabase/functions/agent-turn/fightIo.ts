// The database half of the fight bridge (#1021, story 13). The rules are `_shared/agent/fight.ts`; this reads what
// the narrator is shown about fights and starts the one it asked for.
//
// Through the CALLER's client wherever the campaign's own rows are read or written (encounters, monsters,
// characters, the bestiary): the DM's RLS decides, exactly as when they prepare or start a fight by hand. Only the
// conversation's own row takes the admin client, because no client may write it. Every read and write names the
// campaign, so an id from another campaign matches nothing.
//
// Thin on purpose: no test harness here, the rules are tested where they live.

import { carriedRoster, followersOf } from "../_shared/agent/pursuit.ts";
import { encounterLootRows } from "../_shared/agent/encounterLoot.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fightStateOf, MAX_PREPARED, type Fighter, type FightPlan, type FightsInView, type FightState, type PreparedFight } from "../_shared/agent/fight.ts";
import { loadStatBlocks, statBlockIdsOf, statBlockOf } from "../_shared/fightStatBlocks.ts";
import { temperLine, temperOf } from "../../../src/rules/fight/tactics/temper.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";

type Row = Record<string, unknown>;

// The app's own default factions (`DEFAULT_FACTIONS` in src/types/encounter.types.ts): a fight the table puts
// together is an ordinary encounter, so it carries the same four.
const DEFAULT_FACTIONS = [
  { id: "players", name: "Players", color: "#1C2A4A", hostile_to: ["enemy"] },
  { id: "enemy", name: "Enemy", color: "#6B1C1C", hostile_to: ["players", "ally"] },
  { id: "ally", name: "Ally", color: "#1A4A1A", hostile_to: ["enemy"] },
  { id: "neutral", name: "Neutral", color: "#3D3D3D", hostile_to: [] },
];

const strings = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);

interface Def {
  monsterId: string | null;
  npcId: string | null;
  count: number;
}

function defsOf(combatants: unknown): Def[] {
  if (!Array.isArray(combatants)) return [];
  return combatants.flatMap((raw): Def[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const c = raw as Row;
    const count = typeof c.count === "number" && Number.isInteger(c.count) && c.count > 0 ? c.count : 1;
    return [{ monsterId: typeof c.monster_id === "string" ? c.monster_id : null, npcId: typeof c.npc_id === "string" ? c.npc_id : null, count }];
  });
}

async function namesOf(client: SupabaseClient, table: "monsters" | "npcs", campaignId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.from(table).select("id, name").eq("campaign_id", campaignId).in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
}

/** One encounter's fight as it stands, with what each creature's stat block says of its nature. Null when the encounter is gone. */
async function fightOf(client: SupabaseClient, campaignId: string, fightEncounterId: string): Promise<FightState | null> {
  let fight: FightState | null = null;
  const enc = await client.from("encounters").select("id, name, is_finished").eq("id", fightEncounterId).eq("campaign_id", campaignId).maybeSingle();
  if (enc.error) throw enc.error;
  if (enc.data) {
    const live = await client
      .from("encounter_state")
      .select("is_running, ended_at, current_round, combatants_live")
      .eq("encounter_id", fightEncounterId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (live.error) throw live.error;
    fight = fightStateOf({
      encounterId: enc.data.id as string,
      name: enc.data.name as string,
      finished: enc.data.is_finished === true,
      live: live.data
        ? {
          isRunning: live.data.is_running === true,
          endedAt: (live.data.ended_at as string | null) ?? null,
          round: typeof live.data.current_round === "number" ? live.data.current_round : 1,
          combatants: live.data.combatants_live,
        }
        : null,
    });
    // What can be done to each creature without a weapon, from its own stat block. Unreadable leaves the line
    // out: the narrator then rules without it, as before.
    try {
      const roster = Array.isArray(live.data?.combatants_live) ? (live.data.combatants_live as RunCombatant[]) : [];
      const sources = await loadStatBlocks(client, campaignId, statBlockIdsOf(roster));
      const natures = new Map<string, NonNullable<Fighter["nature"]>>();
      for (const c of roster) {
        const block = statBlockOf(c, sources);
        if (block === null || c.type === "player") continue;
        const kind = c.monster_id ? (sources.monsters.find((m) => m.id === c.monster_id)?.monster_type ?? null) : null;
        const temper = temperOf(block, kind);
        natures.set(c.name, { line: temperLine(temper), yields: temper.yields, pursuit: temper.pursuit, immune: [...(block.defenses?.condition_immunities ?? [])] });
      }
      fight = { ...fight, fighters: fight.fighters.map((f) => (f.side === "party" || !natures.has(f.name) ? f : { ...f, nature: natures.get(f.name) })) };
    } catch (error) {
      console.error("agent-turn: reading the fighters' stat blocks failed:", error);
    }
  }
  return fight;
}

/** What the narrator is shown about fights: those prepared at the party's place, and the one this conversation started. */
export async function loadFights(
  client: SupabaseClient,
  campaignId: string,
  locationId: string | null,
  fightEncounterId: string | null,
  pursuitEncounterId: string | null = null,
): Promise<FightsInView> {
  const fight = fightEncounterId === null ? null : await fightOf(client, campaignId, fightEncounterId);
  // Whoever is on the party's heels is told only while no fight is on: one fight at a time.
  const chased = fight === null && pursuitEncounterId !== null ? await fightOf(client, campaignId, pursuitEncounterId) : null;
  const pursuit = chased !== null && followersOf(chased).length > 0 ? chased : null;

  let prepared: PreparedFight[] = [];
  if (locationId !== null) {
    const found = await client
      .from("encounters")
      .select("id, name, combatants")
      .eq("campaign_id", campaignId)
      .eq("location_id", locationId)
      .eq("is_finished", false)
      .order("name", { ascending: true })
      .limit(MAX_PREPARED + 1);
    if (found.error) throw found.error;
    // The fight that follows is listed as following, not as prepared here too (a party that went back to it).
    const rows = (found.data ?? []).filter((r) => r.id !== fightEncounterId && (pursuit === null || r.id !== pursuit.encounterId));
    const defs = rows.map((r) => defsOf(r.combatants));
    const monsterNames = await namesOf(client, "monsters", campaignId, [...new Set(defs.flat().flatMap((d) => (d.monsterId ? [d.monsterId] : [])))]);
    const npcNames = await namesOf(client, "npcs", campaignId, [...new Set(defs.flat().flatMap((d) => (d.npcId ? [d.npcId] : [])))]);
    prepared = rows.map((r, i) => ({
      id: r.id as string,
      name: r.name as string,
      creatures: defs[i]
        .flatMap((d) => {
          const name = d.monsterId ? monsterNames.get(d.monsterId) : d.npcId ? npcNames.get(d.npcId) : undefined;
          return name ? [d.count > 1 ? `${d.count} ${name}` : name] : [];
        })
        .join(", "),
    }));
  }
  return { prepared, fight, pursuit };
}

/**
 * The names of a planned fight's creatures the rules cannot play: those whose record has no stat block. An id that
 * is not this campaign's is not named here; starting the fight refuses it.
 */
export async function statlessFighters(client: SupabaseClient, campaignId: string, plan: FightPlan): Promise<string[]> {
  let defs: Def[];
  if (plan.kind === "prepared") {
    const found = await client.from("encounters").select("combatants").eq("id", plan.encounterId).eq("campaign_id", campaignId).maybeSingle();
    if (found.error) throw found.error;
    defs = defsOf(found.data?.combatants);
  } else {
    defs = plan.creatures.map((c) => ({ monsterId: c.monsterId, npcId: c.npcId, count: c.count }));
  }
  const names: string[] = [];
  for (const table of ["monsters", "npcs"] as const) {
    const ids = [...new Set(defs.flatMap((d) => (table === "monsters" ? d.monsterId : d.npcId) ?? []))];
    if (ids.length === 0) continue;
    const { data, error } = await client.from(table).select("name").eq("campaign_id", campaignId).in("id", ids).is("stat_block", null);
    if (error) throw error;
    names.push(...(data ?? []).map((r) => r.name as string));
  }
  return names;
}

/** Points the conversation at a fight, or (null) lets go of it. The server's own row, so the admin client. */
export async function setFight(admin: SupabaseClient, sessionId: string, campaignId: string, encounterId: string | null): Promise<void> {
  const { error } = await admin.from("agent_sessions").update({ fight_encounter_id: encounterId }).eq("id", sessionId).eq("campaign_id", campaignId);
  if (error) throw error;
}

/** Says which fight is on the party's heels, or (null) that nobody follows. The server's own row, so the admin client. */
export async function setPursuit(admin: SupabaseClient, sessionId: string, campaignId: string, encounterId: string | null): Promise<void> {
  const { error } = await admin.from("agent_sessions").update({ pursuit_encounter_id: encounterId }).eq("id", sessionId).eq("campaign_id", campaignId);
  if (error) throw error;
}

/**
 * The fight that followed the party arrives where it caught them: the encounter moves to that place, and its fight
 * row is opened again with the creatures who followed as they were left (`carriedRoster`), in no order and on no
 * square yet. A row that has not ended is one the page resumes, so nothing is rebuilt at full health.
 */
async function carryFight(admin: SupabaseClient, campaignId: string, encounterId: string, placeId: string | null, followers: readonly string[]): Promise<void> {
  const row = await admin.from("encounter_state").select("id, version, combatants_live").eq("encounter_id", encounterId).eq("campaign_id", campaignId).maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) throw new Error("the fight that followed has no fight to carry on");
  const roster = carriedRoster(row.data.combatants_live, followers);
  if (!roster.some((c) => c.type !== "player")) throw new Error("nobody is left of the fight that followed");
  if (placeId !== null) {
    const moved = await admin.from("encounters").update({ location_id: placeId }).eq("id", encounterId).eq("campaign_id", campaignId);
    if (moved.error) throw moved.error;
  }
  const { error } = await admin
    .from("encounter_state")
    .update({
      combatants_live: roster, current_round: 0, active_combatant_index: 0, is_running: false, ended_at: null, started_at: null,
      events_fired: [], lair_fired_rounds: [], applied_command_ids: [], magical_darkness: [], version: (row.data.version as number) + 1,
    })
    .eq("id", row.data.id as string)
    .eq("version", row.data.version as number);
  if (error) throw error;
}

/** A fight that was fought out is finished: it is not offered at its place again. */
export async function finishFight(admin: SupabaseClient, campaignId: string, encounterId: string): Promise<void> {
  const { error } = await admin.from("encounters").update({ is_finished: true }).eq("id", encounterId).eq("campaign_id", campaignId);
  if (error) throw error;
}

/**
 * Lays a won fight's loot notes where it was fought, as ordinary placed loot (`encounterLoot.ts`). Once per
 * encounter: rows it laid earlier, taken or not, mean there is nothing more to lay. An encounter with no place of
 * its own lies where the party stands; with no place at all there is nowhere to lay it.
 */
export async function layFightLoot(admin: SupabaseClient, campaignId: string, encounterId: string, placeId: string | null): Promise<void> {
  const enc = await admin.from("encounters").select("item_ids, reward_currency_pools, location_id").eq("id", encounterId).eq("campaign_id", campaignId).maybeSingle();
  if (enc.error) throw enc.error;
  if (!enc.data) return;
  const rows = encounterLootRows(enc.data.item_ids, enc.data.reward_currency_pools);
  const where = typeof enc.data.location_id === "string" ? enc.data.location_id : placeId;
  if (rows.length === 0 || where === null) return;
  const laid = await admin.from("loot_placements").select("id").eq("campaign_id", campaignId).eq("source_type", "encounter_loot").eq("source_id", encounterId).limit(1);
  if (laid.error) throw laid.error;
  if ((laid.data ?? []).length > 0) return;
  const { error } = await admin.from("loot_placements").insert(
    rows.map((row, index) => ({ ...row, campaign_id: campaignId, location_id: where, beat_id: null, quest_id: null, source_type: "encounter_loot", source_id: encounterId, sort_order: 1000 + index })),
  );
  if (error) throw error;
}

/** The monsters of a fight go into the played character's bestiary: met, not yet studied (no stats revealed). */
async function discover(client: SupabaseClient, campaignId: string, memberId: string, playSessionId: string | null, monsterIds: string[]): Promise<void> {
  if (monsterIds.length === 0) return;
  const known = await client.from("discovered_monsters").select("id, monster_id, visible_to").eq("campaign_id", campaignId).in("monster_id", monsterIds);
  if (known.error) throw known.error;
  const byMonster = new Map((known.data ?? []).map((r) => [r.monster_id as string, r]));
  for (const monsterId of monsterIds) {
    const row = byMonster.get(monsterId);
    if (!row) {
      const { error } = await client.from("discovered_monsters").insert({ campaign_id: campaignId, monster_id: monsterId, visible_to: [memberId], session_id: playSessionId });
      if (error) throw error;
      continue;
    }
    // A null list means the whole party already knows it; a list is who does.
    if (row.visible_to === null) continue;
    const seen = strings(row.visible_to);
    if (seen.includes(memberId)) continue;
    const { error } = await client.from("discovered_monsters").update({ visible_to: [...seen, memberId] }).eq("id", row.id as string).eq("campaign_id", campaignId);
    if (error) throw error;
  }
}

/**
 * Starts the fight the narrator asked for and answers which encounter it is. A prepared fight is the DM's own
 * encounter, with the played character put in its party; an improvised one is a new encounter at the party's
 * place, whose creatures must all be this campaign's.
 */
export async function startFight(
  client: SupabaseClient,
  admin: SupabaseClient,
  ctx: { campaignId: string; sessionId: string; userId: string; memberId: string; locationId: string | null; playSessionId: string | null },
  plan: FightPlan,
): Promise<{ encounterId: string; name: string }> {
  const { campaignId, memberId } = ctx;
  let encounterId: string;
  let monsterIds: string[];

  if (plan.kind === "prepared") {
    const found = await client.from("encounters").select("id, party_member_ids, combatants").eq("id", plan.encounterId).eq("campaign_id", campaignId).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new Error("the prepared fight is no longer there");
    const party = strings(found.data.party_member_ids);
    if (!party.includes(memberId)) {
      const { error } = await client.from("encounters").update({ party_member_ids: [...party, memberId] }).eq("id", plan.encounterId).eq("campaign_id", campaignId);
      if (error) throw error;
    }
    if (plan.carried !== undefined) await carryFight(admin, campaignId, plan.encounterId, ctx.locationId, plan.carried);
    encounterId = plan.encounterId;
    monsterIds = defsOf(found.data.combatants).flatMap((d) => (d.monsterId ? [d.monsterId] : []));
  } else {
    monsterIds = plan.creatures.flatMap((c) => (c.monsterId ? [c.monsterId] : []));
    const npcIds = plan.creatures.flatMap((c) => (c.npcId ? [c.npcId] : []));
    // The model can name any id it has seen: every creature must be one of this campaign's before anything is written.
    const monsters = await namesOf(client, "monsters", campaignId, [...new Set(monsterIds)]);
    const npcs = await namesOf(client, "npcs", campaignId, [...new Set(npcIds)]);
    if (monsterIds.some((id) => !monsters.has(id)) || npcIds.some((id) => !npcs.has(id))) {
      throw new Error("a creature of the fight is not one of this campaign's");
    }
    const made = await client
      .from("encounters")
      .insert({
        user_id: ctx.userId,
        campaign_id: campaignId,
        name: plan.name,
        description: null,
        party_member_ids: [memberId],
        combatants: plan.creatures.map((c) => ({
          id: crypto.randomUUID(),
          monster_id: c.monsterId,
          npc_id: c.npcId,
          count: c.count,
          faction_id: "enemy",
          custom_name: null,
        })),
        factions: DEFAULT_FACTIONS,
        location_id: ctx.locationId,
      })
      .select("id")
      .single();
    if (made.error) throw made.error;
    encounterId = made.data.id as string;
  }

  await setFight(admin, ctx.sessionId, campaignId, encounterId);
  // The fight that followed has caught up: nobody is on the party's heels any more.
  if (plan.kind === "prepared" && plan.carried !== undefined) await setPursuit(admin, ctx.sessionId, campaignId, null);
  // After the fight exists: a bestiary that could not be written costs an entry, never the fight.
  try {
    await discover(client, campaignId, memberId, ctx.playSessionId, [...new Set(monsterIds)]);
  } catch (error) {
    console.error("agent-turn: adding the fight's monsters to the bestiary failed:", error);
  }
  return { encounterId, name: plan.name };
}
