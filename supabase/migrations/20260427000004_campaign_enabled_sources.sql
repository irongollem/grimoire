-- Migration: campaign_enabled_sources
-- Per-campaign opt-in for which srd_monsters sources are visible in the Bestiary.
-- Enabling a source is instant — no data download, just a filter row.

create table if not exists public.campaign_enabled_sources (
  id           uuid default gen_random_uuid() primary key,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  source_slug  text not null,
  source_title text,
  enabled_at   timestamptz default now() not null,
  unique(campaign_id, source_slug)
);

alter table public.campaign_enabled_sources enable row level security;

create policy "ces_select" on public.campaign_enabled_sources
  for select using (public.is_campaign_member(campaign_id));

create policy "ces_insert" on public.campaign_enabled_sources
  for insert with check (public.is_campaign_dm(campaign_id));

create policy "ces_delete" on public.campaign_enabled_sources
  for delete using (public.is_campaign_dm(campaign_id));

-- Fix srd_monsters: store slug as source instead of display name, for join with source_slug.
update public.srd_monsters
set source       = 'wotc-srd',
    source_title = 'Systems Reference Document 5.1'
where source = 'SRD 5.1';

-- Auto-enable wotc-srd for any new campaign.
create or replace function public.enable_default_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into campaign_enabled_sources (campaign_id, source_slug, source_title)
  values (new.id, 'wotc-srd', 'Systems Reference Document 5.1')
  on conflict do nothing;
  return new;
end;
$$;

create trigger campaigns_enable_default_sources
  after insert on public.campaigns
  for each row execute procedure enable_default_sources();

-- Backfill wotc-srd for all existing campaigns.
insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title)
select id, 'wotc-srd', 'Systems Reference Document 5.1'
from public.campaigns
on conflict do nothing;
