import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import RunnerPcAttackRow from "./RunnerPcAttackRow.vue";
import RunnerPcAttacks from "./RunnerPcAttacks.vue";
import type { CharacterFeatures } from "@/composables/features/useCharacterFeatures";
import type { PartyMember } from "@/types/party.types";

vi.mock("@/composables/items/usePartyInventory", () => ({ usePartyInventory: () => ({ data: ref([]) }) }));
vi.mock("@/composables/items/useStoredItemRefs", () => ({ useStoredItemRefs: () => ({ items: ref([]) }) }));
vi.mock("@/composables/encounters/useAmmoConsumption", () => ({
  useAmmoConsumption: () => ({
    availableAmmoFor: vi.fn(), ammoRemainingCount: vi.fn(), consumeAmmo: vi.fn(), weaponMaxCharges: vi.fn(),
    weaponSelfChargesRemaining: vi.fn(), consumeWeaponCharge: vi.fn(),
  }),
}));
vi.mock("@/composables/encounters/useThrownWeapon", () => ({ useThrownWeapon: () => ({ throwWeapon: vi.fn() }) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) }));

function mountAttacks(customAttacks: unknown[]) {
  const member = { id: "m1", name: "Tamsin", conditions: [], custom_attacks: customAttacks } as unknown as PartyMember;
  return mount(RunnerPcAttacks, {
    props: { member, features: {} as CharacterFeatures, profBonus: 2, abilityMod: () => 0 },
    global: { stubs: { DamageRiderPicker: true } },
  });
}

describe("RunnerPcAttacks custom attacks", () => {
  // A save-based custom attack stores no bonus; rolling it as +0 would post a to-hit roll that was never meant to exist.
  it("never rolls a custom attack with no to-hit bonus as +0", () => {
    const w = mountAttacks([{ id: "a1", name: "Frost Breath", attack_bonus: null, damage: "6d6", damage_type: "cold" }]);
    w.findAllComponents(RunnerPcAttackRow).at(-1)!.vm.$emit("attack");
    expect(w.emitted("roll-attack")).toBeUndefined();
  });

  it("rolls a custom attack that has a bonus, with that bonus, even when it is +0", () => {
    const w = mountAttacks([{ id: "a2", name: "Rapier", attack_bonus: 0, damage: "1d8", damage_type: "piercing" }]);
    w.findAllComponents(RunnerPcAttackRow).at(-1)!.vm.$emit("attack");
    expect(w.emitted("roll-attack")?.[0]).toEqual([0, "Rapier"]);
  });
});
