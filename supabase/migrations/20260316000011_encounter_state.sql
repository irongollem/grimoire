-- encounter_state: persists live combat state for real-time player sync

create table public.encounter_state (
  id                     uuid primary key default gen_random_uuid(),
  encounter_id           uuid not null references public.encounters(id) on delete cascade,
  campaign_id            uuid not null references public.campaigns(id) on delete cascade,
  user_id                uuid not null references auth.users(id),
  is_running             boolean not null default false,
  current_round          int not null default 1,
  active_combatant_index int not null default 0,
  combatants_live        jsonb not null default '[]',
  started_at             timestamptz,
  updated_at             timestamptz not null default now(),
  unique(encounter_id)
);

create trigger encounter_state_updated_at
  before update on encounter_state
  for each row execute procedure update_updated_at();

alter table public.encounter_state enable row level security;

-- DM: full control
create policy "encounter_state_dm_all" on public.encounter_state
  for all using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- Campaign members: read only
create policy "encounter_state_member_select" on public.encounter_state
  for select using (is_campaign_member(campaign_id));
