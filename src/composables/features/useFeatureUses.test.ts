import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { ResourcePool } from "@/rules/features/characterFeatures";

// A plain function rather than vi.fn: vitest tracks the promise a spy returns and
// reports a rejected one as unhandled even when the code under test catches it.
const mocks = vi.hoisted(() => ({
  fail: false,
  updateMember: (_arg?: unknown): Promise<void> => (mocks.fail ? Promise.reject(new Error("offline")) : Promise.resolve()),
}));

vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({
    mutateAsync: mocks.updateMember,
    isPending: { value: false },
    error: { value: null },
  }),
}));

const wild = vi.hoisted(() => ({ rules: { value: { maxUses: 2, shortRestRegain: 1 } as { maxUses: number | null; shortRestRegain: "all" | 1 } } }));
vi.mock("@/composables/player/useWildshapeDruid", () => ({ useWildshapeDruid: () => ({ rules: wild.rules }) }));

import { useFeatureUses } from "./useFeatureUses";

const rage: ResourcePool = {
  key: "rage", label: "Rage", max: 3, recharge: "long", shortRestRegain: null, pool: false, sources: ["Rage"],
};

function setup() {
  const member = ref({
    id: "pm-1",
    class_choices: {},
    class_resources: { rage: { current: 3, max: 3, rest: "long" } },
  } as unknown as PartyMember);
  const uses = useFeatureUses(member, ref([rage]));
  return uses;
}

describe("useFeatureUses write failure", () => {
  beforeEach(() => { mocks.fail = false; });

  it("keeps a spend while the write succeeds", async () => {
    mocks.fail = false;
    const uses = setup();
    await uses.spend({ key: "rage", amount: 1 });
    expect(uses.remaining("rage")).toBe(2);
  });

  it("restores the pool and rethrows when the write fails", async () => {
    mocks.fail = true;
    const uses = setup();
    await expect(uses.spend({ key: "rage", amount: 1 })).rejects.toThrow("offline");
    expect(uses.remaining("rage")).toBe(3);
  });

  it("restores the toggle and the pool together when the combined write fails", async () => {
    mocks.fail = true;
    const uses = setup();
    await expect(uses.setToggle("rage", true, { key: "rage", amount: 1 })).rejects.toThrow("offline");
    expect(uses.isOn("rage")).toBe(false);
    expect(uses.remaining("rage")).toBe(3);
  });
});

describe("useFeatureUses Wild Shape", () => {
  const calls: unknown[] = [];
  function setupWild(used: number) {
    calls.length = 0;
    mocks.updateMember = (arg?: unknown) => {
      if (mocks.fail) return Promise.reject(new Error("offline"));
      calls.push(arg);
      return Promise.resolve();
    };
    const member = ref({
      id: "pm-1", class_choices: {}, class_resources: {}, wildshapes_used: used,
    } as unknown as PartyMember);
    return useFeatureUses(member, ref([]));
  }
  const cost = { key: "wild_shape", amount: 1 };

  beforeEach(() => {
    mocks.fail = false;
    wild.rules.value = { maxUses: 2, shortRestRegain: 1 };
  });

  it("is a virtual pool of the maximum less the spent count", () => {
    const uses = setupWild(1);
    expect(uses.remaining("wild_shape")).toBe(1);
    expect(uses.pools.value.map(p => p.key)).toEqual(["wild_shape"]);
  });

  it("spends by raising wildshapes_used, the Wild Shape tab's own write", async () => {
    const uses = setupWild(0);
    await uses.spend(cost);
    expect(calls).toEqual([{ id: "pm-1", update: { wildshapes_used: 1 } }]);
    expect(uses.remaining("wild_shape")).toBe(1);
    await uses.spend(cost);
    expect(calls[1]).toEqual({ id: "pm-1", update: { wildshapes_used: 2 } });
  });

  it("refuses a spend with none left and writes nothing", async () => {
    const uses = setupWild(2);
    expect(uses.payable(cost)).toBe(false);
    await expect(uses.spend(cost)).rejects.toThrow("Wild Shape");
    expect(calls).toEqual([]);
  });

  it("is unusable, never free, for a character with no Wild Shape", async () => {
    wild.rules.value = { maxUses: 0, shortRestRegain: 1 };
    const uses = setupWild(0);
    expect(uses.remaining("wild_shape")).toBeNull();
    expect(uses.payable(cost)).toBe(false);
    await expect(uses.spend(cost)).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("never runs out when unlimited and changes nothing", async () => {
    wild.rules.value = { maxUses: null, shortRestRegain: "all" };
    const uses = setupWild(0);
    expect(uses.payable(cost)).toBe(true);
    await uses.spend(cost);
    expect(calls).toEqual([{ id: "pm-1", update: { wildshapes_used: 0 } }]);
  });

  it("puts the spent count back when the write fails", async () => {
    mocks.fail = true;
    const uses = setupWild(0);
    await expect(uses.spend(cost)).rejects.toThrow("offline");
    expect(uses.remaining("wild_shape")).toBe(2);
  });

  it("pays a toggle's Wild Shape cost in the same write that switches it on", async () => {
    const uses = setupWild(0);
    await uses.setToggle("lunar", true, cost);
    expect(calls).toEqual([{ id: "pm-1", update: { class_choices: { lunar_active: true }, wildshapes_used: 1 } }]);
  });
});
