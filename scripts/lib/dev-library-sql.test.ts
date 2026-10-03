import { describe, expect, it } from "vitest";
import { buildMirrorSql, LIBRARY_TABLES } from "./dev-library-sql";

describe("LIBRARY_TABLES", () => {
  it("puts content_sources first, since every library row names one", () => {
    expect(LIBRARY_TABLES[0].table).toBe("content_sources");
  });

  it("never mirrors per-account art overrides or the staging queue", () => {
    const names = LIBRARY_TABLES.map((t) => t.table);
    expect(names).not.toContain("library_monster_art");
    expect(names).not.toContain("library_spell_art");
    expect(names).not.toContain("library_art_staging");
  });
});

describe("buildMirrorSql (#953)", () => {
  const sql = buildMirrorSql(
    [
      {
        table: "library_monsters",
        key: "id",
        prune: false,
        rows: [{ id: "srd_srd_aboleth", name: "Aboleth", source: "srd-2014", prod_only: 1 }],
        columns: ["id", "name", "source", "local_only"],
      },
      { table: "library_items", key: "id", prune: false, rows: [], columns: ["id", "name"] },
    ],
    "t",
  );

  it("upserts on the key, naming only the columns both sides have", () => {
    expect(sql).toContain("insert into public.library_monsters (id, name, source)");
    expect(sql).toContain("on conflict (id) do update set name = excluded.name, source = excluded.source;");
    expect(sql).toContain("select x.id, x.name, x.source from");
    expect(sql).not.toContain("x.prod_only");
    expect(sql).not.toContain("local_only");
  });

  it("skips a table production returned nothing for", () => {
    expect(sql).not.toContain("public.library_items");
  });

  it("keeps local-only rows, so an older dump's references keep resolving", () => {
    expect(sql).not.toMatch(/delete from public\.library_monsters/);
  });

  it("prunes a table nothing refers to by key, down to production's rows", () => {
    const pruned = buildMirrorSql(
      [{ table: "library_rules", key: "id", prune: true, rows: [{ id: "r1", name: "Abilities" }], columns: ["id", "name"] }],
      "t",
    );
    expect(pruned).toContain('delete from public.library_rules where id::text <> all (select jsonb_array_elements_text($t$["r1"]$t$::jsonb));');
  });

  it("moves campaigns off the retired wotc-srd slug onto both SRD editions", () => {
    expect(sql).toContain("'srd-2014'");
    expect(sql).toContain("'srd-2024'");
    expect(sql).toContain("delete from public.campaign_enabled_sources where source_slug = 'wotc-srd';");
  });

  it("refuses rows without the key column", () => {
    expect(() =>
      buildMirrorSql([{ table: "library_rules", key: "id", prune: true, rows: [{ name: "x" }], columns: ["id", "name"] }], "t"),
    ).toThrow(/key column/);
  });
});
