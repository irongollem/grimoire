-- Migration: sound_library_catalog
-- A curated, free-for-everyone audio catalogue the soundboard can be stocked from,
-- plus the quota exemption that keeps catalogue sounds off a free DM's 20-sound cap.

-- ── 1. The catalogue ──────────────────────────────────────────────────────
--
-- This is an index over audio we host ourselves, mirroring the provenance
-- manifest the library is assembled from. Every column that exists purely to
-- record where a sound came from — source, source_page, license, attribution —
-- is what makes CC-BY compliance mechanical rather than a thing someone has to
-- remember: the credit line travels with the sound onto the DM's board.
--
-- Deliberately NOT called anything SRD-flavoured. None of this is SRD content;
-- it is CC0 / CC-BY audio from OpenGameArt, Wikimedia Commons and the Internet
-- Archive, and labelling it otherwise would misdescribe the licence.

create table if not exists "public"."sound_library" (
  "id"               uuid primary key default gen_random_uuid(),
  -- Stable identity from the source manifest, e.g. "rain/rain-gutter-loop".
  -- Re-running ingestion updates rather than duplicates.
  "slug"             text not null unique,
  -- The manifest's own grouping ("rain", "tavern", "monster"), used as the
  -- browsable collection. Distinct from `category`, which is a mixer bus.
  "collection"       text not null,
  -- Which bus this lands on when added to a board.
  "category"         text not null default 'effects'
                     check ("category" in ('ambient', 'music', 'effects', 'misc')),
  "title"            text not null,
  "author"           text not null,
  "source"           text not null,
  "source_page"      text not null,
  "license"          text not null,
  "license_url"      text,
  -- Ready-to-display credit line. Null when the licence requires none (CC0).
  -- Non-null is the trigger for showing credit, so it must never be a
  -- placeholder string.
  "attribution"      text,
  "storage_path"     text not null unique,
  "file_url"         text not null,
  "duration_seconds" real,
  -- Theme labels ride along on add, so a fresh campaign has working encounter
  -- and location audio before the DM has tagged anything themselves.
  "tags"             text[] not null default '{}',
  "is_loopable"      boolean not null default false,
  "gain_trim"        real not null default 1.0 check ("gain_trim" > 0 and "gain_trim" <= 4),
  "sort_order"       integer not null default 0,
  "created_at"       timestamptz not null default now(),
  "updated_at"       timestamptz not null default now()
);

create index if not exists "sound_library_collection_idx" on "public"."sound_library" ("collection");
create index if not exists "sound_library_category_idx" on "public"."sound_library" ("category");
create index if not exists "sound_library_tags_idx" on "public"."sound_library" using gin ("tags");
-- No trigram index on title: `pg_trgm` is not installed, and at catalogue scale
-- (hundreds of rows, not millions) an ilike scan is already instant. Adding the
-- extension to buy an index we cannot measure would be a security-advisor
-- finding in exchange for nothing.

create trigger sound_library_updated_at
  before update on "public"."sound_library"
  for each row execute procedure update_updated_at();

-- RLS: readable by everyone signed in, writable only by app admins.
--
-- This is shared catalogue content rather than user data, so the usual
-- four-policy `auth.uid() = user_id` shape does not apply — there is no
-- user_id. Reads are open to every tier: the catalogue is free content, and
-- gating it would defeat the point of shipping a board that is never empty.
alter table "public"."sound_library" enable row level security;

create policy "sound_library_select" on "public"."sound_library"
  for select to authenticated using (true);

create policy "sound_library_insert" on "public"."sound_library"
  for insert to authenticated with check (private.is_app_admin());

create policy "sound_library_update" on "public"."sound_library"
  for update to authenticated using (private.is_app_admin());

create policy "sound_library_delete" on "public"."sound_library"
  for delete to authenticated using (private.is_app_admin());

-- ── 2. Board rows can point back at the catalogue ─────────────────────────
--
-- Adding from the catalogue still creates a normal `sounds` row, so playback,
-- playlists, scenes, the palette and the trigger bus all keep working with no
-- special case. The link is what marks the row as catalogue-backed.
--
-- ON DELETE SET NULL rather than CASCADE: retiring a catalogue entry must not
-- silently delete sounds off a DM's board mid-campaign. The row keeps its
-- file_url and simply stops being catalogue-backed.

alter table "public"."sounds"
  add column if not exists "library_id" uuid references "public"."sound_library" ("id") on delete set null;

create index if not exists "sounds_library_id_idx" on "public"."sounds" ("library_id");

-- ── 3. Catalogue sounds do not count against the quota ────────────────────
--
-- Free tier is 20 sounds. Content we ship must not consume that allowance,
-- or "we give you a library" and "you may keep twenty sounds" cancel out.
--
-- Both quota functions count with dynamic SQL over a resource allowlist, so
-- the exemption is a predicate appended for `sounds` alone. Keep the two in
-- sync — they are the same rule expressed twice, once per call shape.

create or replace function "public"."check_quota"("resource_type" "text") returns "jsonb"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $_$
declare
  v_quotas  jsonb;
  v_limit   int;
  v_current int;
  v_extra   text := '';
begin
  -- App admins are always unlimited — short-circuit before any DB work
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  -- Validate resource_type to prevent arbitrary table scanning via dynamic SQL
  if resource_type not in (
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'sounds', 'soundboard_pages', 'soundboard_playlists',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms'
  ) then
    raise exception 'invalid resource_type: %', resource_type;
  end if;

  -- Curated catalogue sounds are free content and never count against the cap.
  if resource_type = 'sounds' then
    v_extra := ' and library_id is null';
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  select p.quotas
    into v_quotas
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = auth.uid()
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_quotas from plans where id = 'free';
  end if;

  -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
  if not (v_quotas ? resource_type) then
    return jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true);
  end if;

  v_limit := (v_quotas ->> resource_type)::int;

  execute format('select count(*) from %I where user_id = $1%s', resource_type, v_extra)
    into v_current using auth.uid();

  return jsonb_build_object(
    'allowed',   v_current < v_limit,
    'current',   v_current,
    'limit',     v_limit,
    'unlimited', false
  );
end;
$_$;

create or replace function "public"."check_all_quotas"() returns "jsonb"
    language "plpgsql" security definer
    set "search_path" to 'public'
    as $_$
declare
  v_quotas  jsonb;
  v_result  jsonb := '{}'::jsonb;
  v_res     text;
  v_limit   int;
  v_current int;
  v_extra   text;
  -- Keep this list in sync with check_quota's resource_type allowlist.
  v_resources text[] := array[
    'campaigns', 'npcs', 'monsters', 'encounters', 'scriptorium_documents', 'notes',
    'quests', 'factions', 'locations', 'deities', 'pantheons', 'puzzle_rooms',
    'sounds', 'soundboard_pages', 'soundboard_playlists'
  ];
begin
  -- App admins are always unlimited — short-circuit before any counting
  if (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' then
    foreach v_res in array v_resources loop
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true)
      );
    end loop;
    return v_result;
  end if;

  -- Look up the user's plan quotas; default to free if no subscription row exists
  select p.quotas
    into v_quotas
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = auth.uid()
     and s.status in ('active', 'trialing');

  if not found then
    select quotas into v_quotas from plans where id = 'free';
  end if;

  foreach v_res in array v_resources loop
    -- Missing key in quotas JSONB = unlimited (pro plan has empty {})
    if not (v_quotas ? v_res) then
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', true, 'current', 0, 'limit', -1, 'unlimited', true)
      );
    else
      v_limit := (v_quotas ->> v_res)::int;
      -- Same exemption as check_quota: catalogue sounds are free content.
      v_extra := case when v_res = 'sounds' then ' and library_id is null' else '' end;
      execute format('select count(*) from %I where user_id = $1%s', v_res, v_extra)
        into v_current using auth.uid();
      v_result := v_result || jsonb_build_object(
        v_res, jsonb_build_object('allowed', v_current < v_limit, 'current', v_current, 'limit', v_limit, 'unlimited', false)
      );
    end if;
  end loop;

  return v_result;
end;
$_$;

-- ── 4. Storage: the catalogue lives under `library/` in the sounds bucket ──
--
-- Same shape as the canonical-art policies, with an honest prefix: this is
-- CC0/CC-BY audio, not SRD content, so it is not filed as if it were.
--
-- Write-side only. The `sounds` bucket is public, so reads already work
-- without a select policy, and adding a redundant one would imply reads are
-- gated when they are not.
--
-- A DM's own uploads stay under `{userId}/` and are untouched by this, so
-- clearing one user's files can never wipe the shared catalogue.

create policy "sounds_library_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sounds'
    and (storage.foldername(name))[1] = 'library'
    and private.is_app_admin()
  );

create policy "sounds_library_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'sounds'
    and (storage.foldername(name))[1] = 'library'
    and private.is_app_admin()
  );

create policy "sounds_library_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'sounds'
    and (storage.foldername(name))[1] = 'library'
    and private.is_app_admin()
  );
