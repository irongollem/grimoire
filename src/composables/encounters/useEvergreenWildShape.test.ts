import { describe, it, expect, vi, beforeEach } from "vitest";
import { effectScope, nextTick, reactive, ref } from "vue";

// A level 20 2024 druid with every use spent: the one character Evergreen Wild
// Shape gives a use back to when their initiative is rolled.
const mocks = vi.hoisted(() => ({
  store: null as unknown as { combatants: { instance_id: string; type: string; party_member_id?: string; initiative: number | null }[] },
  updatePartyMember: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => mocks.store }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([{ id: "pm-oak", name: "Oak", class: "Druid", subclass: null, level: 20, wis: 18, wildshapes_used: 4 }]),
  }),
  useUpdatePartyMember: () => ({ mutateAsync: mocks.updatePartyMember }),
}));
vi.mock("@/composables/party/useCharacterClasses", () => ({
  useAllCampaignCharacterClasses: () => ({
    data: ref([{ party_member_id: "pm-oak", class_name: "Druid", subclass_name: null, levels: 20 }]),
  }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ info: mocks.toastInfo, error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

import { useEvergreenWildShape } from "./useEvergreenWildShape";

function druid(initiative: number | null) {
  return { instance_id: "p-pm-oak", type: "player", party_member_id: "pm-oak", initiative };
}

function mount() {
  const scope = effectScope();
  scope.run(() => useEvergreenWildShape());
  return scope;
}

describe("useEvergreenWildShape", () => {
  beforeEach(() => {
    mocks.updatePartyMember.mockReset().mockResolvedValue(undefined);
    mocks.toastInfo.mockReset();
  });

  it("gives a spent druid one use back when their initiative is rolled", async () => {
    mocks.store = reactive({ combatants: [druid(null)] });
    mount();

    mocks.store.combatants[0].initiative = 17;
    await nextTick();

    // Four uses at level 20 (2024), all spent: back to three spent.
    expect(mocks.updatePartyMember).toHaveBeenCalledWith({ id: "pm-oak", update: { wildshapes_used: 3 } });
  });

  it("fires once per fight, not again on a re-roll", async () => {
    mocks.store = reactive({ combatants: [druid(null)] });
    mount();

    mocks.store.combatants[0].initiative = 17;
    await nextTick();
    mocks.store.combatants[0].initiative = null;
    await nextTick();
    mocks.store.combatants[0].initiative = 9;
    await nextTick();

    expect(mocks.updatePartyMember).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a fight resumed with initiatives already rolled", async () => {
    mocks.store = reactive({ combatants: [druid(12)] });
    mount();

    mocks.store.combatants = [druid(12)];
    await nextTick();

    expect(mocks.updatePartyMember).not.toHaveBeenCalled();
  });

  it("ignores a combatant that is not a party member", async () => {
    mocks.store = reactive({
      combatants: [{ instance_id: "m-wolf-1", type: "monster", initiative: null }],
    });
    mount();

    mocks.store.combatants[0].initiative = 14;
    await nextTick();

    expect(mocks.updatePartyMember).not.toHaveBeenCalled();
  });
});
