/**
 * The pure half of `dev-library.ts`: which tables make up the shared library,
 * and the statement that brings a local copy of them in line with production.
 * Kept apart from the script so it can be tested without a stack.
 */

const IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * The shared library, in the order it goes in: `content_sources` first because
 * every other row names one. All of it is admin-authored and readable by every
 * account, so mirroring it moves nothing private. The per-user art overrides
 * (`library_monster_art`, `library_spell_art`) and the staging queue are left
 * out on purpose: those rows belong to accounts. The embeddings are left out
 * too: they are large, derived, and rebuilt by the admin backfill.
 *
 * `prune` marks a table nothing refers to by its key, so local rows production
 * lacks are deleted rather than kept. `library_rules` and `library_art_defaults`
 * are keyed by a uuid each seed mints afresh and are read by edition, slug or
 * name, so without pruning an old dump's rows would sit beside production's as
 * duplicates.
 *
 * `filter` is a PostgREST filter for a table only part of which is shared.
 */
export const LIBRARY_TABLES = [
  { table: "content_sources", key: "key", prune: false },
  { table: "library_rules", key: "id", prune: true },
  { table: "library_species", key: "id", prune: false },
  { table: "library_backgrounds", key: "id", prune: false },
  { table: "library_spells", key: "id", prune: false },
  { table: "library_monsters", key: "id", prune: false },
  { table: "library_items", key: "id", prune: false },
  { table: "library_monster_art_canonical", key: "entry_id", prune: false },
  { table: "library_spell_art_canonical", key: "entry_id", prune: false },
  { table: "library_art_defaults", key: "id", prune: true },
  // Official class content (#943, #976): the rows with no owner. A character
  // names its subclass by id, so without these a demo character cannot load.
  { table: "custom_classes", key: "id", prune: false, filter: "user_id=is.null" },
  { table: "custom_subclasses", key: "id", prune: false, filter: "user_id=is.null" },
  { table: "class_features", key: "id", prune: false, filter: "user_id=is.null" },
] as const satisfies readonly { table: string; key: string; prune: boolean; filter?: string }[];

export interface MirrorTable {
  table: string;
  key: string;
  /** Delete local rows production lacks. See {@link LIBRARY_TABLES}. */
  prune: boolean;
  rows: Record<string, unknown>[];
  /** The local table's insertable columns: everything but dropped and generated ones. */
  columns: string[];
}

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Not a plain identifier: ${name}`);
  return name;
}

/** A dollar-quoted literal. The tag is checked against the payload, so no row can close it early. */
function dollar(text: string, tag: string): string {
  const quote = `$${tag}$`;
  if (text.includes(quote)) throw new Error("The dollar-quote tag occurs in the data; pick another.");
  return `${quote}${text}${quote}`;
}

/**
 * One transaction that upserts production's library rows into the local stack.
 *
 * Only the columns both sides have are named, the way `dev-demo-sql.ts` does it:
 * a local schema usually runs ahead of production's, and `jsonb_populate_record`
 * fills a missing column with NULL rather than its default.
 *
 * Local rows production lacks are **kept**, outside the `prune` tables. A local stack's user data is a dump
 * of whatever vintage `db:pull` last fetched, and it may still point at rows a
 * later id transition retired (`20260722000002` moved the SRD from `wotc-srd` to
 * `srd-2014` / `srd-2024` and remapped production's references, not a dump's).
 * Deleting them would turn those references into "Unknown creature". A fresh
 * `npm run db:pull` is what replaces them.
 *
 * The enabled-sources rewrite is step 3 of `20260722000002`, replayed: a dump
 * from before it still has campaigns reading the retired `wotc-srd` slug, which
 * now names nothing in the library this brings in.
 */
export function buildMirrorSql(tables: MirrorTable[], tag: string): string {
  const lines: string[] = ["begin;"];
  for (const t of tables) {
    if (t.rows.length === 0) continue;
    const name = ident(t.table);
    const key = ident(t.key);
    const carried = new Set(Object.keys(t.rows[0]));
    const cols = t.columns.filter((c) => carried.has(c)).map(ident);
    if (!cols.includes(key)) throw new Error(`${t.table}: the pulled rows do not carry the key column ${t.key}.`);
    const updates = cols.filter((c) => c !== key).map((c) => `${c} = excluded.${c}`);
    lines.push(
      `insert into public.${name} (${cols.join(", ")}) select ${cols.map((c) => `x.${c}`).join(", ")} ` +
        `from jsonb_array_elements(${dollar(JSON.stringify(t.rows), tag)}::jsonb) e ` +
        `cross join lateral jsonb_populate_record(null::public.${name}, e) x ` +
        `on conflict (${key}) do ${updates.length ? `update set ${updates.join(", ")}` : "nothing"};`,
    );
    if (t.prune) {
      lines.push(
        `delete from public.${name} where ${key}::text <> all (select jsonb_array_elements_text(${dollar(JSON.stringify(t.rows.map((r) => String(r[t.key]))), tag)}::jsonb));`,
      );
    }
  }
  lines.push(
    "insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title) " +
      "select campaign_id, 'srd-2014', 'System Reference Document 5.1' from public.campaign_enabled_sources " +
      "where source_slug = 'wotc-srd' on conflict do nothing;",
    "insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title) " +
      "select campaign_id, 'srd-2024', 'System Reference Document 5.2' from public.campaign_enabled_sources " +
      "where source_slug = 'wotc-srd' on conflict do nothing;",
    "delete from public.campaign_enabled_sources where source_slug = 'wotc-srd';",
    "commit;",
  );
  return lines.join("\n");
}
