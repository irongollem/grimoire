-- Migration: quest_triggers
-- Tracks in-game "today" date on campaigns + configurable time-delayed
-- trigger/consequence system that fires when the in-game date is reached.

-- ── Today date on campaigns ─────────────────────────────────────────────────
alter table campaigns
  add column if not exists current_month integer not null default 1,
  add column if not exists current_day   integer not null default 1;

-- ── quest_triggers — configuration records ───────────────────────────────────
create table quest_triggers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  quest_id     uuid references quests on delete cascade not null,
  objective_id uuid references quest_objectives on delete cascade,
  trigger_type text not null check (trigger_type in ('quest_complete', 'objective_done')),
  offset_days  integer not null default 0,
  action_type  text not null check (action_type in ('create_calendar_event', 'send_broadcast')),
  action_payload jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger quest_triggers_updated_at
  before update on quest_triggers
  for each row execute procedure update_updated_at();

alter table quest_triggers enable row level security;

create policy "quest_triggers_select" on quest_triggers for select using (auth.uid() = user_id);
create policy "quest_triggers_insert" on quest_triggers for insert with check (auth.uid() = user_id);
create policy "quest_triggers_update" on quest_triggers for update using (auth.uid() = user_id);
create policy "quest_triggers_delete" on quest_triggers for delete using (auth.uid() = user_id);

-- ── quest_trigger_scheduled — pending fire instances ─────────────────────────
-- Created when a quest/objective completion condition is met.
-- Fired (and marked fired_at) when the DM advances today to >= fire_date.
create table quest_trigger_scheduled (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  campaign_id uuid references campaigns not null,
  trigger_id  uuid references quest_triggers on delete cascade not null,
  quest_id    uuid references quests on delete cascade not null,
  fire_year   integer not null,
  fire_month  integer not null,
  fire_day    integer not null,
  fired_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger quest_trigger_scheduled_updated_at
  before update on quest_trigger_scheduled
  for each row execute procedure update_updated_at();

alter table quest_trigger_scheduled enable row level security;

create policy "quest_trigger_scheduled_select" on quest_trigger_scheduled for select using (auth.uid() = user_id);
create policy "quest_trigger_scheduled_insert" on quest_trigger_scheduled for insert with check (auth.uid() = user_id);
create policy "quest_trigger_scheduled_update" on quest_trigger_scheduled for update using (auth.uid() = user_id);
create policy "quest_trigger_scheduled_delete" on quest_trigger_scheduled for delete using (auth.uid() = user_id);
