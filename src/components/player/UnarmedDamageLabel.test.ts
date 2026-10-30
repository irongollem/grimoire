import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import UnarmedDamageLabel from "./UnarmedDamageLabel.vue";
import type { PartyMember } from "@/types/party.types";
import type { GrantedFeature } from "@/rules/features/characterFeatures";

const granted = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/composables/features/useCharacterFeatures", () => ({
  useCharacterFeatures: () => ({ granted: { get value() { return granted.value; } } }),
}));

const cleric = { id: "m", str: 10, dex: 12 } as PartyMember;

describe("UnarmedDamageLabel", () => {
  it("shows the number 1 + Strength, not just the damage type (the button said only 'bludgeoning')", () => {
    granted.value = [];
    expect(mount(UnarmedDamageLabel, { props: { member: { ...cleric, str: 14 } } }).text()).toBe("3");
    expect(mount(UnarmedDamageLabel, { props: { member: cleric } }).text()).toBe("1");
  });

  it("shows the Martial Arts die with the better of Strength and Dexterity", () => {
    granted.value = [{ mechanics: { scaling: { label: "Martial Arts Die" } }, scalingValue: "d6" } as unknown as GrantedFeature];
    expect(mount(UnarmedDamageLabel, { props: { member: { ...cleric, dex: 16 } } }).text()).toBe("1d6 + 3");
  });
});
