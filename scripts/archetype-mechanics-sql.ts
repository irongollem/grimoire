#!/usr/bin/env tsx
/**
 * Writes the body of the migration that gives the library's Open5e archetypes
 * their mechanics (`OPEN5E_2014_FEATURES`, src/rules/features/catalogue/open5e2014.ts)
 * and its third casters their spellcasting (`LIBRARY_SUBCLASS_CASTING`,
 * src/data/librarySubclassCasting.ts).
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/archetype-mechanics-sql.ts > body.sql
 *
 * The admin import writes the same catalogue entries (it reads the 2014
 * catalogue for every 2014 record key); this is that write for the rows that
 * already exist, so a release does not wait for a click. It follows the rules
 * of scripts/official-mechanics-sql.ts and no others:
 *
 * - Official rows only (`user_id is null`), matched on (source_document_key,
 *   source_record_key, ruleset '2014'), never on uuid. A row that does not
 *   exist (CI, a fresh database) is simply not matched.
 * - `mechanics` is written only while the row still holds what the import last
 *   wrote (`provenance.imported.mechanics`), or, with no baseline, while it is
 *   empty; the baseline moves with the write, so an admin's edit survives this
 *   and every later import.
 *
 * - `spellcasting` is written only while it is still null, as the importer
 *   writes it only into a subclass it creates: a hand-edited table survives.
 *
 * Unlike the Open5e catalogue, no network: the record keys are the catalogue's
 * own, and the document key is the record key's prefix up to the first `_`.
 */
import { LIBRARY_SUBCLASS_CASTING } from "@/data/librarySubclassCasting";
import { OPEN5E_2014_FEATURES } from "@/rules/features/catalogue/open5e2014";

function lit(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const rows = Object.entries(OPEN5E_2014_FEATURES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([rec, mechanics]) => {
    const doc = rec.slice(0, rec.indexOf("_"));
    return `    (${lit(doc)}, ${lit(rec)}, ${lit(JSON.stringify(mechanics))})`;
  });

process.stdout.write(`update public.class_features f
   set mechanics = v.mechanics,
       provenance = coalesce(f.provenance, '{}'::jsonb)
         || jsonb_build_object('imported', coalesce(f.provenance -> 'imported', '{}'::jsonb)
                                            || jsonb_build_object('mechanics', v.mechanics))
  from (select doc, rec, m::jsonb as mechanics
          from (values
${rows.join(",\n")}
        ) as t(doc, rec, m)) v
 where f.user_id is null
   and f.source_document_key = v.doc and f.source_record_key = v.rec
   and f.ruleset = '2014'
   and f.mechanics is distinct from v.mechanics
   and case when f.provenance -> 'imported' ? 'mechanics'
            then f.mechanics is not distinct from nullif(f.provenance -> 'imported' -> 'mechanics', 'null'::jsonb)
            else f.mechanics = '{}'::jsonb end;

update public.custom_subclasses s
   set spellcasting = v.spellcasting
  from (select doc, rec, c::jsonb as spellcasting
          from (values
${LIBRARY_SUBCLASS_CASTING.map(c => `    (${lit(c.source_document_key)}, ${lit(c.source_record_key)}, ${lit(JSON.stringify(c.spellcasting))})`).join(",\n")}
        ) as t(doc, rec, c)) v
 where s.user_id is null
   and s.source_document_key = v.doc and s.source_record_key = v.rec
   and s.ruleset = '2014'
   and s.spellcasting is null;
`);
