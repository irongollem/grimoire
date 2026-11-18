import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadSpellsListed, nameFilter } from "./fightSpells.ts";

interface Call { table: string; steps: [string, unknown[]][] }

/** A query builder that records what it is asked and answers with `rows[table]` (or an error for a table in `fail`). */
function fakeAdmin(rows: Record<string, unknown[]>, fail: string[] = []) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const builder = {
        select: (...a: unknown[]) => { call.steps.push(["select", a]); return builder; },
        or: (...a: unknown[]) => { call.steps.push(["or", a]); return builder; },
        ilike: (...a: unknown[]) => { call.steps.push(["ilike", a]); return builder; },
        // oxlint-disable-next-line unicorn/no-thenable -- a query builder is awaited; this stands in for one
        then: (resolve: (v: unknown) => void) => resolve(fail.includes(table) ? { data: null, error: { message: "boom" } } : { data: rows[table] ?? [], error: null }),
      };
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}
const orsOf = (c: Call) => c.steps.filter(([s]) => s === "or").map(([, a]) => String(a[0]));

describe("loadSpellsListed", () => {
  // Bug caught: a creature's spells are read one query per name (a mage lists a dozen), or a creature that lists none still queries.
  it("reads every name in one query per table, and not at all for no names", async () => {
    const { admin, calls } = fakeAdmin({});
    await loadSpellsListed(admin, "camp", "owner", ["fireball", "fire bolt", "ice storm"]);
    expect(calls.map((c) => c.table)).toEqual(["spells", "library_spells"]);
    for (const c of calls) expect(orsOf(c).some((f) => f === 'name.ilike."fireball",name.ilike."fire bolt",name.ilike."ice storm"')).toBe(true);
    const none = fakeAdmin({});
    expect(await loadSpellsListed(none.admin, "camp", "owner", [])).toEqual([]);
    expect(none.calls).toEqual([]);
  });

  // Bug caught: the campaign's own spells are not scoped to the campaign (or its owner's all-campaign ones) in the query itself.
  it("scopes the campaign's own spells to the campaign and its owner", async () => {
    const { admin, calls } = fakeAdmin({});
    await loadSpellsListed(admin, "camp-1", "owner-1", ["fireball"]);
    expect(orsOf(calls[0])).toContain("campaign_id.eq.camp-1,and(campaign_id.is.null,user_id.eq.owner-1)");
    expect(calls[1].steps.some(([, a]) => String(a[0]).includes("campaign"))).toBe(false);
  });

  // Bug caught: the campaign's own rows lose their marker or their place, so a homebrew Fireball no longer wins the pick.
  it("lists the campaign's own rows first, marked own, then the library's", async () => {
    const { admin } = fakeAdmin({ spells: [{ id: "mine", name: "Fireball" }], library_spells: [{ id: "lib", name: "Fireball" }] });
    const records = await loadSpellsListed(admin, "camp", "owner", ["fireball"]);
    expect(records).toEqual([{ id: "mine", name: "Fireball", own: true }, { id: "lib", name: "Fireball" }]);
  });

  // Bug caught: a read error is read as "no such spell".
  it("throws a read error naming the table", async () => {
    await expect(loadSpellsListed(fakeAdmin({}, ["library_spells"]).admin, "c", "o", ["fireball"])).rejects.toThrow("library_spells: boom");
  });
});

describe("nameFilter", () => {
  // A comma would start a second filter, a parenthesis would close the group, and a dot or colon would end the operator's value
  // in an unquoted PostgREST value. Quoted, all of them are the name.
  // Bug caught: a spell name with a comma, parenthesis or apostrophe breaks the `or` filter (or reads another table's rows).
  it("quotes the name so a comma, a parenthesis and an apostrophe stay inside it", () => {
    expect(nameFilter("Tasha's Hideous Laughter")).toBe(`name.ilike."Tasha's Hideous Laughter"`);
    expect(nameFilter("Bigby, (Greater) Hand")).toBe(`name.ilike."Bigby, (Greater) Hand"`);
  });

  // A quote and a backslash are the two characters special inside PostgREST quotes, and `ilike` reads \\ and _ itself:
  // the name a"b\c_d becomes the ilike pattern a"b\\c\_d, then each of its quote and backslash characters is escaped once more.
  it("escapes the quote and the backslash, and doubles the ilike escapes so they arrive as one", () => {
    expect(nameFilter(String.raw`a"b\c_d`)).toBe(String.raw`name.ilike."a\"b\\\\c\\_d"`);
  });
});
