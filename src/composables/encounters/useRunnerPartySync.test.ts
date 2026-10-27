import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import type { RunCombatant, WildshapeState } from "@/types/encounter.types";
import type { AppliedCondition } from "@/types/condition.types";

interface Row {
  id: string;
  current_hp: number;
  temp_hp: number;
  current_initiative: number | null;
  conditions: AppliedCondition[];
  concentration: { spellName: string } | null;
  wildshape_state: WildshapeState | null;
  death_save_successes: number;
  death_save_failures: number;
}

// Each read the composable starts waits on its own deferred, so a test decides
// when a response returns and what it holds (the value as of when it was read).
const reads: Array<(rows: Row[]) => void> = [];
const writes: Array<() => void> = [];
const updates: Array<{ id: string; update: Record<string, unknown> }> = [];
const ringListeners: Array<() => void> = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => new Promise((resolve) => { reads.push((rows) => resolve({ data: rows, error: null })); }),
      }),
    }),
  },
}));
vi.mock("@/lib/campaignLiveSync/rings", () => ({
  onCampaignRing: (_tables: string[], listener: (ring: { campaignId: string; table: string }) => void) => {
    const fire = () => listener({ campaignId: "camp-1", table: "party_members" });
    ringListeners.push(fire);
    return () => {};
  },
  onCampaignReconcile: () => () => {},
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));
vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({
    mutateAsync: (args: { id: string; update: Record<string, unknown> }) =>
      new Promise<void>((resolve) => { updates.push(args); writes.push(resolve); }),
  }),
}));

const { useRunnerPartySync } = await import("./useRunnerPartySync");
const { useEncounterRunStore } = await import("@/stores/encounterRun");

function player(hp: number): RunCombatant {
  return {
    instance_id: "p-1",
    type: "player",
    name: "Nessa",
    faction_id: "f",
    initiative: 10,
    hp,
    max_hp: 20,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    party_member_id: "pm-1",
    dex_mod: 0,
  };
}

function row(over: Partial<Row>): Row {
  return {
    id: "pm-1",
    current_hp: 20,
    temp_hp: 0,
    current_initiative: null,
    conditions: [],
    concentration: null,
    wildshape_state: null,
    death_save_successes: 0,
    death_save_failures: 0,
    ...over,
  };
}

const ring = () => ringListeners.forEach((fire) => fire());

// A runner left mounted would answer the next test's rings and `isLive` toggles.
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

let mounted: ReturnType<typeof mount> | null = null;
let sync: ReturnType<typeof useRunnerPartySync> | null = null;
const isLive = ref(true);

async function setup(hp = 20) {
  setActivePinia(createPinia());
  const store = useEncounterRunStore();
  store.combatants = [player(hp)];
  isLive.value = true;
  mounted = mount(defineComponent({ setup() { sync = useRunnerPartySync(isLive); return () => null; } }));
  await flushPromises();
  // The mount-time read: answer it with the current state so each test starts quiet.
  reads.shift()!([row({ current_hp: hp })]);
  await flushPromises();
  return store;
}

describe("useRunnerPartySync re-reads", () => {
  beforeEach(() => {
    reads.length = 0;
    writes.length = 0;
    updates.length = 0;
    ringListeners.length = 0;
    vi.useFakeTimers();
  });

  it("does not apply an HP read that predates a write still in flight, then converges on the committed value", async () => {
    const store = await setup(20);

    store.adjustHp("p-1", -10); // 10
    await vi.advanceTimersByTimeAsync(400); // write A=10 in flight
    ring(); // the ring of that write starts a re-read
    await flushPromises();
    expect(reads).toHaveLength(1);

    store.adjustHp("p-1", -5); // 5
    await vi.advanceTimersByTimeAsync(400); // queue emptied, write B=5 in flight
    reads.shift()!([row({ current_hp: 10 })]); // the read that predates B returns
    await flushPromises();
    expect(store.combatants[0]!.hp).toBe(5);

    // Both writes commit; their rings arrive and the next read sees the DB's 5.
    writes.splice(0).forEach((done) => done());
    await flushPromises();
    ring();
    await flushPromises();
    reads.shift()!([row({ current_hp: 5 })]);
    await flushPromises();
    expect(store.combatants[0]!.hp).toBe(5);
  });

  it("does not remove a condition added while a persist is in flight", async () => {
    const store = await setup(20);

    ring(); // a player's initiative roll rings; its read starts
    await flushPromises();
    store.applyCondition("p-1", { name: "Prone" }); // persist starts, not yet committed
    reads.shift()!([row({})]); // the read returns A without Prone
    await flushPromises();
    expect(store.combatants[0]!.conditions).toEqual([{ name: "Prone" }]);

    // The write commits and the read that follows applies the row as it is now.
    writes.splice(0).forEach((done) => done());
    await flushPromises();
    reads.shift()!([row({ conditions: [{ name: "Prone" }] })]);
    await flushPromises();
    expect(store.combatants[0]!.conditions).toEqual([{ name: "Prone" }]);
  });

  it("re-reads a member dropped because its write settled mid-read, even if no ring is owed", async () => {
    const store = await setup(20);

    ring();
    await flushPromises();
    store.applyCondition("p-1", { name: "Prone" });
    writes.splice(0).forEach((done) => done()); // write settles while the read is out
    await flushPromises();
    reads.shift()!([row({})]); // stale: read before the write settled
    await flushPromises();
    expect(store.combatants[0]!.conditions).toEqual([{ name: "Prone" }]);
    expect(reads).toHaveLength(1); // the retry was issued without a ring
    reads.shift()!([row({ conditions: [{ name: "Prone" }] })]);
    await flushPromises();
    expect(store.combatants[0]!.conditions).toEqual([{ name: "Prone" }]);
  });

  it("still ingests what changed outside the runner when this client is not writing", async () => {
    const store = await setup(20);
    ring();
    await flushPromises();
    reads.shift()!([row({ temp_hp: 4, conditions: [{ name: "Poisoned" }], current_hp: 12 })]);
    await nextTick();
    await flushPromises();
    expect(store.combatants[0]).toMatchObject({ hp: 12, temp_hp: 4, conditions: [{ name: "Poisoned" }] });
  });
});

describe("useRunnerPartySync concentration (#1018)", () => {
  beforeEach(() => {
    reads.length = 0;
    writes.length = 0;
    ringListeners.length = 0;
    vi.useFakeTimers();
  });

  const hold = { name: "Paralyzed", source: { id: "p-1", spell: "Hold Person", concentration: true } };

  async function setupConcentrating() {
    setActivePinia(createPinia());
    const store = useEncounterRunStore();
    store.combatants = [player(20), { ...player(20), instance_id: "g-1", type: "monster", party_member_id: undefined, name: "Goblin", conditions: [hold] }];
    mounted = mount(defineComponent({ setup() { useRunnerPartySync(ref(true)); return () => null; } }));
    await flushPromises();
    reads.shift()!([row({ concentration: { spellName: "Hold Person" } })]);
    await flushPromises();
    return store;
  }

  it("ends what a PC's concentration held when the sheet stops concentrating", async () => {
    const store = await setupConcentrating();
    expect(store.combatants[1]!.conditions).toHaveLength(1); // the first read only records
    ring();
    await flushPromises();
    reads.shift()!([row({ concentration: null })]);
    await flushPromises();
    expect(store.combatants[1]!.conditions).toEqual([]);
  });

  it("ends it when the PC swaps to another spell, and leaves it alone while unchanged", async () => {
    const store = await setupConcentrating();
    ring();
    await flushPromises();
    reads.shift()!([row({ concentration: { spellName: "Hold Person" } })]);
    await flushPromises();
    expect(store.combatants[1]!.conditions).toHaveLength(1);
    ring();
    await flushPromises();
    reads.shift()!([row({ concentration: { spellName: "Bless" } })]);
    await flushPromises();
    expect(store.combatants[1]!.conditions).toEqual([]);
  });
});

describe("useRunnerPartySync guards", () => {
  // The store also persists every player change at once; the debounced HP flush is the update that is only `current_hp`.
  const debounced = () => updates.filter((u) => Object.keys(u.update).join() === "current_hp");

  beforeEach(() => {
    reads.length = 0;
    writes.length = 0;
    updates.length = 0;
    ringListeners.length = 0;
    vi.useFakeTimers();
  });

  it("keeps an HP write that is in flight when a read that began after it started comes back with the old value", async () => {
    const store = await setup(20);
    store.adjustHp("p-1", -10);
    await vi.advanceTimersByTimeAsync(400); // write HP=10 started, not committed
    ring();
    await flushPromises(); // read starts after the write did
    reads.shift()!([row({ current_hp: 20 })]); // the DB has not committed it yet
    await flushPromises();
    expect(store.combatants[0]!.hp).toBe(10);
  });

  it("keeps an HP change still waiting for its debounced write when a read returns the old value", async () => {
    const store = await setup(20);
    store.adjustHp("p-1", -10);
    writes.splice(0).forEach((done) => done()); // the immediate persist has settled; the 400ms flush has not run
    await flushPromises();
    ring();
    await flushPromises();
    reads.shift()!([row({ current_hp: 20 })]);
    await flushPromises();
    expect(store.combatants[0]!.hp).toBe(10);
  });

  it("writes an HP change once, after the debounce, as the member's current_hp", async () => {
    const store = await setup(20);
    store.adjustHp("p-1", -3);
    store.adjustHp("p-1", -2);
    await vi.advanceTimersByTimeAsync(399);
    expect(debounced()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(debounced()).toEqual([{ id: "pm-1", update: { current_hp: 15 } }]);
  });

  it("writes no HP when the roster is replaced with the same hit points", async () => {
    const store = await setup(20);
    store.combatants = [player(20)];
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(debounced()).toEqual([]);
  });

  it("writes no HP while the fight is not live", async () => {
    const store = await setup(20);
    isLive.value = false;
    store.adjustHp("p-1", -10);
    await vi.advanceTimersByTimeAsync(500);
    expect(debounced()).toEqual([]);
  });

  it("drops a read that returns after the runner closed", async () => {
    const store = await setup(20);
    ring();
    await flushPromises();
    mounted!.unmount();
    reads.shift()!([row({ current_hp: 3, temp_hp: 5 })]);
    await flushPromises();
    expect(store.combatants[0]!.hp).toBe(20);
    expect(store.combatants[0]!.temp_hp).toBeUndefined();
  });

  it("stops persisting the store's player changes once the runner closed", async () => {
    const store = await setup(20);
    mounted!.unmount();
    store.applyCondition("p-1", { name: "Prone" });
    await flushPromises();
    expect(updates).toEqual([]);
  });

  it("reads once the fight turns live after the runner opened", async () => {
    setActivePinia(createPinia());
    useEncounterRunStore().combatants = [player(20)];
    isLive.value = false;
    mounted = mount(defineComponent({ setup() { useRunnerPartySync(isLive); return () => null; } }));
    await flushPromises();
    reads.shift()!([row({})]);
    await flushPromises();
    expect(reads).toHaveLength(0);
    isLive.value = true;
    await flushPromises();
    expect(reads).toHaveLength(1);
  });

  it("adopts a form the player took on their own sheet, and drops it when the row clears", async () => {
    const store = await setup(20);
    const wolf: WildshapeState = { monster_id: "wolf", beast_name: "Wolf", beast_image_url: null, beast_hp: 11, beast_max_hp: 11, beast_ac: "13" };
    ring();
    await flushPromises();
    reads.shift()!([row({ wildshape_state: wolf })]);
    await flushPromises();
    expect(store.combatants[0]!.wildshape).toEqual(wolf);
    ring();
    await flushPromises();
    reads.shift()!([row({ wildshape_state: null })]);
    await flushPromises();
    expect(store.combatants[0]!.wildshape).toBeUndefined();
  });

  it("adopts death saves rolled on the player's own sheet", async () => {
    const store = await setup(20);
    ring();
    await flushPromises();
    reads.shift()!([row({ death_save_successes: 2, death_save_failures: 1 })]);
    await flushPromises();
    expect(store.combatants[0]!.death_saves).toEqual({ successes: 2, failures: 1 });
    ring();
    await flushPromises();
    reads.shift()!([row({ death_save_successes: 2, death_save_failures: 2 })]);
    await flushPromises();
    expect(store.combatants[0]!.death_saves).toEqual({ successes: 2, failures: 2 });
    ring();
    await flushPromises();
    reads.shift()!([row({ death_save_successes: 3, death_save_failures: 2 })]);
    await flushPromises();
    expect(store.combatants[0]!.death_saves).toEqual({ successes: 3, failures: 2 });
  });

  it("takes a player-rolled initiative only while the fight is live (#504)", async () => {
    const store = await setup(20);
    ring();
    await flushPromises();
    reads.shift()!([row({ current_initiative: 18 })]);
    await flushPromises();
    expect(store.combatants[0]!.initiative).toBe(18);

    isLive.value = false;
    ring();
    await flushPromises();
    reads.shift()!([row({ current_initiative: 4 })]);
    await flushPromises();
    expect(store.combatants[0]!.initiative).toBe(18);
  });

  it("clears every PC's initiative in the store and on their rows as the lobby opens", async () => {
    const store = await setup(20);
    const cleared = sync!.clearPartyInitiatives();
    await flushPromises();
    writes.splice(0).forEach((done) => done());
    await cleared;
    expect(store.combatants[0]!.initiative).toBeNull();
    expect(updates).toEqual([{ id: "pm-1", update: { current_initiative: null } }]);
  });
});
