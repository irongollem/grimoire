import { describe, expect, it } from "vitest";

import { assertRemoteUrl, buildImportSql, collectSlugs, type PulledTable, type ReferenceTable } from "./dev-demo-sql";

const TEMPLATE = "11111111-2222-3333-4444-555555555555";
const AUTHOR = "12121212-3434-5656-7878-909090909090";
const LOCATION = "abababab-cdcd-efef-0101-232323232323";
const NPC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const QUEST = "99999999-8888-7777-6666-555555555555";

const campaign = {
  id: TEMPLATE,
  user_id: AUTHOR,
  name: "Demo",
  demo_template: true,
  demo_version: "2026-09-28T19:22:30Z",
  current_location_id: LOCATION,
};
// `only_local` is a column this checkout has and production does not.
const campaignColumns = ["id", "user_id", "name", "demo_template", "current_location_id", "only_local"];

const tables: PulledTable[] = [
  {
    table: "npcs",
    tier: 1,
    parentColumn: null,
    parentTable: null,
    deferColumns: [],
    // `only_remote` is the other way round: production has it, this checkout does not.
    rows: [{ id: NPC, name: "Floss", only_remote: 1 }],
    columns: ["id", "name", "only_local"],
  },
  {
    table: "quests",
    tier: 1,
    parentColumn: null,
    parentTable: null,
    deferColumns: ["entry_beat_id"],
    rows: [{ id: QUEST, entry_beat_id: NPC }],
    columns: ["id", "entry_beat_id"],
  },
  { table: "notes", tier: 1, parentColumn: null, parentTable: null, deferColumns: [], rows: [], columns: ["id"] },
  {
    table: "quest_refs",
    tier: 2,
    parentColumn: "quest_id",
    parentTable: "quests",
    deferColumns: [],
    rows: [{ quest_id: QUEST }],
    columns: ["quest_id"],
  },
];

const references: ReferenceTable[] = [
  { table: "library_spells", rows: [{ id: "srd_srd_aid", name: "Aid", only_remote: 1 }], columns: ["id", "name"] },
  { table: "sound_library", rows: [], columns: ["id"] },
];

describe("collectSlugs", () => {
  it("finds text ids under *_id keys, in columns and inside jsonb alike", () => {
    const rows = [
      { id: NPC, spell_id: "srd_srd_aid", name: "not_an_id", campaign_id: TEMPLATE },
      { combatants: [{ monster_id: "srd_goblin", hp: 7 }], granted: { spell_ids: ["srd_srd_bless", "srd_srd_aid"] } },
    ];
    expect(collectSlugs(rows)).toEqual(["srd_goblin", "srd_srd_aid", "srd_srd_bless"]);
  });

  it("leaves uuids to the foreign keys and ignores what cannot be an id", () => {
    expect(collectSlugs([{ quest_id: QUEST, source_id: "has spaces", other_id: "" }])).toEqual([]);
  });
});

describe("assertRemoteUrl", () => {
  it("accepts the hosted project over https", () => {
    expect(assertRemoteUrl("https://abcd.supabase.co").hostname).toBe("abcd.supabase.co");
  });

  it("refuses the local stack, so the script can never pull from what it writes to", () => {
    expect(() => assertRemoteUrl("http://127.0.0.1:54321")).toThrow(/Refusing/);
    expect(() => assertRemoteUrl("https://localhost:54321")).toThrow(/Refusing/);
  });

  it("refuses plain http and a missing value", () => {
    expect(() => assertRemoteUrl("http://abcd.supabase.co")).toThrow(/Refusing/);
    expect(() => assertRemoteUrl(undefined)).toThrow(/VITE_SUPABASE_URL/);
  });
});

describe("buildImportSql", () => {
  const sql = buildImportSql(campaign, campaignColumns, tables, references, "t");
  const lines = sql.trim().split("\n");
  const at = (start: string) => lines.findIndex((l) => l.startsWith(start));

  it("is one transaction: foreign keys stand down for the purge and return for the insert", () => {
    expect(lines[0]).toBe("begin;");
    expect(lines[1]).toBe("set local session_replication_role = replica;");
    expect(lines.at(-1)).toBe("commit;");

    const back = lines.indexOf("set local session_replication_role = origin;");
    const lastPurge = lines.findLastIndex((l) => l.startsWith("delete from public.") && !l.includes("enabled_sources"));
    expect(back).toBeGreaterThan(lastPurge);
    expect(back).toBeLessThan(at("insert into"));
  });

  it("purges by campaign, children before parents and the campaign last", () => {
    const child = at("delete from public.quest_refs where quest_id in (select");
    const parent = at("delete from public.quests where campaign_id");
    const root = at("delete from public.campaigns");
    expect(child).toBeGreaterThan(-1);
    expect(child).toBeLessThan(parent);
    expect(parent).toBeLessThan(root);
    expect(lines[child]).toContain(`(select id from public.quests where campaign_id = '${TEMPLATE}')`);
  });

  it("also purges by id, for a row the seed still files under another campaign", () => {
    expect(sql).toContain(`delete from public.npcs where id in ('${NPC}');`);
    expect(sql).toContain(`delete from public.quest_refs where quest_id in ('${QUEST}');`);
  });

  it("inserts as the author, with the quota and side-effect triggers quiet", () => {
    expect(sql).toContain(`set_config('request.jwt.claims', '{"sub":"${AUTHOR}","role":"authenticated"}', true)`);
    expect(sql).toContain("set_config('grimoire.bypass_quota', 'on', true)");
    expect(sql).toContain("set_config('grimoire.copying_campaign', 'on', true)");
  });

  it("adds missing shared content before the template's rows, and never overwrites it", () => {
    const library = at("insert into public.library_spells");
    expect(lines[library]).toContain("(id, name) select x.id, x.name from");
    expect(lines[library].endsWith("on conflict do nothing;")).toBe(true);
    expect(library).toBeLessThan(at("insert into demo_pull_tables"));
    expect(sql).not.toContain("delete from public.library_spells");
    expect(sql).not.toContain("public.sound_library");
  });

  it("stages only the tables that have rows", () => {
    expect(sql).toContain("insert into demo_pull_tables values ('npcs', ");
    expect(sql).not.toContain("insert into demo_pull_tables values ('notes', ");
  });

  it("names only the columns both schemas have, so local defaults and triggers apply", () => {
    expect(sql).toContain("insert into demo_pull_tables values ('npcs', 'id, name', 'x.id, x.name', array[]::text[]);");
    expect(lines[at("insert into public.campaigns")]).toContain(
      "(id, user_id, name, demo_template, current_location_id) select",
    );
  });

  it("carries the catalogue's deferred columns, and defers the campaign's location too", () => {
    expect(sql).toContain("'x.id, x.entry_beat_id', array['entry_beat_id']::text[]);");
    expect(lines[at("insert into public.campaigns")]).toContain('"current_location_id":null');
    expect(sql).toContain(`update public.campaigns set current_location_id = '${LOCATION}' where id = '${TEMPLATE}';`);
  });

  it("leaves the template published and offered, so a non-admin can load it", () => {
    expect(lines.at(-2)).toBe(
      "update public.campaigns set demo_template = true, demo_version = $t$2026-09-28T19:22:30Z$t$, " +
        `demo_offered = true where id = '${TEMPLATE}';`,
    );
  });

  it("refuses a tag that occurs in the data, and names that are not plain identifiers", () => {
    expect(() => buildImportSql({ ...campaign, name: "$t$" }, campaignColumns, [], [], "t")).toThrow(/tag/);
    expect(() =>
      buildImportSql(campaign, campaignColumns, [{ ...tables[0], table: "npcs; drop table npcs" }], [], "t"),
    ).toThrow(/identifier/);
    expect(() => buildImportSql({ ...campaign, id: "not-a-uuid" }, campaignColumns, [], [], "t")).toThrow(/uuid/);
  });
});
