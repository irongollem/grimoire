import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import UnarmedDamageLabel from "./UnarmedDamageLabel.vue";
import type { PartyMember } from "@/types/party.types";

const cleric = { id: "m", str: 10, dex: 12 } as PartyMember;

describe("UnarmedDamageLabel", () => {
  it("shows the number 1 + Strength, not just the damage type (the button said only 'bludgeoning')", () => {
    expect(mount(UnarmedDamageLabel, { props: { member: { ...cleric, str: 14 }, martialArtsDie: null } }).text()).toBe("3");
    expect(mount(UnarmedDamageLabel, { props: { member: cleric, martialArtsDie: null } }).text()).toBe("1");
  });

  it("shows the Martial Arts die with the better of Strength and Dexterity", () => {
    expect(mount(UnarmedDamageLabel, { props: { member: { ...cleric, dex: 16 }, martialArtsDie: "d6" } }).text()).toBe("1d6 + 3");
  });
});
