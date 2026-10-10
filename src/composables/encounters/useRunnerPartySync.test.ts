import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, nextTick, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import type { RunCombatant } from "@/types/encounter.types";
import type { AppliedCondition } from "@/types/condition.types";

interface Row {
  id: string;
  current_hp: number;
  temp_hp: number;
  current_initiative: number | null;
  conditions: AppliedCondition[];
  concentration: { spellName: string } | null;
  wildshape_state: null;
  death_save_successes: number;
  death_save_failures: number;
}

// Each read the composable starts waits on its own deferred, so a test decides
// when a response returns and what it holds (the value as of when it was read).
const reads: Array<(rows: Row[]) => void> = [];
const writes: Array<() => void> = [];
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
    mutateAsync: () => new Promise<void>((resolve) => { writes.push(resolve); }),
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

async function setup(hp = 20) {
  setActivePinia(createPinia());
  const store = useEncounterRunStore();
  store.combatants = [player(hp)];
  const isLive = ref(true);
  mount(defineComponent({ setup() { useRunnerPartySync(isLive); return () => null; } }));
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
    mount(defineComponent({ setup() { useRunnerPartySync(ref(true)); return () => null; } }));
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
