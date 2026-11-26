import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABUNDANCES, ACTIVITIES, KINGDOMS, LINK_KINDS, LIVES_AS } from "./ecologyTypes";

const MIGRATION = "supabase/migrations/20261126162306_habitat_ecology.sql";
const sql = readFileSync(MIGRATION, "utf8");

// A value added in SQL and not in the TS list (or the reverse) writes rows a picker cannot show, or offers one the
// database refuses.
function checkList(column: string): string[] {
  const m = sql.match(new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`));
  expect(m, `no check on ${column}`).not.toBeNull();
  return [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe("ecology enums mirror the habitat ecology migration", () => {
  it.each([
    ["kingdom", KINGDOMS],
    ["lives_as", LIVES_AS],
    ["activity", ACTIVITIES],
    ["abundance", ABUNDANCES],
  ] as const)("%s", (column, list) => {
    expect([...list]).toEqual(checkList(column));
  });

  // The link kinds sit in the table's own check, which also names `kind in` for the target rule; take the first.
  it("link kind", () => {
    const m = sql.match(/check \(kind in \(([^)]*)\)\)/);
    const values = [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect([...LINK_KINDS]).toEqual(values);
  });
});
