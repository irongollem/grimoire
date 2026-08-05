-- Migration: rewrite_stored_asset_urls_to_cdn
-- Point existing stored asset URLs at the asset CDN (#577 stage 1).
--
-- New writes already emit `https://cdn.dungeongrimoire.com/<bucket>/<path>`
-- (src/lib/storage.ts + supabase/functions/_shared/cdn-buckets.ts). This moves
-- the ~2,600 rows written before that shipped, so existing art is served from
-- the edge rather than billing Supabase egress on every view.
--
-- WHY A DISCOVERY LOOP RATHER THAN A COLUMN LIST:
-- A hand-written list would have to name 22 columns across 18 tables, and would
-- still miss rich-text bodies — Scriptorium documents embed asset-images URLs
-- inside Tiptap JSON, in columns whose names say nothing about images. Scanning
-- every text/jsonb column for the literal prefix cannot miss one, and cannot
-- touch a column that does not contain it.
--
-- SAFETY:
--   * Pure substring replacement of a fixed literal. The replacement contains no
--     JSON-special characters, so the jsonb round-trip through ::text is lossless.
--   * Bucket-scoped, so `mini-models` (`cdn: false`) is left on the origin. A
--     blanket host swap would have moved it too.
--   * Idempotent. After the rewrite the origin prefix is gone, so a re-run
--     matches nothing.
--
-- KNOWN SIDE EFFECT: tables with an `updated_at` trigger will have that column
-- bumped on rewritten rows, which reorders any "recently updated" view once and
-- emits a burst of realtime events. Accepted rather than disabling triggers,
-- which would be a far riskier operation than the rewrite itself.

do $$
declare
  -- The project's own storage origin at the time of writing. Hardcoded on
  -- purpose: this is a point-in-time data migration, not reusable logic.
  origin_prefix constant text := 'https://ypdokpdpvtmyzkltnmsq.supabase.co/storage/v1/object/public/';
  cdn_base      constant text := 'https://cdn.dungeongrimoire.com';

  -- MUST match CDN_BUCKET_IDS in supabase/functions/_shared/cdn-buckets.ts and
  -- the `cdn: true` buckets in src/lib/storage.ts. Excludes `sounds` and
  -- `mini-models` by design.
  cdn_buckets constant text[] := array[
    'npc-portraits', 'asset-images', 'spell-images', 'puzzle-images',
    'item-images', 'monster-images', 'trap-images', 'location-images',
    'faction-images', 'pantheon-emblems', 'loot-images', 'sound-images',
    'chronicle', 'sounds'
  ];

  col          record;
  bucket       text;
  from_literal text;
  to_literal   text;
  affected     bigint;
  col_total    bigint;
  grand_total  bigint := 0;
begin
  for col in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name  = c.table_name
     where c.table_schema = 'public'
       and t.table_type   = 'BASE TABLE'
       and c.is_generated = 'NEVER'
       and c.data_type in ('text', 'character varying', 'jsonb')
     order by c.table_name, c.column_name
  loop
    col_total := 0;

    foreach bucket in array cdn_buckets loop
      from_literal := origin_prefix || bucket || '/';
      to_literal   := cdn_base || '/' || bucket || '/';

      if col.data_type = 'jsonb' then
        execute format(
          'update public.%I set %I = replace(%I::text, %L, %L)::jsonb
             where %I::text like %L',
          col.table_name, col.column_name, col.column_name,
          from_literal, to_literal,
          col.column_name, '%' || from_literal || '%'
        );
      else
        execute format(
          'update public.%I set %I = replace(%I, %L, %L)
             where %I like %L',
          col.table_name, col.column_name, col.column_name,
          from_literal, to_literal,
          col.column_name, '%' || from_literal || '%'
        );
      end if;

      get diagnostics affected = row_count;
      col_total := col_total + affected;
    end loop;

    if col_total > 0 then
      raise notice 'rewrote % row(s) in public.%.%', col_total, col.table_name, col.column_name;
      grand_total := grand_total + col_total;
    end if;
  end loop;

  raise notice 'asset URL rewrite complete: % row-updates across all columns', grand_total;
end $$;
