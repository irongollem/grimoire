// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import EncounterRunSurface from "./EncounterRunSurface.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { Encounter } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";

const data = vi.hoisted(() => ({
  encounter: null as unknown,
  party: null as unknown,
  companions: null as unknown,
  partyFetching: null as unknown,
  liveState: null as unknown,
}));

vi.mock("@/composables/encounters/useEncounters", () => ({ useEncounter: () => ({ data: data.encounter }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: data.party, isFetching: data.partyFetching }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: data.companions, isFetching: ref(false) }) }));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({ acFor: () => 10, isReady: ref(true) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]), isFetching: ref(false) }) }));
vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useTrapIndex: () => ({ byId: ref(new Map()), isLoading: ref(false) }),
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

describe("EncounterRunSurface: a run that is not live", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    data.encounter = ref(encounter);
    data.party = ref<PartyMember[]>([]);
    data.companions = ref([]);
    data.partyFetching = ref(false);
    data.liveState = ref(null);
  });

  it("keeps the fight when the party refetches (a damage write rang it back and reset the run to the lobby)", async () => {
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    const store = useEncounterRunStore();
    expect(store.encounterId).toBe("e1");

    store.round = 3;
    store.started = true;
    (data.party as { value: PartyMember[] }).value = [];
    await nextTick();

    expect(store.round).toBe(3);
    expect(store.started).toBe(true);
  });

  it("waits for companions before building, so they are not left out of the roster", async () => {
    (data.companions as { value: unknown }).value = undefined;
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    const store = useEncounterRunStore();
    expect(store.encounterId).toBe(null);

    (data.companions as { value: unknown }).value = [];
    await nextTick();
    expect(store.encounterId).toBe("e1");
  });

  it("keeps the fight when the surface mounts again (the battle map and back reset it to the lobby)", async () => {
    const first = mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    const store = useEncounterRunStore();
    store.round = 3;
    store.started = true;
    first.unmount();

    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    await nextTick();
    expect(store.round).toBe(3);
    expect(store.started).toBe(true);
  });

  it("waits for a party refetch in flight, so a cached row's stale HP does not seed the fight", async () => {
    const fetching = ref(true);
    data.partyFetching = fetching;
    const stale = { id: "pm1", name: "Ilsa", current_hp: 4, max_hp: 30, conditions: [] } as unknown as PartyMember;
    data.party = ref<PartyMember[]>([stale]);
    data.encounter = ref({ ...encounter, party_member_ids: ["pm1"] });
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    const store = useEncounterRunStore();
    expect(store.encounterId).toBe(null);

    (data.party as { value: PartyMember[] }).value = [{ ...stale, current_hp: 30 }];
    fetching.value = false;
    await nextTick();
    expect(store.combatants.find((c) => c.party_member_id === "pm1")?.hp).toBe(30);
  });
});

describe("EncounterRunSurface: a live lobby", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    data.encounter = ref(encounter);
    data.party = ref<PartyMember[]>([]);
    data.companions = ref([]);
    data.partyFetching = ref(false);
    // The saved live state still holds the roll as blank: the DM's push of the
    // ingested roll is debounced, so a refetch can land before it.
    data.liveState = ref({
      encounter_id: "e1",
      is_running: true,
      current_round: 0,
      active_combatant_index: 0,
      events_fired: [],
      combatants_live: [{ instance_id: "p1", name: "Chicory", type: "player", party_member_id: "pm1", initiative: null, hp: 45, max_hp: 45, conditions: [], curses: [], death_saves: { successes: 0, failures: 0 } }],
    });
  });

  it("keeps a player's roll when the party refetches (the stale live state overwrote it, and the DM saw 'Waiting for roll')", async () => {
    mount(EncounterRunSurface, { props: { encounterId: "e1" }, global: { stubs } });
    const store = useEncounterRunStore();
    expect(store.combatants[0]?.instance_id).toBe("p1");

    store.setInitiative("p1", 16);
    (data.party as { value: PartyMember[] }).value = [];
    await nextTick();

    expect(store.combatants[0]?.initiative).toBe(16);
  });
});
