import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPANION_TYPES } from "@/types/companion.types";

const SQUASHED = "supabase/migrations/20260426000099_initial_schema_squashed.sql";
const PET = "supabase/migrations/20261029073935_companion_type_pet.sql";

// There are no generated DB types, so the union is the only client copy of the
// enum. A value added in SQL and not here (or the reverse) would write rows the
// picker cannot show, or offer a type the database refuses.
describe("companion_type enum mirror", () => {
  it("COMPANION_TYPES equals the enum the migrations build", () => {
    const base = readFileSync(SQUASHED, "utf8").match(
      /CREATE TYPE "public"\."companion_type" AS ENUM \(([^)]*)\)/,
    );
    expect(base).not.toBeNull();
    const values = [...(base?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    const added = [...readFileSync(PET, "utf8").matchAll(/add value if not exists '([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect([...COMPANION_TYPES].sort()).toEqual([...values, ...added].sort());
  });
});
