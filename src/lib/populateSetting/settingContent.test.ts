import { describe, expect, it } from "vitest";
import { matchSettingRowIds } from "./settingContent";

/**
 * Only `matchSettingRowIds` is covered here, and deliberately so rather than for
 * lack of time: it is the part with a decision in it, and a wrong answer costs a
 * user their free-tier allowance either way it errs.
 *
 * `stampSettingSource` is one chained Supabase call with no branching beyond an
 * empty-input guard, so a unit test would assert the mock it was given. What
 * actually proves it is `supabase/tests/setting_content_quota.test.sql`, which
 * exercises the column against the real `check_quota`, `check_all_quotas` and
 * `enforce_quota` — note that it stamps rows with raw SQL, so it covers the
 * database's half of the contract and not this function's call shape.
 */
describe("matchSettingRowIds", () => {
  const existing = [
    { id: "a", name: "Harpers" },
    { id: "b", name: "My Own Guild" },
    { id: "c", name: "lords' alliance" },
  ];

  it("matches shipped names case-insensitively", () => {
    // The populate paths lower-case both sides when deciding what to insert, so
    // the stamp has to agree with them — otherwise a row is skipped as
    // already-present and never marked, and keeps counting against the cap.
    expect(matchSettingRowIds(existing, ["Harpers", "Lords' Alliance"])).toEqual(["a", "c"]);
  });

  it("leaves rows the user created alone", () => {
    // The whole point of the column: null means "the user made this", and that
    // is what a quota is supposed to count.
    expect(matchSettingRowIds(existing, ["Harpers"])).not.toContain("b");
  });

  it("returns nothing when the setting ships no content of this kind", () => {
    // Several settings define factions but no deities or pantheons.
    expect(matchSettingRowIds(existing, [])).toEqual([]);
  });

  it("returns nothing when the campaign is empty", () => {
    expect(matchSettingRowIds([], ["Harpers"])).toEqual([]);
  });
});
