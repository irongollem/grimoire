-- Migration: image_generation_jobs
-- Unified async job tracking for all AI image generations. Chronicler_images
-- becomes a view over completed chronicler-kind jobs.

create table if not exists public.image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind text not null check (kind in (
    'chronicler','group_portrait','npc_portrait','monster','item','spell','faction','location'
  )),
  -- Where to write the URL on completion (null for chronicler — the job IS the gallery entry)
  target_table text,
  target_id uuid,
  target_column text,
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  image_url text,
  error text,
  prompt text not null default '',
  size text not null default '1024x1024',
  model text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists image_generation_jobs_campaign_idx
  on public.image_generation_jobs (campaign_id, created_at desc);
create index if not exists image_generation_jobs_kind_status_idx
  on public.image_generation_jobs (kind, status);

alter table public.image_generation_jobs enable row level security;

create policy "image_generation_jobs_select" on public.image_generation_jobs
  for select using (auth.uid() = user_id);
create policy "image_generation_jobs_insert" on public.image_generation_jobs
  for insert with check (auth.uid() = user_id);
create policy "image_generation_jobs_update" on public.image_generation_jobs
  for update using (auth.uid() = user_id);
create policy "image_generation_jobs_delete" on public.image_generation_jobs
  for delete using (auth.uid() = user_id);

create trigger image_generation_jobs_updated_at
  before update on public.image_generation_jobs
  for each row execute procedure update_updated_at();

-- ── Migrate existing chronicler_images rows ────────────────────────────────────
insert into public.image_generation_jobs
  (id, user_id, campaign_id, kind, status, image_url, prompt, size, created_at, completed_at)
select
  id, user_id, campaign_id, 'chronicler', 'ready', image_url, prompt, size, created_at, created_at
from public.chronicler_images;

-- ── Replace chronicler_images table with a view over the jobs table ───────────
drop table public.chronicler_images cascade;

create view public.chronicler_images
with (security_invoker = true)
as
  select
    id,
    campaign_id,
    user_id,
    image_url,
    prompt,
    size,
    created_at,
    status,
    error
  from public.image_generation_jobs
  where kind = 'chronicler';

-- INSTEAD OF triggers redirect view writes to the jobs table.
create or replace function public.chronicler_images_insert_redirect()
returns trigger language plpgsql as $$
begin
  insert into public.image_generation_jobs
    (id, user_id, campaign_id, kind, status, image_url, prompt, size, created_at, completed_at)
  values (
    coalesce(new.id, gen_random_uuid()),
    new.user_id,
    new.campaign_id,
    'chronicler',
    coalesce(new.status, 'ready'),
    new.image_url,
    coalesce(new.prompt, ''),
    coalesce(new.size, '1024x1024'),
    coalesce(new.created_at, now()),
    case when coalesce(new.status,'ready') = 'ready' then coalesce(new.created_at, now()) else null end
  );
  return new;
end;
$$;

create trigger chronicler_images_insert_trigger
  instead of insert on public.chronicler_images
  for each row execute procedure public.chronicler_images_insert_redirect();

create or replace function public.chronicler_images_delete_redirect()
returns trigger language plpgsql as $$
begin
  delete from public.image_generation_jobs
   where id = old.id and kind = 'chronicler';
  return old;
end;
$$;

create trigger chronicler_images_delete_trigger
  instead of delete on public.chronicler_images
  for each row execute procedure public.chronicler_images_delete_redirect();
