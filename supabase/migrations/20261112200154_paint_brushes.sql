-- A painter's own brushes (#1181): the ones they imported from a brush file, made from a photo or a box on a
-- picture, or had described. Stock brushes ship with the app and are never rows.
--
-- A brush belongs to its painter, not to a campaign or a book: the same brush paints in every campaign, so the
-- row hangs off the user alone and rings no campaign doorbell. A painting never refers to a brush (strokes are
-- pixels the moment they land), so deleting a brush cannot break a picture.
--
-- `preset` is the engine's BrushPreset as JSON, validated by the client on read (a row that does not parse is
-- skipped, never painted with). Its tip and grain images are WebP files in asset-images under the painter's own
-- id, named `brush-...`, so the Illuminator's sweep of unreferenced `ill-...` files never takes one; the client
-- removes them when it deletes the brush.
--
-- No quota: one imported set can hold a hundred brushes, so a count would break import on a free account, and
-- the bytes they take are bounded by the storage ceilings (#1182).

create table public.paint_brushes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  preset      jsonb not null check (jsonb_typeof(preset) = 'object'),
  tip_url     text,
  grain_url   text,
  -- Where it came from: made by hand, from a photo, from a box on a picture, described to the image model, or
  -- read from a brush file. `described` marks a tip the model drew (AI Act marking, #611).
  source      text not null check (source in ('made', 'photo', 'picture', 'described', 'abr', 'procreate')),
  -- The set an imported brush arrived in, so the library can keep a file's brushes together.
  set_name    text check (set_name is null or char_length(set_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index paint_brushes_user_id_idx on public.paint_brushes (user_id, created_at);

create trigger paint_brushes_updated_at
  before update on public.paint_brushes
  for each row execute procedure update_updated_at();

alter table public.paint_brushes enable row level security;

create policy "paint_brushes_select" on public.paint_brushes for select using ((select auth.uid()) = user_id);
create policy "paint_brushes_insert" on public.paint_brushes for insert with check ((select auth.uid()) = user_id);
create policy "paint_brushes_update" on public.paint_brushes for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "paint_brushes_delete" on public.paint_brushes for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.paint_brushes to authenticated, service_role;
