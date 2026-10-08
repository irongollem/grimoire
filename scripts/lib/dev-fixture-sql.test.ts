import { describe, expect, it } from "vitest";

import { buildHallSql, buildPlayerContentSql, FIXTURE_TAG, journalDrafts } from "./dev-fixture-sql";

const CAMPAIGN = "11111111-2222-3333-4444-555555555555";
const PLAYER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const MEMBER = "99999999-8888-7777-6666-555555555555";
const FIXTURE = "12121212-3434-5656-7878-909090909090";

describe("journalDrafts", () => {
  it("makes the requested number, tagged, spread over every category", () => {
    const drafts = journalDrafts(40);
    expect(drafts).toHaveLength(40);
    expect(drafts.every((d) => d.tags.includes(FIXTURE_TAG))).toBe(true);
    expect(new Set(drafts.map((d) => d.category)).size).toBe(6);
    expect(new Set(drafts.map((d) => d.title)).size).toBe(40);
  });

  it("is deterministic, and stores Tiptap JSON", () => {
    expect(journalDrafts(5)).toEqual(journalDrafts(5));
    expect(JSON.parse(journalDrafts(1)[0].content)).toMatchObject({ type: "doc" });
  });

  it("shows both sharing states", () => {
    const drafts = journalDrafts(8);
    expect(drafts.some((d) => d.shared_with_dm)).toBe(true);
    expect(drafts.some((d) => !d.shared_with_dm)).toBe(true);
  });
});

describe("buildPlayerContentSql", () => {
  const plan = { campaignId: CAMPAIGN, playerId: PLAYER, partyMemberId: MEMBER, journal: journalDrafts(3), monsterLimit: 40, recipeLimit: 30 };

  it("replaces before it inserts, inside one transaction", () => {
    const text = buildPlayerContentSql(plan);
    expect(text.startsWith("begin;")).toBe(true);
    expect(text.trimEnd().endsWith("commit;")).toBe(true);
    expect(text.indexOf("delete from public.player_journal_entries")).toBeLessThan(text.indexOf("insert into public.player_journal_entries"));
    expect(text.indexOf("delete from public.discovered_monsters")).toBeLessThan(text.indexOf("insert into public.discovered_monsters"));
    expect(text).toContain("c.n <= 40"); // discovered monsters, own first then library
    expect(text).toContain("limit 30"); // recipe grants
  });

  it("tops discoveries up from the campaign's enabled library sources, its own monsters first", () => {
    const text = buildPlayerContentSql(plan);
    expect(text).toContain("from public.library_monsters lm");
    expect(text).toContain("campaign_enabled_sources");
    expect(text).toContain("order by x.own desc, x.name");
  });

  it("grants nothing and shares with nobody when no character was claimed", () => {
    const text = buildPlayerContentSql({ ...plan, partyMemberId: null });
    expect(text).not.toContain("crafting_recipe_grants");
    expect(text).toContain("null::uuid[]");
  });

  it("refuses an id that is not a uuid, so nothing can ride in on one", () => {
    expect(() => buildPlayerContentSql({ ...plan, campaignId: "x'; drop table npcs; --" })).toThrow(/uuid/);
  });
});

describe("buildHallSql", () => {
  it("gives every copy a fresh id and the fixture as owner, and replaces the old ones", () => {
    const text = buildHallSql([{ id: "old", user_id: "other", name: "Brannoc", only_remote: 1 }], ["id", "user_id", "name"], FIXTURE, "fx_hall");
    expect(text).toContain(`delete from public.hall_of_heroes where user_id = '${FIXTURE}'`);
    expect(text).toContain("gen_random_uuid()");
    expect(text).toContain("x.name");
    // A column production has and this checkout lacks rides in the jsonb but is never named.
    expect(text).toContain("(id, user_id, name)");
    // The original id and owner are overridden, not copied through.
    expect(text).toContain(`'user_id', '${FIXTURE}'::text`);
  });

  it("still clears the old copies when production has none", () => {
    const text = buildHallSql([], ["id", "user_id", "name"], FIXTURE, "fx_hall");
    expect(text).toContain("delete from public.hall_of_heroes");
    expect(text).not.toContain("insert into");
  });
});
