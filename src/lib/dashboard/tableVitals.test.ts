import { describe, it, expect } from "vitest";
import type { PartyMember } from "@/types/party.types";
import { buildTableVitalsRows } from "./tableVitals";

/** A minimally valid `PartyMember` — every required column filled with an
 *  inert default so each test only has to override the jsonb fields it's
 *  actually exercising. */
function member(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    id: "pm-1",
    user_id: "user-1",
    owner_user_id: null,
    is_dm_managed: false,
    campaign_id: "campaign-1",
    name: "Aria",
    player_name: null,
    class: "Wizard",
    subclass: null,
    level: 5,
    subrace: null,
    species_id: null,
    disguise_species_id: null,
    disguise_race: null,
    disguise_subrace: null,
    background_id: null,
    max_hp: 30,
    current_hp: 30,
    temp_hp: 0,
    ac: 14,
    speed: 30,
    initiative_bonus: 0,
    current_initiative: null,
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    proficiency_bonus: 3,
    skill_proficiencies: {},
    saving_throw_proficiencies: [],
    conditions: [],
    curses: [],
    inspiration: false,
    death_save_successes: 0,
    death_save_failures: 0,
    portrait_url: null,
    notes: null,
    sort_order: 0,
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0,
    tool_proficiencies: [],
    languages: [],
    weapon_masteries: [],
    spell_slots: [],
    current_location_id: null,
    carry_capacity_override: null,
    class_resources: {},
    class_choices: {},
    active_infusions: [],
    custom_attacks: [],
    level_choices: {},
    concentration: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildTableVitalsRows", () => {
  it("drops a member with no slots, no resources and no concentration", () => {
    expect(buildTableVitalsRows([member()])).toEqual([]);
  });

  it("shows a member whose slots are all spent, remaining at zero rather than hidden", () => {
    const rows = buildTableVitalsRows([
      member({ spell_slots: [{ level: 1, max: 2, used: 2 }] }),
    ]);
    expect(rows).toEqual([
      {
        id: "pm-1",
        name: "Aria",
        slots: [{ level: 1, pool: "spellcasting", remaining: 0, max: 2 }],
        resources: [],
        concentration: null,
      },
    ]);
  });

  it("shows a member with resources but no spell slots", () => {
    const rows = buildTableVitalsRows([
      member({
        class_resources: { bardic_inspiration: { current: 2, max: 3, rest: "short" } },
      }),
    ]);
    expect(rows).toEqual([
      {
        id: "pm-1",
        name: "Aria",
        slots: [],
        resources: [{ key: "bardic_inspiration", label: "Bardic Inspiration", current: 2, max: 3, rest: "short" }],
        concentration: null,
      },
    ]);
  });

  it("shows a member who is concentrating, with the round it started", () => {
    const rows = buildTableVitalsRows([
      member({
        concentration: { spellId: "bless", spellName: "Bless", castAtLevel: 1, startedRound: 4, appliedEffectIds: [] },
      }),
    ]);
    expect(rows).toEqual([
      {
        id: "pm-1",
        name: "Aria",
        slots: [],
        resources: [],
        concentration: { spellName: "Bless", startedRound: 4 },
      },
    ]);
  });

  it("keeps concentration with no known round rather than inventing one", () => {
    const rows = buildTableVitalsRows([
      member({
        concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: null, appliedEffectIds: [] },
      }),
    ]);
    expect(rows[0]!.concentration).toEqual({ spellName: "Bless", startedRound: null });
  });

  it("orders slot groups by level, then pool — default pool before a special one at the same level", () => {
    const rows = buildTableVitalsRows([
      member({
        spell_slots: [
          { level: 1, max: 3, used: 0, pool: "pact" },
          { level: 2, max: 1, used: 0 },
          { level: 1, max: 4, used: 1 },
        ],
      }),
    ]);
    expect(rows[0]!.slots.map((s) => `${s.pool}:${s.level}`)).toEqual([
      "spellcasting:1",
      "pact:1",
      "spellcasting:2",
    ]);
  });

  it("drops zero-max slots as legacy noise, not as something to show", () => {
    const rows = buildTableVitalsRows([
      member({ spell_slots: [{ level: 1, max: 0, used: 0 }] }),
    ]);
    expect(rows).toEqual([]);
  });

  it("filters malformed slot entries instead of throwing", () => {
    const malformed = [
      { level: 1, max: 4, used: 1 }, // valid — proves the good entry survives
      { level: "one", max: 4, used: 0 }, // non-numeric level
      { level: 2, max: 4 }, // missing used
      null,
      "not a slot",
    ];
    const rows = buildTableVitalsRows([
      member({ spell_slots: malformed as unknown as PartyMember["spell_slots"] }),
    ]);
    expect(rows[0]!.slots).toEqual([{ level: 1, pool: "spellcasting", remaining: 3, max: 4 }]);
  });

  it("treats a non-array spell_slots blob as no slots, not an error", () => {
    const rows = buildTableVitalsRows([
      member({
        spell_slots: { level: 1, max: 4, used: 0 } as unknown as PartyMember["spell_slots"],
        class_resources: { ki: { current: 1, max: 4, rest: "short" } },
      }),
    ]);
    expect(rows[0]!.slots).toEqual([]);
  });

  it("treats an array class_resources blob (wrong shape) as no resources", () => {
    const rows = buildTableVitalsRows([
      member({
        class_resources: ["ki"] as unknown as PartyMember["class_resources"],
        spell_slots: [{ level: 1, max: 2, used: 0 }],
      }),
    ]);
    expect(rows[0]!.resources).toEqual([]);
  });

  it("filters a class_resources entry with a malformed value", () => {
    const rows = buildTableVitalsRows([
      member({
        class_resources: {
          ki: { current: 2, max: 4, rest: "short" },
          rage: { current: "two", max: 3, rest: "long" } as unknown as { current: number; max: number; rest: "short" | "long" },
          uses: { current: 1, max: 2, rest: "weekly" as unknown as "short" | "long" },
        },
      }),
    ]);
    expect(rows[0]!.resources).toEqual([{ key: "ki", label: "Ki", current: 2, max: 4, rest: "short" }]);
  });

  it("treats an empty-object concentration blob as not concentrating", () => {
    const rows = buildTableVitalsRows([
      member({
        concentration: {} as unknown as PartyMember["concentration"],
        spell_slots: [{ level: 1, max: 2, used: 0 }],
      }),
    ]);
    expect(rows[0]!.concentration).toBeNull();
  });

  it("only rows members with something to show, preserving party order", () => {
    const nothing = member({ id: "pm-empty", name: "Bystander" });
    const caster = member({ id: "pm-caster", name: "Caster", spell_slots: [{ level: 1, max: 2, used: 1 }] });
    const monk = member({
      id: "pm-monk",
      name: "Monk",
      class_resources: { ki: { current: 3, max: 5, rest: "short" } },
    });
    const rows = buildTableVitalsRows([nothing, caster, monk]);
    expect(rows.map((r) => r.id)).toEqual(["pm-caster", "pm-monk"]);
  });
});
