-- Migration: srd_art_staging
-- Staging table for bulk-uploaded SRD monster art awaiting monster assignment

create table srd_art_staging (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  storage_path text        not null,
  created_at   timestamptz not null default now()
);

alter table srd_art_staging enable row level security;

create policy "srd_art_staging_select" on srd_art_staging for select using (auth.uid() = user_id);
create policy "srd_art_staging_insert" on srd_art_staging for insert with check (auth.uid() = user_id);
create policy "srd_art_staging_delete" on srd_art_staging for delete using (auth.uid() = user_id);
