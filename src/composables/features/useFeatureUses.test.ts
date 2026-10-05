import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { ResourcePool } from "@/rules/features/characterFeatures";

// A plain function rather than vi.fn: vitest tracks the promise a spy returns and
// reports a rejected one as unhandled even when the code under test catches it.
const mocks = vi.hoisted(() => ({
  fail: false,
  updateMember: (): Promise<void> => (mocks.fail ? Promise.reject(new Error("offline")) : Promise.resolve()),
}));

vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({
    mutateAsync: mocks.updateMember,
    isPending: { value: false },
    error: { value: null },
  }),
}));

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
