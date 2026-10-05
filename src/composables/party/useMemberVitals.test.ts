import { computed, effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { PartyMember } from "@/types/party.types";

const beast = ref<{ stat_block: { str: number; dex: number; con: number; speed: string } } | null>(null);
vi.mock("@/composables/monsters/usePlayerMonstersByIds", () => ({
  usePlayerMonstersByIds: () => ({
    data: computed(() => new Map(beast.value ? [["wolf", beast.value]] : [])),
  }),
}));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({ acFor: () => 15 }) }));

import { useMemberVitals } from "./useMemberVitals";

function character(over: Partial<PartyMember> = {}): PartyMember {
  return {
    id: "pm",
    dex: 10,
    str: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    initiative_bonus: 1,
    speed: 30,
    current_hp: 20,
    max_hp: 40,
    temp_hp: 5,
    wildshape_state: null,
    skill_proficiencies: {},
    proficiency_bonus: 2,
    ...over,
  } as unknown as PartyMember;
}

function vitals(m: PartyMember) {
  return effectScope().run(() => useMemberVitals(() => m))!;
}

describe("useMemberVitals", () => {
  it("reads the character's own numbers when not Wild Shaped", () => {
    beast.value = null;
    const v = vitals(character({ dex: 14 }));
    expect(v.armorClass.value).toBe(15);
    expect(v.initiative.value).toBe(3);
    expect(v.speed.value).toBe(30);
    expect(v.passivePerception.value).toBe(10);
    expect(v.hp.value).toMatchObject({ current: 20, max: 40, temp: 5, pct: 50, textClass: "text-ink-caution" });
  });

  it("takes the form's AC, walking speed, hit points and DEX while Wild Shaped", () => {
    beast.value = { stat_block: { str: 12, dex: 16, con: 11, speed: "40 ft." } };
    const v = vitals(
      character({
        dex: 8,
        wildshape_state: { monster_id: "wolf", beast_name: "Wolf", beast_ac: "13", beast_hp: 9, beast_max_hp: 11, beast_image_url: null },
      } as Partial<PartyMember>),
    );
    expect(v.armorClass.value).toBe("13");
    expect(v.speed.value).toBe(40);
    expect(v.initiative.value).toBe(4);
    expect(v.hp.value).toMatchObject({ current: 9, max: 11 });
  });

  it("keeps the character's hit points in a 2024 form with no beast hp", () => {
    beast.value = { stat_block: { str: 12, dex: 12, con: 12, speed: "30 ft." } };
    const v = vitals(
      character({
        wildshape_state: { monster_id: "wolf", beast_name: "Wolf", beast_ac: "13", beast_hp: null, beast_max_hp: null, beast_image_url: null },
      } as Partial<PartyMember>),
    );
    expect(v.hp.value).toMatchObject({ current: 20, max: 40 });
  });
});
