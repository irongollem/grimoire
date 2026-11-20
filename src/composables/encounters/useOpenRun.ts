import type { ComputedRef, Ref } from "vue";
import { computed, ref, watch } from "vue";
import { useEncounter } from "@/composables/encounters/useEncounters";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useCampaignJackOfAllTrades } from "@/composables/party/useJackOfAllTrades";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { useTrapResolver } from "@/composables/dungeon-features/useTraps";
import { encounterTrapRefs } from "@/lib/dungeon-features/library";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive } from "@/composables/encounters/useEncounterLive";
import { useToast } from "@/composables/useToast";
import { buildRunCombatants, legendaryActionCaps } from "@/lib/encounters/buildRunCombatants";
import { bystandersOf, lateBystanders } from "@/lib/encounters/bystandersOf";
import { confirmedFromAnswer, sendAlone } from "@/lib/encounters/fightWire";
import { DRAIN_TIMEOUT_MS } from "@/stores/encounterRunPump";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { Encounter } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { NpcListRow } from "@/types/npc.types";
import type { TrapEntry } from "@/types/trap.types";

/**
 * The store still holds the last fight's unsent batches when another fight is opened in the same tab, and
 * resetting it would drop them without a word. The store's own pump sends them (to the fight they belong to,
 * once each and in order); this waits for it, and if that cannot be done in time `onFailed` tells the DM, since
 * nothing will try again once the store is reset. It sends nothing itself: a second sender would double the
 * traffic and muddle the pump's failure counts.
 */
export async function sendLeftBehind(
  store: Pick<ReturnType<typeof useEncounterRunStore>, "linkedEncounterId" | "drainSends">,
  opening: string,
  onFailed: () => void,
  timeoutMs: number = DRAIN_TIMEOUT_MS,
): Promise<void> {
  const owner = store.linkedEncounterId();
  if (owner === null || owner === opening) return;
  if (!(await store.drainSends(timeoutMs))) onFailed();
}

/**
 * The encounter as it is fought. A fight from the AI table is fought by the played character and the party members
 * the AI plays beside them (#1021, allies: those whose player let the AI act for them, `aiPlays`). Every other
 * party member the encounter lists stays out: a solo player is never handed another player's sheet to play. With no
 * solo member the encounter is returned untouched, so the DM's own fight keeps its party. The played member is
 * fielded first, even when the encounter did not list them.
 */
export function foughtEncounter<E extends { party_member_ids: string[] }>(
  encounter: E,
  onlyMemberId: string | null,
  aiPlays: (memberId: string) => boolean = () => false,
): E {
  if (onlyMemberId === null) return encounter;
  const allies = encounter.party_member_ids.filter((id) => id !== onlyMemberId && aiPlays(id));
  return { ...encounter, party_member_ids: [onlyMemberId, ...allies] };
}

/**
 * Opens a saved encounter as the live fight: reads everything the roster needs, waits for it to settle, asks the
 * server to open the fight and builds the run store from the answer. Shared by every screen that runs a fight.
 */
export function useOpenRun(encounterId: Readonly<Ref<string>> | ComputedRef<string>, options: { onlyMemberId?: () => string | null } = {}) {
  const id = encounterId;
  const { data: encounter } = useEncounter(id);
  const { data: party, isFetching: partyFetching } = useActiveParty();
  const { data: companions, isFetching: companionsFetching } = useCompanions();
  // A player's AC is snapshotted into the run (and so into combatants_live) when
  // the store is built, so that waits for the gear: before it loads, everyone is
  // 10 + Dex.
  const { acFor, isReady: acReady } = useArmorClass();
  // Jack of All Trades is part of a character's initiative, snapshotted into the combatant, so a
  // fight is never built before the class rows load (it would score a Bard short all fight).
  const { jackFor, ready: jackReady } = useCampaignJackOfAllTrades();
  const { data: npcs, isFetching: npcsFetching } = useNpcs();
  // A character's token takes its species' (or subrace's) size, so the species the party has are read by id.
  const { data: speciesById, isLoading: speciesLoading } = useSpeciesByIds(() => (party.value ?? []).map((m) => m.species_id));
  // byId resolves the ids the encounter stored, library and own alike.
  const { byId: trapsById, isLoading: trapsLoading } = useTrapResolver(
    () => ({ includeAllScopes: true }),
    () => encounter.value?.library_trap_ids ?? [],
  );
  const store = useEncounterRunStore();
  const toast = useToast();
  // Follows the fight's row for the map and the monsters a fight in progress holds; the runner's transport takes the same reads.
  const { liveState } = useEncounterLive(id, { follow: true });

  /** Monsters an encounter's events may spawn (an absent `kind` means monster, see SpawnDef). */
  function spawnedMonsterIds(events: Encounter["events"] | undefined): string[] {
    const ids: string[] = [];
    for (const event of events ?? []) {
      for (const action of event.actions) {
        if (action.type !== "spawn_combatants") continue;
        for (const spawn of action.spawns) if (spawn.kind !== "npc") ids.push(spawn.monster_id);
      }
    }
    return ids;
  }

  // The runner needs full rows (stat block, size, art) for exactly the monsters it
  // can put on the field: the encounter's combatants, whatever its events spawn, and
  // whatever a live run already holds. Read by id with no scope filter, so a monster
  // the DM later scoped away still resolves mid-fight (#597).
  const { data: monsterMap, isLoading: monstersLoading } = useMonstersByIds(
    () => [
      ...(encounter.value?.combatants ?? []).map((c) => c.monster_id),
      ...spawnedMonsterIds(encounter.value?.events),
      ...(liveState.value?.combatants_live ?? []).map((c) => c.monster_id),
    ],
    { withArt: true },
  );

  // Monsters that join the field after the run starts (a spawn picked in the panel,
  // an event a complication added) are read the same way and merged into what the
  // store holds. Merge only: nothing is dropped (a row read again with its art replaces its plain twin), and the init watcher below never
  // re-runs for them.
  const { data: fieldMonsterMap } = useMonstersByIds(
    () => [
      ...store.combatants.map((c) => c.monster_id),
      ...spawnedMonsterIds(store.events),
    ],
    { withArt: true },
  );
  watch(fieldMonsterMap, (map) => {
    for (const monster of map.values()) {
      const at = store.availableMonsters.findIndex((m) => m.id === monster.id);
      if (at < 0) store.availableMonsters.push(monster);
      else if (store.availableMonsters[at] !== monster) store.availableMonsters.splice(at, 1, monster);
    }
    store.adoptStatBlocks();
  });

  // The campaign's NPCs, kept current for a run this surface holds: a stat block
  // written for an NPC mid-fight reaches the runner's sheet, its spawn picker and
  // its combatant's HP and AC. (Only the init watcher below used to set them, once.)
  watch(npcs, (list) => {
    if (!list || store.encounterId !== id.value) return;
    store.availableNpcs = list;
    store.adoptStatBlocks();
  });

  // Every run is a saved row (#1201). Opening the run view builds the roster as it always did and asks the
  // server to open the fight on it: the answer is the fight, a new one or the one already under way (a reload,
  // a second device, a run started on a phone), and the store is built from the answer, never from the roster
  // just built. The store outlives this component, so a remount (the battle map and back, a quest tool
  // reopening) keeps the run too; only End combat and Abandon clear it. It waits for the party, companion and
  // NPC reads to settle, because a cached row shown while its refetch is in flight would seed a new fight with
  // stale hit points and conditions, which End combat then writes back.
  const readsSettled = computed(() => !partyFetching.value && !companionsFetching.value && !npcsFetching.value);

  /** Set when the fight is on screen. Not derived from the store: End combat resets the store while the runner is still leaving. */
  const opened = ref(false);
  const openError = ref<string | null>(null);
  /** The encounter an open was started for, so a refetch while it is in flight, or after End combat, never opens a second fight. */
  let openingFor: string | null = null;

  watch(id, () => {
    opened.value = false;
    openError.value = null;
    openingFor = null;
  });

  function tryOpen() {
    const enc = encounter.value;
    const traps = trapsById.value;
    if (!enc || monstersLoading.value || !party.value || !companions.value || !npcs.value || trapsLoading.value || speciesLoading.value || !acReady.value) return;
    if (store.encounterId === enc.id) {
      opened.value = true;
      return;
    }
    if (openingFor === enc.id || !readsSettled.value || !jackReady.value) return;
    openingFor = enc.id;
    void openRun(enc, [...monsterMap.value.values()], party.value, npcs.value, filterEncounterTraps(enc, traps)).catch((error: unknown) => {
      openingFor = null;
      openError.value = toast.fromError(error, "Check your connection.");
    });
  }

  watch(
    [encounter, monsterMap, monstersLoading, party, companions, npcs, trapsById, trapsLoading, acReady, readsSettled, speciesLoading, jackReady],
    tryOpen,
    { immediate: true },
  );

  function retry() {
    openError.value = null;
    tryOpen();
  }

  function filterEncounterTraps(enc: Encounter, all: ReadonlyMap<string, TrapEntry>): TrapEntry[] {
    // A trap listed twice (quantity) is one card in the runner.
    return [...new Set(encounterTrapRefs(enc))]
      .map((id) => all.get(id))
      .filter((trap): trap is TrapEntry => trap !== undefined);
  }

  async function openRun(enc: Encounter, mons: Monster[], par: PartyMember[], npcList: NpcListRow[], traps: TrapEntry[]) {
    const onlyMember = options.onlyMemberId?.() ?? null;
    const fought = foughtEncounter(enc, onlyMember, (id) => par.some((m) => m.id === id && m.ai_speaks === true));
    const built = buildRunCombatants({ encounter: fought, party: par, companions: companions.value ?? [], monsters: mons, npcs: npcList, species: [...speciesById.value.values()], acFor, jackFor });
    // Only the AI table seats the characters who are in the room: a DM's own run adds whom they choose.
    const inTheRoom = onlyMember !== null ? bystandersOf(npcList, enc.location_id, built) : [];
    const combatants = [...built, ...inTheRoom];
    const legendaryCaps = legendaryActionCaps(combatants, mons);
    const { answer } = await sendAlone(enc.id, { type: "open", combatants, ...(Object.keys(legendaryCaps).length ? { legendaryCaps } : {}) });
    if (id.value !== enc.id) return;
    const held = answer.state.combatants_live;
    await sendLeftBehind(store, id.value, () => toast.error("Some changes to the last fight could not be saved."));
    // The send above waited: the route may have moved on again, and then this open is no longer wanted.
    if (id.value !== enc.id) return;
    store.reset();
    store.availableMonsters = mons;
    store.availableNpcs = npcList;
    // The owner is found by the same lookup the server makes when it loads the row, so the two agree on who holds the lair.
    store.setBossMechanics({
      lairEnabled: enc.lair_enabled,
      lairOwnerInstanceId: enc.lair_enabled && enc.lair_owner_def_id ? (held.find((c) => c.def_id === enc.lair_owner_def_id)?.instance_id ?? null) : null,
    });
    store.startFight(
      {
        encounterId: enc.id,
        encounterName: enc.name,
        factions: enc.factions.length ? enc.factions : [...DEFAULT_FACTIONS],
        events: enc.events ?? [],
        traps,
      },
      confirmedFromAnswer(answer),
    );
    // A stat block written while no runner was open.
    store.adoptStatBlocks();
    // The fight that caught up with the party was on record already, without whoever travels with them.
    store.join(lateBystanders(inTheRoom, held, answer.state.current_round));
    opened.value = true;
  }

  return { encounter, opened, openError, retry };
}
