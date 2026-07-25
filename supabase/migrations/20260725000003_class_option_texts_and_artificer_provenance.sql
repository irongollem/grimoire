-- Migration: class_option_texts_and_artificer_provenance
-- Licensing hardening for the Artificer (and any future class with text_pick
-- options whose effect text is not SRD-licensed).
--
-- The app ships class *mechanics* only (names, levels, slot tables — not
-- copyrightable). Effect text for non-SRD options (e.g. Artificer infusions,
-- previously baked into src/data/artificerInfusions.ts from Tasha's) is now
-- campaign-supplied content: members type it in from their own sourcebooks.
-- This table stores that per-campaign text, keyed by (class, choice, option).
--
-- Also corrects false provenance on the system Artificer class_features rows,
-- which were labeled 'srd-5.1' — the Artificer is not in any SRD.

create table class_option_texts (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  class_name  text not null,
  choice_key  text not null,
  option_name text not null,
  description text not null,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null,
  unique (campaign_id, class_name, choice_key, option_name)
);

create index class_option_texts_campaign_class_idx
  on class_option_texts (campaign_id, class_name, choice_key);

alter table class_option_texts enable row level security;

-- Shared reference text for the whole table: every campaign member can read
-- and maintain it (a player transcribing their own book must not need the DM).
create policy "class_option_texts_select" on class_option_texts
  for select using (private.is_campaign_member(campaign_id));

create policy "class_option_texts_insert" on class_option_texts
  for insert with check (
    auth.uid() = user_id
    and private.is_campaign_member(campaign_id)
  );

create policy "class_option_texts_update" on class_option_texts
  for update using (private.is_campaign_member(campaign_id));

create policy "class_option_texts_delete" on class_option_texts
  for delete using (private.is_campaign_member(campaign_id));

create trigger class_option_texts_updated_at
  before update on class_option_texts
  for each row execute procedure update_updated_at();

-- Live sync for campaign members (useCampaignLiveSync).
alter publication supabase_realtime add table class_option_texts;

-- Provenance fix: the Artificer never appeared in SRD 5.1 (or 5.2) — these
-- system rows are Grimoire's own mechanics-only chassis.
update class_features
  set source = 'grimoire-system'
  where user_id is null
    and 'artificer' = any(tags)
    and source = 'srd-5.1';
