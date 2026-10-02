-- #935: record AI provenance per stored image, not per entity row.
--
-- The AI badge on an image used to read the owning row's ai_provenance, which
-- describes the row's generated *text*. So a hand-written NPC with an AI
-- portrait showed no badge, and an AI-drafted NPC with an uploaded drawing
-- showed one. The mark that actually answers "is this picture AI-made" lives in
-- the bytes (the XMP packet every generated image carries), so the registry is
-- keyed by the storage object, not by whatever row happens to point at it.
--
-- Why one table keyed by (bucket, stem), and not a column on each entity:
--   * copies and duplicates of an entity share one storage object. A per-row
--     column drifts the moment one of the copies has its image replaced;
--   * one object has several files: the original (.webp, .jpeg or .png) and
--     its _w<digits> size variants. They are one image, so the key is the path
--     with the final extension and any variant suffix removed;
--   * the marker is written once, at upload, from the packet in the bytes, so
--     there is exactly one writer path to keep honest.
-- The row's own ai_provenance keeps exactly one meaning: the prose was drafted
-- with AI.
--
-- Reads are open to every signed-in user on purpose. This is disclosure
-- metadata (which model made this picture, and when), and a player has to see
-- it for the images in their DM's campaign. It carries no prompt and no row
-- content. Writes are scoped to the caller's own folder, or to an admin for the
-- canonical srd/ folder.
--
-- Backfill: image_generation_jobs logs the generated images whose flow wrote to
-- it, and campaigns.group_portrait_ai_provenance holds the group portrait's
-- mark. Both are copied in, once, with helpers that do not outlive this
-- migration. The log is not complete (several generators never wrote to it, and
-- it hard-codes the provider in places), so scripts/backfill-image-provenance.ts
-- then reads the packet out of every stored image and inserts or corrects from
-- that, the packet being the authority.

create table public.image_provenance (
  bucket text not null,
  stem text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provenance jsonb not null
    check (
      jsonb_typeof(provenance) = 'object'
      and provenance ? 'provider'
      and provenance ? 'generatedAt'
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket, stem)
);

create index image_provenance_user_id_idx on public.image_provenance (user_id);

create trigger image_provenance_updated_at
  before update on public.image_provenance
  for each row execute procedure update_updated_at();

alter table public.image_provenance enable row level security;

create policy "image_provenance_select" on public.image_provenance
  for select to authenticated
  using ((select auth.uid()) is not null);

create policy "image_provenance_insert" on public.image_provenance
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      split_part(stem, '/', 1) = (select auth.uid())::text
      or private.is_app_admin()
    )
  );

create policy "image_provenance_update" on public.image_provenance
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      split_part(stem, '/', 1) = (select auth.uid())::text
      or private.is_app_admin()
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      split_part(stem, '/', 1) = (select auth.uid())::text
      or private.is_app_admin()
    )
  );

create policy "image_provenance_delete" on public.image_provenance
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      split_part(stem, '/', 1) = (select auth.uid())::text
      or private.is_app_admin()
    )
  );

revoke all on public.image_provenance from anon;
grant select, insert, update, delete on public.image_provenance to authenticated;

-- ── Backfill ────────────────────────────────────────────────────────────────

-- Mirrors imageProvenanceStem: drop the final extension and a _w<digits>
-- variant suffix directly before it. A path with no extension is left alone.
create function pg_temp.backfill_stem(p_path text) returns text
language sql immutable as $$
  select regexp_replace(p_path, '(_w[0-9]+)?\.[A-Za-z0-9]+$', '');
$$;

-- (bucket, path) from either stored URL shape; no row when the URL cannot be
-- parsed safely. Origin: <host>/storage/v1/object/public/<bucket>/<path>.
-- CDN: <host>/<bucket>/<path>, accepted only for a registered bucket id.
create function pg_temp.backfill_location(p_url text) returns table (bucket text, path text)
language plpgsql immutable as $$
declare
  v_clean text := split_part(split_part(p_url, '#', 1), '?', 1);
  v_marker constant text := '/object/public/';
  v_at int;
  v_rest text;
  v_bucket text;
  v_known constant text[] := array[
    'npc-portraits', 'asset-images', 'spell-images', 'puzzle-images', 'item-images',
    'monster-images', 'trap-images', 'location-images', 'faction-images',
    'pantheon-emblems', 'loot-images', 'sounds', 'sound-images', 'chronicle',
    'library-tile-packs', 'mini-models'
  ];
begin
  if p_url is null or v_clean = '' or position('%' in v_clean) > 0 then
    return;
  end if;
  if v_clean !~ '^https?://[^/]+/.+' then
    return;
  end if;

  v_at := position(v_marker in v_clean);
  if v_at > 0 then
    v_rest := substr(v_clean, v_at + length(v_marker));
  else
    v_rest := regexp_replace(v_clean, '^https?://[^/]+/', '');
  end if;

  v_bucket := split_part(v_rest, '/', 1);
  if v_bucket = '' or position('/' in v_rest) = 0 then
    return;
  end if;
  if v_at = 0 and not (v_bucket = any (v_known)) then
    return;
  end if;

  bucket := v_bucket;
  path := substr(v_rest, length(v_bucket) + 2);
  if path = '' then
    return;
  end if;
  return next;
end;
$$;

insert into public.image_provenance (bucket, stem, user_id, provenance, created_at)
select distinct on (loc.bucket, pg_temp.backfill_stem(loc.path))
  loc.bucket,
  pg_temp.backfill_stem(loc.path),
  j.user_id,
  jsonb_build_object(
    'generatorType', j.kind,
    'provider', coalesce(j.provider, 'unknown'),
    'model', coalesce(j.model, 'unknown'),
    'generatedAt', to_char(
      coalesce(j.completed_at, j.created_at) at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'edited', false
  ),
  coalesce(j.completed_at, j.created_at)
from public.image_generation_jobs j
cross join lateral pg_temp.backfill_location(j.image_url) as loc
where j.status = 'ready'
  and j.image_url is not null
order by loc.bucket, pg_temp.backfill_stem(loc.path), coalesce(j.completed_at, j.created_at)
on conflict (bucket, stem) do nothing;

insert into public.image_provenance (bucket, stem, user_id, provenance)
select
  loc.bucket,
  pg_temp.backfill_stem(loc.path),
  c.user_id,
  c.group_portrait_ai_provenance
from public.campaigns c
cross join lateral pg_temp.backfill_location(c.group_portrait_url) as loc
where c.group_portrait_url is not null
  and c.group_portrait_ai_provenance is not null
  and jsonb_typeof(c.group_portrait_ai_provenance) = 'object'
  and c.group_portrait_ai_provenance ? 'provider'
  and c.group_portrait_ai_provenance ? 'generatedAt'
on conflict (bucket, stem) do nothing;
