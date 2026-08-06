-- Migration: rewrite_mini_models_urls_to_cdn
-- Bring `mini-models` URLs onto the CDN shape (#577 stage 2).
--
-- Stage 1's rewrite (20260806000001) deliberately excluded this bucket, because
-- at the time it was staying on the Supabase origin. Stage 2 moves its bytes to
-- R2 — and an R2 object is reachable ONLY through the Cloudflare Worker, so a
-- stored origin URL stops resolving the moment a row's object exists only in R2.
--
-- The rewrite itself is not what makes those rows work: the Worker's dual-read
-- serves either store, so an origin URL still resolves today via the Supabase
-- fallback. What this does is make every row consistent BEFORE the fallback is
-- retired, so retiring it is a Worker change rather than another data migration.
--
-- SAFETY: identical machinery to 20260806000001 — see that file for why the
-- columns are discovered by content rather than named. Pure substring
-- replacement of a fixed literal, bucket-scoped, and idempotent (after the
-- rewrite the origin prefix is gone, so a re-run matches nothing).
--
-- KNOWN SIDE EFFECT: rows in tables with an `updated_at` trigger get that column
-- bumped, reordering any "recently updated" view once. Accepted, as before.

do $$
declare
  -- The project's own storage origin. Hardcoded on purpose: this is a
  -- point-in-time data migration, not reusable logic.
  origin_prefix constant text := 'https://ypdokpdpvtmyzkltnmsq.supabase.co/storage/v1/object/public/mini-models/';
  cdn_prefix    constant text := 'https://cdn.dungeongrimoire.com/mini-models/';

  col         record;
  affected    bigint;
  grand_total bigint := 0;
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
    if col.data_type = 'jsonb' then
      -- `minis.extra_paths` is jsonb, and the mini pipeline also stashes URLs in
      -- job metadata — neither is reachable from a hand-written column list.
      execute format(
        'update public.%I set %I = replace(%I::text, %L, %L)::jsonb
           where %I::text like %L',
        col.table_name, col.column_name, col.column_name,
        origin_prefix, cdn_prefix,
        col.column_name, '%' || origin_prefix || '%'
      );
    else
      execute format(
        'update public.%I set %I = replace(%I, %L, %L)
           where %I like %L',
        col.table_name, col.column_name, col.column_name,
        origin_prefix, cdn_prefix,
        col.column_name, '%' || origin_prefix || '%'
      );
    end if;

    get diagnostics affected = row_count;
    if affected > 0 then
      raise notice 'rewrote % row(s) in public.%.%', affected, col.table_name, col.column_name;
      grand_total := grand_total + affected;
    end if;
  end loop;

  raise notice 'mini-models URL rewrite complete: % row-updates', grand_total;
end $$;
