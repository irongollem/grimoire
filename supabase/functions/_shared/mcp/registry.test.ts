import { describe, expect, it } from "vitest";
import {
  CREATABLE_TYPES,
  describeCreatableFields,
  ENTITY_REGISTRY,
  IMAGE_WHICH_VALUES,
  IMAGEABLE_TYPES,
} from "./registry.ts";
import { ITEM_RARITIES, ITEM_TYPES, WEAPON_MASTERY_PROPERTIES } from "@/types/item.types";
import { MONSTER_SIZES, MONSTER_TYPES } from "@/types/monster.types";
import { AOE_SHAPES, SAVE_ATTRIBUTES, SPELL_SCHOOLS } from "@/types/spell.types";
import { TRAP_RESET_TYPES, TRAP_TRIGGERS, TRAP_TYPES } from "@/types/trap.types";
import { RULE_CATEGORIES } from "@/types/rule.types";

// Guards the search bug where quest's `status` (typed `quest_status_enum`) was
// listed in `searchFields`. The generic search builder OR-joins every
// searchField into an `.ilike` (`~~*`) predicate, but Postgres has no ILIKE for
// enum operands — so the quest branch threw
// `operator does not exist: quest_status_enum ~~* unknown` and quests dropped
// out of every result set.
//
// `searchFields` MUST contain only TEXT columns. The two enum columns below are
// the complete set in the schema as of this writing — regenerate with:
//
//   rg -oN '"([a-z_]+)" "public"\."[a-z_]+_enum"' \
//     supabase/migrations/20260426000099_initial_schema_squashed.sql
//
// If a migration adds a new `*_enum` column, add its `table.column` here so the
// invariant keeps protecting against the same mistake.
const ENUM_COLUMNS_BY_TABLE: Record<string, readonly string[]> = {
  quests: ["status"],
  locations: ["location_type"],
};

describe("ENTITY_REGISTRY search invariants", () => {
  it("never includes an enum-typed column in any entity's searchFields", () => {
    const offenders: string[] = [];
    for (const def of Object.values(ENTITY_REGISTRY)) {
      const enumCols = ENUM_COLUMNS_BY_TABLE[def.table] ?? [];
      for (const field of def.searchFields) {
        if (enumCols.includes(field)) {
          offenders.push(`${def.type}: ${def.table}.${field}`);
        }
      }
    }
    expect(
      offenders,
      `enum columns cannot be ILIKE-matched; remove from searchFields (use extraListColumns / an = filter):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every entity at least one searchField so search never builds an empty .or()", () => {
    for (const def of Object.values(ENTITY_REGISTRY)) {
      expect(def.searchFields.length, `${def.type} has no searchFields`).toBeGreaterThan(0);
    }
  });
});

describe("ENTITY_REGISTRY image invariants", () => {
  it("declares non-empty, `*_url`-shaped image columns wherever imageFields is set", () => {
    for (const def of Object.values(ENTITY_REGISTRY)) {
      if (!def.imageFields) continue;
      const entries = Object.entries(def.imageFields);
      expect(entries.length, `${def.type} has an empty imageFields map`).toBeGreaterThan(0);
      for (const [which, column] of entries) {
        expect(which, `${def.type} has a blank image selector`).toMatch(/^[a-z_]+$/);
        expect(column, `${def.type}.${which} column should be a *_url column`).toMatch(/_url$/);
      }
    }
  });

  it("derives IMAGEABLE_TYPES and IMAGE_WHICH_VALUES from the registry", () => {
    expect(IMAGEABLE_TYPES).toContain("npc");
    expect(IMAGEABLE_TYPES).not.toContain("quest"); // quests carry no art
    // Union is de-duplicated (portrait/image/etc. appear on multiple types).
    expect(IMAGE_WHICH_VALUES.length).toBe(new Set(IMAGE_WHICH_VALUES).size);
    expect(IMAGE_WHICH_VALUES).toEqual(expect.arrayContaining(["portrait", "image", "map", "emblem"]));
  });

  it("never lets an image column become writable", () => {
    // `create`/`update` write whatever the registry declares, so a `*_url`
    // field slipping into a create block would let a caller point an entity at
    // any URL — bypassing the signed-upload path and the srd/ vs {userId}/
    // storage convention that keeps canonical art separate from private art.
    for (const t of CREATABLE_TYPES) {
      for (const name of Object.keys(ENTITY_REGISTRY[t].create!.fields)) {
        expect(name, `${t}.${name} is an image column and must not be writable`).not.toMatch(/_url$/);
      }
    }
  });
});

// The registry cannot import from src/ — a Deno-hosted function has no `@/*`
// resolution — so these vocabularies are copied into registry.ts. That copy is
// held honest here rather than by a "keep in sync" comment: the app's `as const`
// arrays are the source of truth, and any drift fails this suite. Order matters
// too, since it decides the order the values appear in the tool description.
describe("ENTITY_REGISTRY enum vocabularies match the app's", () => {
  const enumValues = (type: string, field: string) =>
    ENTITY_REGISTRY[type].create!.fields[field].values;

  it.each([
    ["item", "item_type", ITEM_TYPES],
    ["item", "rarity", ITEM_RARITIES],
    ["item", "mastery", WEAPON_MASTERY_PROPERTIES],
    ["monster", "monster_type", MONSTER_TYPES],
    ["monster", "size", MONSTER_SIZES],
    ["spell", "school", SPELL_SCHOOLS],
    ["spell", "save_attribute", SAVE_ATTRIBUTES],
    ["spell", "aoe_shape", AOE_SHAPES],
    ["trap", "trap_type", TRAP_TYPES],
    ["trap", "trigger_type", TRAP_TRIGGERS],
    ["trap", "reset_type", TRAP_RESET_TYPES],
    ["trap", "save_type", SAVE_ATTRIBUTES],
    ["rule", "category", RULE_CATEGORIES],
  ])("%s.%s", (type, field, canonical) => {
    expect(enumValues(type, field)).toEqual([...canonical]);
  });
});

describe("describeCreatableFields", () => {
  const text = describeCreatableFields();

  it("gives every creatable type a signature line", () => {
    const lines = text.split("\n");
    for (const t of CREATABLE_TYPES) {
      expect(
        lines.some((l) => l.startsWith(`${t}: `)),
        `${t} has no signature line in the create/update tool description`,
      ).toBe(true);
    }
  });

  it("marks required fields, enums, arrays, bounds and JSON shapes", () => {
    expect(text).toContain("name*");
    expect(text).toContain("rarity(mundane|common|uncommon|rare|very_rare|legendary|artifact)");
    expect(text).toContain("tags[]");
    expect(text).toContain("spell_ids[uuid]");
    expect(text).toContain("level#0-9"); // spell level, bounded by the CHECK constraint
    expect(text).toContain("concentration?");
    expect(text).toContain("damage_rolls[{dice,type}]");
  });

  it("renders the per-field notes, which were previously written and never shown", () => {
    expect(text).toContain("  str — Ability score, not modifier. Defaults to 10.");
  });
});
