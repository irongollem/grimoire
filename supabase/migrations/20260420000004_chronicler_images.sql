-- Migration: chronicler_images
-- Chronicler scene illustration library: per-campaign DM-owned images, chronicle storage bucket,
-- and promotional consent flag on campaigns

-- Table -----------------------------------------------------------------------
create table chronicler_images (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  image_url   text not null,
  prompt      text not null,
  size        text not null,
  created_at  timestamptz not null default now()
);

alter table chronicler_images enable row level security;

create trigger chronicler_images_updated_at
  before update on chronicler_images
  for each row execute procedure update_updated_at();

create policy "chronicler_images_select" on chronicler_images for select using (auth.uid() = user_id);
create policy "chronicler_images_insert" on chronicler_images for insert with check (auth.uid() = user_id);
create policy "chronicler_images_delete" on chronicler_images for delete using (auth.uid() = user_id);

-- Storage bucket --------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('chronicle', 'chronicle', true)
  on conflict (id) do nothing;

create policy "chronicle_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chronicle' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "chronicle_select" on storage.objects
  for select using (bucket_id = 'chronicle');

create policy "chronicle_delete" on storage.objects
  for delete using (bucket_id = 'chronicle' and (storage.foldername(name))[1] = auth.uid()::text);

-- Promotional consent ---------------------------------------------------------
alter table campaigns
  add column allow_chronicle_promotion boolean not null default false;
