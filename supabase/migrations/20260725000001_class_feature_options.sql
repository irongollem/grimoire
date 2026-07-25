-- Migration: class_feature_options
-- DM-authored "optional class feature" swaps (e.g. Tasha's Cauldron of Everything:
-- Primal Awareness in place of Primeval Awareness). Private, per-owner content —
-- NOT canonical/SRD, so it lives in an owner/campaign-scoped table (mirroring
-- custom_subclasses), never in the shared system_* / srd_* tier.
--
-- A feature option may grant spells that become ALWAYS PREPARED on the character
-- (they don't count against the prepared limit), keyed by the level at which each
-- is gained. `granted_spells` mirrors custom_subclasses.granted_spells:
--   { "3": ["srd_speak_with_animals"], "5": ["srd_beast_sense"] }
-- Spell ids may reference srd_spells.id (srd_* slug) or spells.id (custom uuid).
-- On apply (level-up or retroactive) these are written to character_spells with
-- always_prepared = true, source_type = grant_source_type, source_label = option_name,
-- and any once-per-rest free casting tracked via free_cast_uses / free_cast_resets_on.

create table if not exists public.class_feature_options (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  campaign_id         uuid references public.campaigns (id) on delete cascade,
  class_name          text not null,
  option_name         text not null,
  -- The default (PHB) feature this option is taken in place of, e.g. "Primeval Awareness".
  replaces_feature    text,
  -- Level at which the character may take this option.
  available_at_level  smallint not null default 1
                        check (available_at_level between 1 and 20),
  description         text,
  -- { "<level>": ["<spell_id>", ...] } — always-prepared spells granted by this option.
  granted_spells      jsonb not null default '{}'::jsonb,
  -- Free-cast semantics for the granted spells (e.g. Primal Awareness: 1 / long_rest).
  free_cast_uses      smallint check (free_cast_uses is null or free_cast_uses > 0),
  free_cast_resets_on text check (free_cast_resets_on in ('long_rest', 'short_rest')),
  casting_ability     text check (casting_ability in ('int', 'wis', 'cha')),
  -- Stamped onto character_spells.source_type when the grant is applied.
  grant_source_type   text not null default 'class'
                        check (grant_source_type in ('class', 'racial', 'feat', 'item', 'other')),
  -- Free-text provenance, e.g. "Tasha's Cauldron of Everything".
  source              text,
  created_at          timestamp with time zone default now() not null,
  updated_at          timestamp with time zone default now() not null,
  -- One option of a given name per class within an owner's library / campaign.
  constraint class_feature_options_unique_name
    unique nulls not distinct (user_id, campaign_id, class_name, option_name)
);

create index if not exists class_feature_options_user_id_idx
  on public.class_feature_options (user_id);
create index if not exists class_feature_options_campaign_id_idx
  on public.class_feature_options (campaign_id);
create index if not exists class_feature_options_class_name_idx
  on public.class_feature_options (class_name);

create trigger class_feature_options_updated_at
  before update on public.class_feature_options
  for each row execute procedure update_updated_at();

alter table public.class_feature_options enable row level security;

-- Owner manages their own options; campaign members may read their DM's options
-- (mirrors the custom_subclasses visibility model).
create policy "class_feature_options_select" on public.class_feature_options
  for select using (auth.uid() = user_id or private.is_dm_of_my_campaigns(user_id));
create policy "class_feature_options_insert" on public.class_feature_options
  for insert with check (auth.uid() = user_id);
create policy "class_feature_options_update" on public.class_feature_options
  for update using (auth.uid() = user_id);
create policy "class_feature_options_delete" on public.class_feature_options
  for delete using (auth.uid() = user_id);
