import { describe, expect, it } from "vitest";
import { ENTITY_REGISTRY } from "./registry.ts";

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
