-- Migration: library_tile_packs
-- Shared, admin-authored tile packs (#889 S1).
--
-- Tile packs are the first Grimoire-*authored* creative content in the library.
-- `library_items` already carries 361 first-party rows under `grimoire-bundled`,
-- but those are curated utility data — "torch, 1 gp". A tile pack is original
-- work we produce, which is why this table carries a licence of its own rather
-- than inheriting one from its source (see `license_keys` below).
--
-- The 11 packs every DM sees today are a hardcoded array in MapWorkbench.vue
-- pointing at static files in public/cartographer/. This table is what replaces
-- it; S6 deletes the array and S7 migrates the packs into these rows. Nothing
-- reads this table yet, and that is deliberate — CLAUDE.md rule 3: build the
-- library system first, migrate the bundled packs into it second.
--
-- WHY NOT `user_tile_packs` WITH A NULLABLE user_id:
-- private-per-user and public-shared are different access models. `user_tile_packs`
-- is gated on `private.can_manage_custom_tile_packs()` (= Pro) and read through
-- signed URLs; a library pack is readable by anon and written only by an admin.
-- Folding them together means one policy mistake exposes every DM's private packs.

-- ── The table ─────────────────────────────────────────────────────────────

create table public.library_tile_packs (
  id uuid primary key default gen_random_uuid(),

  -- DungeonMap's PackRef is (pack_id, pack_version) with no owner id, so this
  -- identity has to be unambiguous across library AND user packs. A constraint
  -- cannot span two tables, so the two id spaces are made disjoint by shape:
  -- `user_tile_packs.pack_id` must match '^custom-…', and this one must not.
  pack_id text not null
    check (pack_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
    check (pack_id !~ '^custom-'),
  pack_version integer not null default 1 check (pack_version > 0),

  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),

  -- Mirrors src/cartographer/packSchema.ts TILE_PACK_SCHEMA.version, which stays
  -- the canonical asset shape. The manifest is that schema's output.
  schema_version integer not null,
  manifest jsonb not null,

  -- A draft is admin-only; publishing is what makes a pack visible to every DM,
  -- and is the moment the licence below starts binding on other people. Archived
  -- retires a pack without breaking maps that already reference it by PackRef.
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),

  -- Attribution: who published this body of content. Nullable because a pack may
  -- predate its source row; `grimoire-art` (inserted below) is the one for packs
  -- we author ourselves.
  content_source_key text references public.content_sources(key) on delete set null,

  -- The licence THIS pack is offered under, which is deliberately not the source
  -- row's `license_keys`. Provenance differs per pack — fully generated, hand
  -- authored through the cartographer-pack CLI, or mixed — and a commissioned or
  -- third-party pack needs its own terms without minting a new source row.
  -- `content_sources` answers "who published it"; this answers "what may a user
  -- do with it", and those are different questions about the same pack.
  --
  -- CC0 is the default for AI-generated packs, decided 17 Sep 2026. The question
  -- is not which licence we must grant but whether we hold a copyright to grant:
  -- output without sufficient human authorship is held uncopyrightable by the US
  -- Copyright Office, and the EU's "own intellectual creation" standard points
  -- the same way. CC-BY would assert a right we may not hold and impose an
  -- attribution condition on work that is probably already free. Empty means no
  -- licence declared — a real state, not a stand-in for unknown, exactly as on
  -- content_sources.
  license_keys text[] not null default '{}',

  -- Same shape as the other fourteen generator-fed tables carry — see
  -- context/compliance/provenance-architecture.md and 20260917173931, which put
  -- the identical column on user_tile_packs. Null means no known AI involvement:
  -- an uploaded pack, or one authored through the CLI.
  ai_provenance jsonb,

  -- Picker order. Hand-set like content_sources.sort_order rather than derived,
  -- because "which pack should a DM see first" is an editorial call.
  sort_order integer not null default 100,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (pack_id, pack_version)
);

comment on table public.library_tile_packs is
  'Admin-authored tile packs published to every user, the way library_monsters and friends are shared content. Distinct from user_tile_packs, which is private and Pro-gated. Bytes live in the public library-tile-packs bucket behind the asset CDN.';
comment on column public.library_tile_packs.license_keys is
  'What a user may do with this pack. Per-pack rather than per-source because provenance differs per pack; CC0 is the default for AI-generated packs. Empty = no licence declared.';

create index library_tile_packs_published_idx
  on public.library_tile_packs (status, sort_order, name)
  where status = 'published';

create trigger library_tile_packs_updated_at
  before update on public.library_tile_packs
  for each row execute procedure update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Published packs are readable by anyone, including anon: they are shared
-- content whose whole purpose is to reach every DM, and the licence notices
-- travelling with them exist to be read. That mirrors content_sources exactly.
-- Drafts and archived packs are admin-only, which is what makes `status` a gate
-- rather than a label.
--
-- There is no user_id, so the four-policy owner pattern does not apply here.
-- `private.is_app_admin()` is total (coalesced at source, 20260809144926), so
-- the OR below cannot go NULL and fall through.

alter table public.library_tile_packs enable row level security;

create policy "library_tile_packs_select" on public.library_tile_packs
  for select to anon, authenticated
  using (status = 'published' or private.is_app_admin());

create policy "library_tile_packs_insert" on public.library_tile_packs
  for insert to authenticated with check (private.is_app_admin());

create policy "library_tile_packs_update" on public.library_tile_packs
  for update to authenticated
  using (private.is_app_admin()) with check (private.is_app_admin());

create policy "library_tile_packs_delete" on public.library_tile_packs
  for delete to authenticated using (private.is_app_admin());

grant select on public.library_tile_packs to anon, authenticated;
grant insert, update, delete on public.library_tile_packs to authenticated;

-- ── The bucket ────────────────────────────────────────────────────────────
--
-- A NEW bucket, not the existing `tile-packs`. That bucket is private and holds
-- users' own packs; flipping it public to serve library packs would expose every
-- one of them. Library packs need the opposite access model: public bytes, read
-- by anon, pulled 20-60 at a time by a single map render, where a signed URL per
-- tile is the wrong shape.
--
-- Writes are service-role only. `BucketWritePolicy.clientWrites = false` carries
-- that in code; here it is expressed the way storage RLS expresses it — by having
-- no insert/update/delete policies at all. Only the admin edge function (S3)
-- writes these bytes.
--
-- OBJECT KEYS MUST NOT START WITH A USER UUID. `collectUserObjects`
-- (_shared/storage-inventory.ts) sweeps every bucket for the `<userId>/` prefix
-- on export and erasure, so a library pack filed under the authoring admin's id
-- would be deleted for everyone when that account is erased — the same trap
-- CLAUDE.md records for canonical `srd/` art. S3 keys these as
-- `<pack_id>/v<pack_version>/…`, which is also what makes the CDN URL stable
-- across a re-publish.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-tile-packs',
  'library-tile-packs',
  true,
  5242880,
  array['image/webp', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The bucket is public, so objects resolve through the public endpoint and the
-- CDN Worker without consulting this. It exists for the authenticated storage
-- API, and for parity with every other public bucket in the registry.
drop policy if exists "library_tile_packs_object_select" on storage.objects;
create policy "library_tile_packs_object_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'library-tile-packs');

-- ── Attribution source ────────────────────────────────────────────────────
--
-- One row for content Grimoire authors itself, so a pack has something to point
-- `content_source_key` at. Curated by hand (`is_metadata_curated`) so the
-- seed-content-sources.ts run cannot reset it from upstream — there is no
-- upstream. `license_keys` is empty here on purpose: the licence is per pack,
-- not per source, and an empty array on this row is the honest statement that
-- this source does not dictate one.

insert into public.content_sources (
  key, title, publisher, license_keys, copyright_notice,
  gamesystem, is_redistributable, is_metadata_curated, sort_order
)
values (
  'grimoire-art',
  'Grimoire original art',
  'Grimoire',
  '{}',
  null,
  -- Null, not an edition key: a floor tile has no edition. Every other row here
  -- carries one because it describes a rulebook.
  null,
  true,
  true,
  110
)
on conflict (key) do nothing;
