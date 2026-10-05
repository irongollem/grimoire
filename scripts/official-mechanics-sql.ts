#!/usr/bin/env tsx
/**
 * Writes the SQL body of the "official mechanics and levels" migration (#976).
 *
 * ## Why this exists
 *
 * The epic's migrations adopt the Open5e class content in place, but an adopted
 * feature carries only an `activation` derived from the old `feature_type`. Its
 * real mechanics (uses, scaling, riders, toggles, choices), the feat columns and
 * the levels a feature is gained at (the old importer kept `gained_at[0]` only:
 * the 2014 Rogue's Ability Score Improvement sat at level 10 alone) came only
 * from the admin import. A release must not wait for a click, so this script
 * runs the import's own planner offline, against Open5e and the SRD
 * catalogues, and turns the plan into SQL.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/official-mechanics-sql.ts > body.sql
 *
 * The output defines `private.apply_official_mechanics_backfill()`, calls it
 * once, and leaves it in place (revoked from client roles) so a pgTAP test can
 * call it on fixtures. The admin import stays as an optional refresh.
 *
 * ## What the SQL does, and what it will not
 *
 * - Official rows only (`user_id is null`), matched on the import's own identity
 *   (source_document_key, source_record_key, ruleset). A row that does not
 *   exist (a fresh database, content not adopted) is simply not matched.
 * - A field the import owns is written only while the row still holds what the
 *   import last wrote (`provenance.imported`), or, with no baseline for it,
 *   while it is empty. `provenance.imported` moves for the fields written. This
 *   is `mergeImportedFeature` in SQL.
 * - A feature whose planned mechanics are empty is left alone: the catalogue
 *   has nothing to say about it, and overwriting would erase the activation the
 *   adoption derived from `feature_type`, the column that goes away.
 * - Feature maps are only ever added to (`unionFeatureMap` in SQL): an id is
 *   appended at a level when absent, nothing is removed or reordered.
 *
 * ## Sources
 *
 * The planner filters on `content_sources`. That table cannot be read offline
 * and is partly seeded by scripts/seed-content-sources.ts, so it is rebuilt
 * from what the fetch already guarantees: `fetchSupported5eDocumentKeys` lists
 * only redistributable documents (the records' embedded document refs carry no
 * licences, so the rule cannot be re-applied here). Matching never depends on
 * the book slug, and an official row can only exist for a hostable book, so
 * this admits nothing the database lacks.
 */
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import { fetchOpen5eClasses } from "@/lib/library/open5eClassImport";
import { fetchOpen5eFeats } from "@/lib/library/open5eFeatImport";
import { planOfficialClassContent } from "@/lib/library/officialClassContent";
import type {
  ContentSourceRef,
  PlannedFeature,
  PlannedFeatureMap,
  SystemClassRef,
} from "@/lib/library/officialClassContent";
import type { RulesetKey } from "@/types/ruleset.types";

/** The official classes (Open5e SRD 5.1 and 5.2.1), by edition and name. */
const SYSTEM_CLASS_NAMES: Readonly<Record<RulesetKey, readonly string[]>> = {
  "2014": ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard", "Artificer"],
  "2024": ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard", "Artificer"],
};

function lit(value: string | null): string {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function jsonLit(value: unknown): string {
  return value === null || value === undefined ? "null" : lit(JSON.stringify(value));
}

function rulesetLit(ruleset: RulesetKey | null): string {
  return lit(ruleset ?? "");
}

function values(rows: readonly string[]): string {
  return rows.map(r => `    ${r}`).join(",\n");
}

/** `identity` is `<document>::<record>::<ruleset|any>`; split it back into its parts. */
function parts(identity: string): { doc: string; rec: string; rs: RulesetKey | null } {
  const [doc, rec, rs] = identity.split("::");
  return { doc, rec, rs: rs === "any" ? null : (rs as RulesetKey) };
}

/** One condition per owned field: still the import's own value, or empty with no baseline. */
function fieldIsOurs(field: string, kind: "jsonb" | "text" | "bool", empty: string): string {
  const baseline =
    kind === "jsonb"
      ? `nullif(f.provenance -> 'imported' -> '${field}', 'null'::jsonb)`
      : kind === "bool"
        ? `(f.provenance -> 'imported' ->> '${field}')::boolean`
        : `(f.provenance -> 'imported' ->> '${field}')`;
  return `case when f.provenance -> 'imported' ? '${field}' then f.${field} is not distinct from ${baseline} else ${empty} end`;
}

function featureStatements(features: readonly PlannedFeature[]): { sql: string; features: number; feats: number } {
  const rows = features.filter(f => f.insert.kind !== "feat" && Object.keys(f.insert.mechanics ?? {}).length > 0);
  const feats = features.filter(f => f.insert.kind === "feat");

  const featureSql = rows.length === 0 ? "" : `
  -- Class features: the mechanics the catalogue gives, where the row still holds the import's own.
  update public.class_features f
     set mechanics = v.mechanics,
         provenance = coalesce(f.provenance, '{}'::jsonb)
           || jsonb_build_object('imported', coalesce(f.provenance -> 'imported', '{}'::jsonb)
                                              || jsonb_build_object('mechanics', v.mechanics))
    from (select doc, rec, nullif(rs, '') as rs, m::jsonb as mechanics
            from (values
${values(rows.map(f => {
  const { doc, rec, rs } = parts(f.identity);
  return `(${lit(doc)}, ${lit(rec)}, ${rulesetLit(rs)}, ${jsonLit(f.insert.mechanics)})`;
}))}
          ) as t(doc, rec, rs, m)) v
   where f.user_id is null
     and f.source_document_key = v.doc and f.source_record_key = v.rec
     and f.ruleset is not distinct from v.rs
     and f.mechanics is distinct from v.mechanics
     and ${fieldIsOurs("mechanics", "jsonb", "f.mechanics = '{}'::jsonb")};
`;

  const featSql = feats.length === 0 ? "" : `
  -- Feats: category, prerequisites, repeatable, ability increase and mechanics, each
  -- written only while its field is still the import's own. kind goes with them,
  -- because the feat-only columns are refused on a row that is not a feat.
  update public.class_features f
     set kind = 'feat',
         mechanics = case when x.ok_mechanics then x.mechanics else f.mechanics end,
         feat_category = case when x.ok_feat_category then x.feat_category else f.feat_category end,
         prerequisites = case when x.ok_prerequisites then x.prerequisites else f.prerequisites end,
         repeatable = case when x.ok_repeatable then x.repeatable else f.repeatable end,
         ability_increase = case when x.ok_ability_increase then x.ability_increase else f.ability_increase end,
         provenance = coalesce(f.provenance, '{}'::jsonb)
           || jsonb_build_object('imported', coalesce(f.provenance -> 'imported', '{}'::jsonb)
             || case when x.ok_mechanics then jsonb_build_object('mechanics', x.mechanics) else '{}'::jsonb end
             || case when x.ok_feat_category then jsonb_build_object('feat_category', x.feat_category) else '{}'::jsonb end
             || case when x.ok_prerequisites then jsonb_build_object('prerequisites', x.prerequisites) else '{}'::jsonb end
             || case when x.ok_repeatable then jsonb_build_object('repeatable', x.repeatable) else '{}'::jsonb end
             || case when x.ok_ability_increase then jsonb_build_object('ability_increase', x.ability_increase) else '{}'::jsonb end)
    from (
      select f.id, v.mechanics, v.feat_category, v.prerequisites, v.repeatable, v.ability_increase,
             -- An empty plan says nothing about mechanics; keep what is there.
             (v.mechanics <> '{}'::jsonb and ${fieldIsOurs("mechanics", "jsonb", "f.mechanics = '{}'::jsonb")}) as ok_mechanics,
             (${fieldIsOurs("feat_category", "text", "f.feat_category is null")}) as ok_feat_category,
             (${fieldIsOurs("prerequisites", "jsonb", "f.prerequisites is null")}) as ok_prerequisites,
             (${fieldIsOurs("repeatable", "bool", "not f.repeatable")}) as ok_repeatable,
             (${fieldIsOurs("ability_increase", "jsonb", "f.ability_increase is null")}) as ok_ability_increase
        from public.class_features f
        join (select doc, rec, nullif(rs, '') as rs, m::jsonb as mechanics, fc as feat_category,
                     p::jsonb as prerequisites, r::boolean as repeatable, a::jsonb as ability_increase
                from (values
${values(feats.map(f => {
  const { doc, rec, rs } = parts(f.identity);
  const i = f.insert;
  return `(${lit(doc)}, ${lit(rec)}, ${rulesetLit(rs)}, ${jsonLit(i.mechanics ?? {})}, ${lit(i.feat_category ?? null)}, ${jsonLit(i.prerequisites)}, ${lit(String(i.repeatable ?? false))}, ${jsonLit(i.ability_increase)})`;
}))}
              ) as t(doc, rec, rs, m, fc, p, r, a)) v
          on f.source_document_key = v.doc and f.source_record_key = v.rec
         and f.ruleset is not distinct from v.rs
       where f.user_id is null
    ) x
   where f.id = x.id
     and (x.ok_mechanics or x.ok_feat_category or x.ok_prerequisites or x.ok_repeatable or x.ok_ability_increase);
`;

  return { sql: featureSql + featSql, features: rows.length, feats: feats.length };
}

interface MapEntry {
  /** Definition identity columns, already as SQL literals. */
  definition: string;
  featureDoc: string;
  featureRec: string;
  featureRs: string;
  levels: number[];
}

/** One entry per (definition, feature) with every level that feature sits at. */
function mapEntries(definition: string, map: PlannedFeatureMap): MapEntry[] {
  const levelsOf = new Map<string, number[]>();
  for (const [level, identities] of Object.entries(map)) {
    for (const identity of identities) {
      const levels = levelsOf.get(identity) ?? [];
      levels.push(Number(level));
      levelsOf.set(identity, levels);
    }
  }
  return [...levelsOf].map(([identity, levels]) => {
    const { doc, rec, rs } = parts(identity);
    return { definition, featureDoc: lit(doc), featureRec: lit(rec), featureRs: rulesetLit(rs), levels: levels.sort((a, b) => a - b) };
  });
}

/**
 * Unions the planned features into a table's `features` map. `matchColumns` are
 * the definition's identity columns in the VALUES rows, `join` how they meet the table.
 */
function mapStatement(table: string, label: string, matchColumns: string, join: string, entries: readonly MapEntry[]): string {
  if (entries.length === 0) return "";
  const cols = matchColumns.split(",");
  const list = (alias: string): string => cols.map(c => `${alias}.${c}`).join(", ");
  return `
  -- ${label}: the planned features added at every level they are gained at.
  update public.${table} t
     set features = private.union_feature_maps(t.features, m.incoming)
    from (
      select ${list("d")}, jsonb_object_agg(d.level, d.ids) as incoming
        from (
          select ${list("e")}, lv::text as level, jsonb_agg(cf.id order by e.ord) as ids
            from (values
${values(entries.map((e, i) => `(${e.definition}, ${e.featureDoc}, ${e.featureRec}, ${e.featureRs}, ${i}, array[${e.levels.join(",")}])`))}
                 ) as e(${matchColumns}, fdoc, frec, frs, ord, levels)
            cross join lateral unnest(e.levels) as lv
            join public.class_features cf
              on cf.user_id is null and cf.source_document_key = e.fdoc and cf.source_record_key = e.frec
             and cf.ruleset is not distinct from nullif(e.frs, '')
           group by ${list("e")}, lv
        ) d
       group by ${list("d")}
    ) m
   where ${join};
`;
}

async function main(): Promise<void> {
  const [classes, feats] = await Promise.all([fetchOpen5eClasses(), fetchOpen5eFeats()]);

  const documents = new Map<string, Open5eDocumentRef>();
  for (const record of [...classes, ...feats]) documents.set(record.document.key, record.document);
  const sources: ContentSourceRef[] = [...documents.values()].map(d => ({
    key: d.key,
    open5e_key: d.key,
    is_redistributable: true,
  }));
  const systemClasses: SystemClassRef[] = (Object.entries(SYSTEM_CLASS_NAMES) as [RulesetKey, readonly string[]][]).flatMap(
    ([ruleset, names]) => names.map(class_name => ({ id: `${ruleset}:${class_name}`, ruleset, class_name })),
  );

  const plan = planOfficialClassContent({
    classes,
    feats,
    sources,
    existing: { features: [], subclasses: [], classes: [] },
    systemClasses,
  });

  const mech = featureStatements(plan.features);

  const systemEntries = plan.systemClasses.flatMap(s =>
    mapEntries(`${rulesetLit(s.ruleset)}, ${lit(s.className.toLowerCase())}`, s.featureMap));
  const subclassEntries = plan.subclasses.flatMap(s => {
    const { doc, rec, rs } = parts(s.identity);
    return mapEntries(`${lit(doc)}, ${lit(rec)}, ${rulesetLit(rs)}`, s.featureMap);
  });
  const classEntries = plan.classes.flatMap(c => {
    const { doc, rec, rs } = parts(c.identity);
    return mapEntries(`${lit(doc)}, ${lit(rec)}, ${rulesetLit(rs)}`, c.featureMap);
  });

  const definitionJoin = (alias: string): string =>
    `${alias}.user_id is null and ${alias}.source_document_key = m.doc and ${alias}.source_record_key = m.rec and ${alias}.ruleset is not distinct from nullif(m.rs, '')`;

  const body = [
    mech.sql,
    mapStatement("system_classes", "System classes", "rs,cname", "t.ruleset = m.rs and lower(t.class_name) = m.cname", systemEntries),
    mapStatement("custom_subclasses", "Official subclasses", "doc,rec,rs", definitionJoin("t"), subclassEntries),
    mapStatement("custom_classes", "Official classes outside the SRD", "doc,rec,rs", definitionJoin("t"), classEntries),
  ].join("");

  const out = `-- BEGIN GENERATED BY scripts/official-mechanics-sql.ts
create function private.union_feature_maps(p_current jsonb, p_incoming jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  -- Every level of either map; at each, the current ids in their order, then the
  -- incoming ids that are not there yet. Nothing is removed or reordered.
  select coalesce(jsonb_object_agg(l.lvl, (
    select coalesce(jsonb_agg(u.id order by u.ord), '[]'::jsonb)
      from (
        select id, min(ord) as ord
          from (
            select e.value as id, e.ordinality as ord
              from jsonb_array_elements_text(coalesce(p_current -> l.lvl, '[]'::jsonb)) with ordinality as e(value, ordinality)
            union all
            select e.value, 1000000 + e.ordinality
              from jsonb_array_elements_text(coalesce(p_incoming -> l.lvl, '[]'::jsonb)) with ordinality as e(value, ordinality)
          ) all_ids
         group by id
      ) u
  )), '{}'::jsonb)
    from (
      select jsonb_object_keys(coalesce(p_current, '{}'::jsonb)) as lvl
      union
      select jsonb_object_keys(coalesce(p_incoming, '{}'::jsonb))
    ) l;
$fn$;

create function private.apply_official_mechanics_backfill()
returns void
language plpgsql
security invoker
set search_path = ''
as $backfill$
begin
${body}
end;
$backfill$;

revoke execute on function private.union_feature_maps(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.apply_official_mechanics_backfill() from public, anon, authenticated;

select private.apply_official_mechanics_backfill();
-- END GENERATED
`;
  process.stdout.write(out);

  console.error(
    JSON.stringify({
      featureMechanicsUpdates: mech.features,
      featUpdates: mech.feats,
      mapEntries: { system_classes: systemEntries.length, custom_subclasses: subclassEntries.length, custom_classes: classEntries.length },
      skippedDocuments: plan.skippedDocuments,
      catalogueWarnings: plan.catalogueWarnings.length,
      bytes: out.length,
    }),
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
