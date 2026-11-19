-- Level milestones (#1021 row 27, levels proposal, 19 Nov 2026).
--
-- In a campaign that levels by milestone, the party gains a level when the story reaches a point the DM chose. The
-- maintainer: "often times its like when 3 large quests are completed which is harder to manage as players get to
-- pick their own sequence". So a milestone is "level N when any K of these are done", where each item is a whole quest
-- (done when completed) or one objective of a quest (done when complete), counted in whatever order they happen.
-- When the count is reached the milestone is reached, the campaign's party level rises to N (never down), and the
-- table hears it in chat. A character below the party level may then be levelled up by its player.
--
-- The deed records that were called milestones (`party_milestones`) are unrelated and stay as they are; on screen
-- they are now Deeds.

-- The level the party has reached by milestone; null until the DM sets a starting level or a milestone is reached.
-- Read by every member (the campaign row is), so a player's sheet knows whether its character may level up.
alter table public.campaigns
  add column party_level smallint check (party_level between 1 and 20);

comment on column public.campaigns.party_level is
  'The level the party has reached by milestone (#1021 row 27); a character below it may level up. Raised by private.reach_level_milestones, never lowered by it; the DM may set it by hand.';

create table public.level_milestones (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The level the party reaches with it. One milestone per level and campaign.
  level smallint not null check (level between 2 and 20),
  -- How many of its items must be done: "any 3 of these 5".
  needs smallint not null check (needs between 1 and 50),
  -- A line for the DM, shown with it ("the three great houses").
  note text check (note is null or char_length(note) <= 280),
  -- When the count was first reached; null while it is still ahead.
  reached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, level)
);

create index level_milestones_user_idx on public.level_milestones (user_id);

create trigger level_milestones_updated_at
  before update on public.level_milestones
  for each row execute procedure update_updated_at();

create table public.level_milestone_steps (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.level_milestones (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Exactly one: a whole quest, or one objective of a quest.
  quest_id uuid references public.quests (id) on delete cascade,
  objective_id uuid references public.quest_objectives (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(quest_id, objective_id) = 1),
  unique (milestone_id, quest_id),
  unique (milestone_id, objective_id)
);

create index level_milestone_steps_milestone_idx on public.level_milestone_steps (milestone_id);
create index level_milestone_steps_campaign_idx on public.level_milestone_steps (campaign_id);
create index level_milestone_steps_user_idx on public.level_milestone_steps (user_id);
create index level_milestone_steps_quest_idx on public.level_milestone_steps (quest_id) where quest_id is not null;
create index level_milestone_steps_objective_idx on public.level_milestone_steps (objective_id) where objective_id is not null;

create trigger level_milestone_steps_updated_at
  before update on public.level_milestone_steps
  for each row execute procedure update_updated_at();

-- A step names a milestone and a quest of its own campaign, through the shared check. An objective has no campaign
-- column, so its quest's campaign is checked below.
create trigger zz_same_campaign_refs
  before insert or update of milestone_id, quest_id, campaign_id
  on public.level_milestone_steps
  for each row execute function private.enforce_same_campaign_refs(
    'milestone_id', 'level_milestones', 'owned',
    'quest_id', 'quests', 'owned'
  );

create or replace function private.guard_level_milestone_step()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.objective_id is not null and not exists (
    select 1 from public.quest_objectives o join public.quests q on q.id = o.quest_id
     where o.id = new.objective_id and q.campaign_id = new.campaign_id
  ) then
    raise exception 'A milestone step names an objective of its own campaign' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_level_milestone_step() from public, anon, authenticated;

create trigger level_milestone_steps_guard
  before insert or update of objective_id, campaign_id on public.level_milestone_steps
  for each row execute procedure private.guard_level_milestone_step();

-- ── Reaching a milestone ─────────────────────────────────────────────────────
-- Counts each unreached milestone's done items and reaches those whose count is met, in level order. Definer: it
-- runs from a quest or objective changing, whoever changed it (the DM's run screen, the AI table's server), and
-- writes the campaign's party level and a chat line, which those writers may not write directly. It reads and writes
-- only the one campaign it is given, and no client can call it.
create or replace function private.reach_level_milestones(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_milestone record;
  v_done integer;
  v_owner uuid;
  v_before smallint;
  v_after smallint;
begin
  if p_campaign_id is null then
    return;
  end if;
  select user_id into v_owner from public.campaigns where id = p_campaign_id;
  if v_owner is null then
    return;
  end if;

  for v_milestone in
    select m.id, m.level, m.needs from public.level_milestones m
     where m.campaign_id = p_campaign_id and m.reached_at is null
     order by m.level
  loop
    select count(*) into v_done
      from public.level_milestone_steps s
      left join public.quests q on q.id = s.quest_id
      left join public.quest_objectives o on o.id = s.objective_id
     where s.milestone_id = v_milestone.id
       and (q.status = 'completed' or o.status = 'complete');

    if v_done >= v_milestone.needs then
      update public.level_milestones set reached_at = now() where id = v_milestone.id;
      select party_level into v_before from public.campaigns where id = p_campaign_id;
      update public.campaigns
         set party_level = greatest(coalesce(party_level, 1), v_milestone.level)
       where id = p_campaign_id
      returning party_level into v_after;
      -- Told only when the level really rose: a milestone at or below a level the DM already set changes nothing.
      if v_after is distinct from v_before and v_after > coalesce(v_before, 1) then
        insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
        values (p_campaign_id, v_owner, 'Grimoire', '⭐ The party reaches level ' || v_after || '.', 'system');
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function private.reach_level_milestones(uuid) from public, anon, authenticated;

create or replace function private.reach_level_milestones_on_quest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.reach_level_milestones(new.campaign_id);
  end if;
  return null;
end;
$$;

create or replace function private.reach_level_milestones_on_objective()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.reach_level_milestones((select q.campaign_id from public.quests q where q.id = new.quest_id));
  end if;
  return null;
end;
$$;

-- A milestone added or made easier, or an item added, may already be met (the quests are done): reached at once.
create or replace function private.reach_level_milestones_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reach_level_milestones(new.campaign_id);
  return null;
end;
$$;

-- The three triggers are definers so that the counting they call (which no client may call itself) runs for
-- whoever changed the quest; each passes on only the campaign of the row that changed.
revoke execute on function private.reach_level_milestones_on_quest() from public, anon, authenticated;
revoke execute on function private.reach_level_milestones_on_objective() from public, anon, authenticated;
revoke execute on function private.reach_level_milestones_on_edit() from public, anon, authenticated;

create trigger quests_reach_level_milestones
  after update of status on public.quests
  for each row execute procedure private.reach_level_milestones_on_quest();
create trigger quest_objectives_reach_level_milestones
  after update of status on public.quest_objectives
  for each row execute procedure private.reach_level_milestones_on_objective();
create trigger level_milestones_reach
  after insert or update of needs, level on public.level_milestones
  for each row execute procedure private.reach_level_milestones_on_edit();
create trigger level_milestone_steps_reach
  after insert on public.level_milestone_steps
  for each row execute procedure private.reach_level_milestones_on_edit();

-- ── Access ──────────────────────────────────────────────────────────────────
-- The DM's alone, both tables: a milestone names quests and objectives the players may not have found yet. Players
-- see what it brings (the party level on the campaign row, the line in chat), never what it waits on.
alter table public.level_milestones enable row level security;
create policy "level_milestones_select" on public.level_milestones
  for select using (private.is_campaign_dm(campaign_id));
create policy "level_milestones_insert" on public.level_milestones
  for insert with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "level_milestones_update" on public.level_milestones
  for update using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "level_milestones_delete" on public.level_milestones
  for delete using (private.is_campaign_dm(campaign_id));

alter table public.level_milestone_steps enable row level security;
create policy "level_milestone_steps_select" on public.level_milestone_steps
  for select using (private.is_campaign_dm(campaign_id));
create policy "level_milestone_steps_insert" on public.level_milestone_steps
  for insert with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "level_milestone_steps_update" on public.level_milestone_steps
  for update using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "level_milestone_steps_delete" on public.level_milestone_steps
  for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.level_milestones to authenticated, service_role;
grant select, insert, update, delete on public.level_milestone_steps to authenticated, service_role;

-- ── Live ────────────────────────────────────────────────────────────────────
create trigger level_milestones_signal_insert
  after insert on public.level_milestones
  referencing new table as changed
  for each statement execute function signal_campaign_change();
create trigger level_milestones_signal_update
  after update on public.level_milestones
  referencing old table as left_rows new table as changed
  for each statement execute function signal_campaign_change();
create trigger level_milestones_signal_delete
  after delete on public.level_milestones
  referencing old table as changed
  for each statement execute function signal_campaign_change();
create trigger level_milestone_steps_signal_insert
  after insert on public.level_milestone_steps
  referencing new table as changed
  for each statement execute function signal_campaign_change();
create trigger level_milestone_steps_signal_update
  after update on public.level_milestone_steps
  referencing old table as left_rows new table as changed
  for each statement execute function signal_campaign_change();
create trigger level_milestone_steps_signal_delete
  after delete on public.level_milestone_steps
  referencing old table as changed
  for each statement execute function signal_campaign_change();

-- ── Demo copy ───────────────────────────────────────────────────────────────
-- Prep, not play: a demo campaign's milestones come with it (the copy remaps every id).
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, defer_columns, reason)
values
  ('level_milestones', 1, null, null, true, '{}', null),
  ('level_milestone_steps', 1, null, null, true, '{}', null);

-- ── Saving one ──────────────────────────────────────────────────────────────
-- The DM's editor saves a milestone and its items in one call, so a half-saved edit never counts. The order is what
-- keeps an edit from reaching a milestone on the way: items dropped first (a drop never reaches anything), then the
-- level and count, then items added. Every state in between counts no more done items than the final one against the
-- same count, so a milestone is reached during the save only when the saved milestone is met. Invoker: the DM-only
-- policies above decide who may write.
create or replace function public.save_level_milestone(
  p_campaign_id uuid,
  p_milestone_id uuid,
  p_level smallint,
  p_needs smallint,
  p_note text,
  p_quest_ids uuid[],
  p_objective_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_milestone_id;
  v_quests uuid[] := coalesce(p_quest_ids, '{}');
  v_objectives uuid[] := coalesce(p_objective_ids, '{}');
begin
  if p_needs > cardinality(v_quests) + cardinality(v_objectives) then
    raise exception 'A milestone cannot need more items than it lists' using errcode = '22023';
  end if;

  if v_id is not null then
    delete from public.level_milestone_steps s
     where s.milestone_id = v_id
       and not (coalesce(s.quest_id = any (v_quests), false) or coalesce(s.objective_id = any (v_objectives), false));
    -- An edited milestone is a new promise: it is counted again from what is done now (and reached at once when that
    -- is enough). Its party level never drops for it; the chat only hears a level that really rises.
    update public.level_milestones
       set level = p_level, needs = p_needs, note = nullif(btrim(p_note), ''), reached_at = null
     where id = v_id and campaign_id = p_campaign_id
    returning id into v_id;
    if v_id is null then
      raise exception 'No such milestone in this campaign' using errcode = 'P0002';
    end if;
  else
    insert into public.level_milestones (campaign_id, user_id, level, needs, note)
    values (p_campaign_id, (select auth.uid()), p_level, p_needs, nullif(btrim(p_note), ''))
    returning id into v_id;
  end if;

  insert into public.level_milestone_steps (milestone_id, campaign_id, user_id, quest_id)
  select v_id, p_campaign_id, (select auth.uid()), q from unnest(v_quests) q
  on conflict (milestone_id, quest_id) do nothing;
  insert into public.level_milestone_steps (milestone_id, campaign_id, user_id, objective_id)
  select v_id, p_campaign_id, (select auth.uid()), o from unnest(v_objectives) o
  on conflict (milestone_id, objective_id) do nothing;

  return v_id;
end;
$$;

revoke execute on function public.save_level_milestone(uuid, uuid, smallint, smallint, text, uuid[], uuid[]) from public, anon;
grant execute on function public.save_level_milestone(uuid, uuid, smallint, smallint, text, uuid[], uuid[]) to authenticated, service_role;
