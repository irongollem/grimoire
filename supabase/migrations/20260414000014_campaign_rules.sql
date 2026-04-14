-- Migration: campaign_rules
-- Built-in optional rule toggles, custom rule tracker bolt-on, and per-character tracker state

-- ── 1. Built-in optional rule toggles ────────────────────────────────────────
create table campaign_rules (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  rule_key    text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, rule_key)
);

create trigger campaign_rules_updated_at
  before update on campaign_rules
  for each row execute procedure update_updated_at();

alter table campaign_rules enable row level security;

-- All campaign members can read which rules are enabled
create policy "campaign_rules_select" on campaign_rules
  for select using (
    exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = campaign_rules.campaign_id
        and campaign_members.user_id = auth.uid()
    )
    or exists (
      select 1 from campaigns
      where campaigns.id = campaign_rules.campaign_id
        and campaigns.user_id = auth.uid()
    )
  );

-- Only DM can insert / update / delete
create policy "campaign_rules_insert" on campaign_rules
  for insert with check (is_campaign_dm(campaign_id));

create policy "campaign_rules_update" on campaign_rules
  for update using (is_campaign_dm(campaign_id));

create policy "campaign_rules_delete" on campaign_rules
  for delete using (is_campaign_dm(campaign_id));


-- ── 2. Tracker bolt-on for custom rules ──────────────────────────────────────
-- tracker jsonb shape:
-- {
--   "label": "Cold Exposure",
--   "type": "level" | "points",
--   "min": 0,
--   "max": 3,
--   "levels": [                          -- for type = "level"
--     { "value": 0, "label": "Unaffected", "color": "green", "effects": [] },
--     { "value": 1, "label": "Chilled",    "color": "blue",  "effects": [
--         { "type": "note", "label": "Disadvantage on CON saves in blizzard" }
--     ]},
--     ...
--   ],
--   "triggers": {
--     "onLongRest":  1,                  -- delta applied on long rest
--     "onShortRest": 0,
--     "itemTags": [
--       { "tag": "cold_weather_gear", "delta": 0, "mode": "suppresses_rest_tick" },
--       { "tag": "hot_meal",          "delta": -1, "mode": "on_consume" }
--     ]
--   },
--   "dmButtons": [
--     { "label": "Add Exposure", "delta": 1 },
--     { "label": "Warm Up",      "delta": -1 }
--   ]
-- }
alter table rules add column if not exists tracker jsonb;


-- ── 3. Per-character tracker state ───────────────────────────────────────────
-- Tracks current value for both built-in rules (rule_key) and custom rules (rule_id).
-- Exactly one of rule_key / rule_id is non-null per row.
create table party_member_tracker_state (
  id              uuid primary key default gen_random_uuid(),
  party_member_id uuid not null references party_members(id) on delete cascade,
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  rule_key        text,       -- set for built-in rules
  rule_id         uuid references rules(id) on delete cascade,  -- set for custom rules
  value           int not null default 0,
  updated_at      timestamptz not null default now(),
  -- enforce exactly-one-source constraint
  constraint tracker_state_source_check check (
    (rule_key is not null) <> (rule_id is not null)
  ),
  -- one row per character per rule
  unique (party_member_id, rule_key),
  unique (party_member_id, rule_id)
);

create trigger party_member_tracker_state_updated_at
  before update on party_member_tracker_state
  for each row execute procedure update_updated_at();

alter table party_member_tracker_state enable row level security;

-- All campaign members can read tracker state
create policy "party_member_tracker_state_select" on party_member_tracker_state
  for select using (
    exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = party_member_tracker_state.campaign_id
        and campaign_members.user_id = auth.uid()
    )
    or exists (
      select 1 from campaigns
      where campaigns.id = party_member_tracker_state.campaign_id
        and campaigns.user_id = auth.uid()
    )
  );

-- DM or the player themselves can write
create policy "party_member_tracker_state_insert" on party_member_tracker_state
  for insert with check (
    is_campaign_dm(campaign_id)
    or exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = party_member_tracker_state.campaign_id
        and campaign_members.user_id = auth.uid()
        and campaign_members.party_member_id = party_member_tracker_state.party_member_id
    )
  );

create policy "party_member_tracker_state_update" on party_member_tracker_state
  for update using (
    is_campaign_dm(campaign_id)
    or exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = party_member_tracker_state.campaign_id
        and campaign_members.user_id = auth.uid()
        and campaign_members.party_member_id = party_member_tracker_state.party_member_id
    )
  );

create policy "party_member_tracker_state_delete" on party_member_tracker_state
  for delete using (is_campaign_dm(campaign_id));
