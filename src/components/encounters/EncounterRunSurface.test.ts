// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import EncounterRunSurface from "./EncounterRunSurface.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { Encounter, RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import type { FightAnswer } from "@/lib/encounters/fightWire";

const data = vi.hoisted(() => ({
  encounter: null as unknown,
  party: null as unknown,
  companions: null as unknown,
  partyFetching: null as unknown,
  liveState: null as unknown,
  species: null as unknown,
  speciesLoading: null as unknown,
  jackReady: null as unknown,
  send: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), info: vi.fn(), fromError: (_e: unknown, fallback: string) => fallback }) }));
vi.mock("@/lib/encounters/fightWire", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/encounters/fightWire")>()),
  sendAlone: data.send,
}));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounter: () => ({ data: data.encounter }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: data.party, isFetching: data.partyFetching }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: data.companions, isFetching: ref(false) }) }));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({ acFor: () => 10, isReady: ref(true) }) }));
vi.mock("@/composables/party/useJackOfAllTrades", () => ({ useCampaignJackOfAllTrades: () => ({ jackFor: () => "none", ready: data.jackReady }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]), isFetching: ref(false) }) }));
vi.mock("@/composables/rules/useSpecies", () => ({ useSpeciesByIds: () => ({ data: data.species, isLoading: data.speciesLoading }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useTrapResolver: () => ({ byId: ref(new Map()), isLoading: ref(false) }),
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({
  useMonstersByIds: () => ({ data: ref(new Map()), isLoading: ref(false) }),
}));
vi.mock("@/composables/encounters/useEncounterLive", () => ({
  useEncounterLive: () => ({ liveState: data.liveState, liveStateLoaded: ref(true) }),
}));

const encounter = {
  id: "e1",
  name: "The Working Kitchen",
  factions: [],
  combatants: [],
  events: [],
  party_member_ids: [],
  companion_ids: [],
  trap_ids: [],
  library_trap_ids: [],
  party_member_factions: {},
  lair_enabled: false,
  lair_owner_def_id: null,
} as unknown as Encounter;

const stubs = { EncounterRunner: true, LoadingSpinner: true };

/** What the function answers to `open`: a new fight on the roster it was handed, or the one already under way. */
function answerWith(combatants: RunCombatant[], over: Partial<FightAnswer["state"]> = {}): { answer: FightAnswer; batchId: string } {
  return {
    batchId: "b",
    answer: {
      applied: true, version: 1, is_running: false, ended_at: null,
      state: { combatants_live: combatants, current_round: 0, active_combatant_index: 0, events_fired: [], lair_fired_rounds: [], ...over },
      effects: [], effectFailures: [],
    },
  };
}
const openedWith = () => (data.send.mock.calls[0]?.[1] as { type: string; combatants: RunCombatant[] } | undefined);

beforeEach(() => {
  setActivePinia(createPinia());
  data.send.mockReset();
  data.send.mockImplementation(async (_id: string, command: { combatants: RunCombatant[] }) => answerWith(command.combatants));
  data.encounter = ref(encounter);
  data.party = ref<PartyMember[]>([]);
  data.companions = ref([]);
  data.partyFetching = ref(false);
  data.liveState = ref(null);
  data.species = ref(new Map());
  data.speciesLoading = ref(false);
  data.jackReady = ref(true);
});

describe("EncounterRunSurface: opening a run", () => {
  // PHB 2024 "Creature Size": a Small character fits a 5 ft square like a Medium one; a Large one takes four.
  it("waits for the party's species, so a Large character is not built as Medium and kept that way", async () => {
    const member = {
      id: "pm-1", name: "Brakka", current_hp: 9, max_hp: 9, temp_hp: 0, conditions: [], curses: [],
      death_save_successes: 0, death_save_failures: 0, dex: 10, con: 10, wis: 10, cha: 10,
      species_id: "sp-goliath", subrace: null, ruleset: "2014", class: null, subclass: null, ac_formula: null,
      class_choices: {}, portrait_url: null, portrait_focal_point: null, wildshape_state: null,
    } as unknown as PartyMember;
    (data.party as { value: PartyMember[] }).value = [member];
    (data.encounter as { value: Encounter }).value = { ...encounter, party_member_ids: ["pm-1"] };
    (data.speciesLoading as { value: boolean }).value = true;
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(data.send).not.toHaveBeenCalled();

    (data.species as { value: Map<string, unknown> }).value = new Map([["sp-goliath", { id: "sp-goliath", size: "large", subraces: null }]]);
    (data.speciesLoading as { value: boolean }).value = false;
    await nextTick();
    await flushPromises();
    expect(openedWith()?.combatants[0]).toMatchObject({ size: "large", footprint: 2 });
  });

  it("fails if the run is not built from the server's answer to open, a new fight or the one under way", async () => {
    // A reload, or a second device: the row is already a fight in round 3, whatever roster this tab built.
    const underway = { instance_id: "x", type: "monster", name: "Ogre", faction_id: "f", initiative: 12, hp: 4, max_hp: 30, ac: "12", conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0 } as RunCombatant;
    data.send.mockResolvedValue(answerWith([underway], { current_round: 3 }));
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    const store = useEncounterRunStore();
    expect(store.encounterId).toBe("e1");
    expect(store.round).toBe(3);
    expect(store.started).toBe(true);
    expect(store.combatants.map((c) => c.instance_id)).toEqual(["x"]);
  });

  it("fails if a party refetch opens a second fight (a damage write rang it back and reset the run to the lobby)", async () => {
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(data.send).toHaveBeenCalledTimes(1);

    (data.party as { value: PartyMember[] }).value = [];
    await nextTick();
    await flushPromises();
    expect(data.send).toHaveBeenCalledTimes(1);
  });

  it("fails if End combat's reset lets a late refetch open a new fight on the one just ended", async () => {
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    useEncounterRunStore().reset();
    (data.party as { value: PartyMember[] }).value = [];
    await nextTick();
    await flushPromises();
    expect(data.send).toHaveBeenCalledTimes(1);
  });

  it("waits for the class rows, so a Bard is not built without Jack of All Trades and kept short all fight", async () => {
    (data.jackReady as { value: boolean }).value = false;
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(data.send).not.toHaveBeenCalled();

    (data.jackReady as { value: boolean }).value = true;
    await nextTick();
    await flushPromises();
    expect(data.send).toHaveBeenCalledTimes(1);
  });

  it("waits for companions before building, so they are not left out of the roster", async () => {
    (data.companions as { value: unknown }).value = undefined;
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(data.send).not.toHaveBeenCalled();

    (data.companions as { value: unknown }).value = [];
    await nextTick();
    await flushPromises();
    expect(data.send).toHaveBeenCalledTimes(1);
  });

  it("keeps the fight when the surface mounts again (the battle map and back reset it to the lobby)", async () => {
    const first = mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    const store = useEncounterRunStore();
    store.round = 3;
    first.unmount();

    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(store.round).toBe(3);
    expect(data.send).toHaveBeenCalledTimes(1);
  });

  it("waits for a party refetch in flight, so a cached row's stale HP does not seed the fight", async () => {
    const fetching = ref(true);
    data.partyFetching = fetching;
    const stale = { id: "pm1", name: "Ilsa", current_hp: 4, max_hp: 30, conditions: [] } as unknown as PartyMember;
    data.party = ref<PartyMember[]>([stale]);
    data.encounter = ref({ ...encounter, party_member_ids: ["pm1"] });
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(data.send).not.toHaveBeenCalled();

    (data.party as { value: PartyMember[] }).value = [{ ...stale, current_hp: 30 }];
    fetching.value = false;
    await nextTick();
    await flushPromises();
    expect(openedWith()?.combatants.find((c) => c.party_member_id === "pm1")?.hp).toBe(30);
  });

  it("fails if a failed open leaves a blank screen instead of saying so, or Try again does not open the fight", async () => {
    data.send.mockRejectedValueOnce(new Error("offline"));
    const w = mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain("Couldn't open this fight");
    expect(useEncounterRunStore().encounterId).toBeNull();

    await w.find("button").trigger("click");
    await flushPromises();
    expect(useEncounterRunStore().encounterId).toBe("e1");
  });
});
