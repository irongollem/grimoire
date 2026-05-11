-- Migration: tile_packs_storage_bucket
-- Create the tile-packs Supabase Storage bucket with public CDN read access for Cartographer tile packs

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tile-packs',
  'tile-packs',
  true,
  5242880,  -- 5 MB per file
  array['image/webp', 'application/json']
)
on conflict (id) do nothing;

-- Public read (no auth required — CDN-cached tile assets)
create policy "tile_packs_public_select" on storage.objects
  for select
  using (bucket_id = 'tile-packs');

-- Only authenticated users may upload/manage packs
create policy "tile_packs_authenticated_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'tile-packs');

create policy "tile_packs_authenticated_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'tile-packs');

create policy "tile_packs_authenticated_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'tile-packs');
