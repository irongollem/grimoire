-- What is moving (#1226 story 4, frame 06): forces beyond the party, for a DM at a real table.
--
-- A force is a canon entry (`part = 'force'`; its title names who, `wants` says what they want). It has steps in
-- order (the step it has reached is stamped), a clock the DM ticks when the world moves (each tick kept, so the log
-- reads what moved and why, and an undo removes a tick), and the quests where the party meets it. Players never read
-- any of it (`private.canon_entry_seen` already answers false for a force).
--
-- `canon_force_ticks` and `canon_force_quests` are written and removed, never edited, so they carry no updated_at.

-- ── 1. A force says what it wants, and how long its clock is ──────────────────
alter table public.canon_entries
  add column wants text,
  add column clock_size smallint,
  add constraint canon_entries_only_a_force_wants check ((wants is null and clock_size is null) or part = 'force'),
  add constraint canon_entries_clock_size check (clock_size is null or clock_size between 2 and 12);

-- ── 2. A child row hangs off the right part ───────────────────────────────────
-- One check for every child table of the canon: the row's parent entry is of the part it names.
create function private.canon_child_belongs_to()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_part text := tg_argv[0];
  v_parent uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
begin
  if not exists (select 1 from public.canon_entries e where e.id = v_parent and e.part = v_part) then
    raise exception using errcode = '23514', message = format('This belongs to a canon entry of the part %s', v_part);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_child_belongs_to() from public, anon, authenticated;

-- ── 3. Steps, ticks, quests ───────────────────────────────────────────────────
create table public.canon_force_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  force_id uuid not null references public.canon_entries (id) on delete cascade,
  -- What the force does next, in order ("the Ferrymen buy the bridge").
  title text not null default '',
  sort_order integer not null default 0,
  -- The step the force has reached; nothing is stored about a step it has not.
  reached_at timestamptz,
  reached_session_id uuid references public.campaign_sessions (id) on delete set null,
  ai_provenance jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint canon_force_steps_session_when_reached check (reached_session_id is null or reached_at is not null)
);
create index canon_force_steps_force_idx on public.canon_force_steps (force_id, sort_order);
create index canon_force_steps_campaign_idx on public.canon_force_steps (campaign_id);
create index canon_force_steps_user_idx on public.canon_force_steps (user_id);
create index canon_force_steps_session_idx on public.canon_force_steps (reached_session_id) where reached_session_id is not null;

create trigger canon_force_steps_updated_at
  before update on public.canon_force_steps
  for each row execute procedure update_updated_at();

alter table public.canon_force_steps enable row level security;
create policy "canon_force_steps_select" on public.canon_force_steps for select using (private.is_campaign_dm(campaign_id));
create policy "canon_force_steps_insert" on public.canon_force_steps for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_force_steps_update" on public.canon_force_steps for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_force_steps_delete" on public.canon_force_steps for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_force_steps to authenticated, service_role;

create trigger canon_force_steps_signal_insert after insert on public.canon_force_steps
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_steps_signal_update after update on public.canon_force_steps
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_steps_signal_delete after delete on public.canon_force_steps
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger canon_force_steps_guard_content_author
  before update on public.canon_force_steps
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_force_steps_belong_to_a_force
  before insert or update of force_id on public.canon_force_steps
  for each row execute procedure private.canon_child_belongs_to('force', 'force_id');

create trigger zz_same_campaign_refs
  before insert or update of force_id, reached_session_id, campaign_id
  on public.canon_force_steps
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned', 'reached_session_id', 'campaign_sessions', 'owned');

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_force_steps', 1, true, null);

create table public.canon_force_ticks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  force_id uuid not null references public.canon_entries (id) on delete cascade,
  -- One tick of the force's clock, forward or back (an undo is a tick the other way, or the tick removed).
  delta smallint not null constraint canon_force_ticks_delta check (delta <> 0 and delta between -12 and 12),
  -- Why the world moved ("a week passed", "the party burned the toll-house").
  note text not null default '',
  session_id uuid references public.campaign_sessions (id) on delete set null,
  -- The day in the world it happened, in the campaign's own calendar, when the DM gave one.
  world_year integer,
  world_month integer,
  world_day integer,
  -- The step this tick reached, when reaching a step moved the clock: undoing the tick takes the step back too.
  step_id uuid references public.canon_force_steps (id) on delete set null,
  created_at timestamptz not null default now()
);
create index canon_force_ticks_force_idx on public.canon_force_ticks (force_id, created_at);
create index canon_force_ticks_campaign_idx on public.canon_force_ticks (campaign_id);
create index canon_force_ticks_user_idx on public.canon_force_ticks (user_id);
create index canon_force_ticks_session_idx on public.canon_force_ticks (session_id) where session_id is not null;
create index canon_force_ticks_step_idx on public.canon_force_ticks (step_id) where step_id is not null;

alter table public.canon_force_ticks enable row level security;
create policy "canon_force_ticks_select" on public.canon_force_ticks for select using (private.is_campaign_dm(campaign_id));
create policy "canon_force_ticks_insert" on public.canon_force_ticks for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_force_ticks_update" on public.canon_force_ticks for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_force_ticks_delete" on public.canon_force_ticks for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_force_ticks to authenticated, service_role;

create trigger canon_force_ticks_signal_insert after insert on public.canon_force_ticks
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_ticks_signal_update after update on public.canon_force_ticks
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_ticks_signal_delete after delete on public.canon_force_ticks
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger canon_force_ticks_guard_content_author
  before update on public.canon_force_ticks
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_force_ticks_belong_to_a_force
  before insert or update of force_id on public.canon_force_ticks
  for each row execute procedure private.canon_child_belongs_to('force', 'force_id');

create trigger zz_same_campaign_refs
  before insert or update of force_id, session_id, step_id, campaign_id
  on public.canon_force_ticks
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned', 'session_id', 'campaign_sessions', 'owned',
    'step_id', 'canon_force_steps', 'owned');

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_force_ticks', 1, true, null);

create table public.canon_force_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  force_id uuid not null references public.canon_entries (id) on delete cascade,
  -- A quest where the party meets the force.
  quest_id uuid not null references public.quests (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint canon_force_quests_once unique (force_id, quest_id)
);
create index canon_force_quests_campaign_idx on public.canon_force_quests (campaign_id);
create index canon_force_quests_user_idx on public.canon_force_quests (user_id);
create index canon_force_quests_quest_idx on public.canon_force_quests (quest_id);

alter table public.canon_force_quests enable row level security;
create policy "canon_force_quests_select" on public.canon_force_quests for select using (private.is_campaign_dm(campaign_id));
create policy "canon_force_quests_insert" on public.canon_force_quests for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_force_quests_update" on public.canon_force_quests for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_force_quests_delete" on public.canon_force_quests for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_force_quests to authenticated, service_role;

create trigger canon_force_quests_signal_insert after insert on public.canon_force_quests
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_quests_signal_update after update on public.canon_force_quests
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger canon_force_quests_signal_delete after delete on public.canon_force_quests
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger canon_force_quests_guard_content_author
  before update on public.canon_force_quests
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger canon_force_quests_belong_to_a_force
  before insert or update of force_id on public.canon_force_quests
  for each row execute procedure private.canon_child_belongs_to('force', 'force_id');

create trigger zz_same_campaign_refs
  before insert or update of force_id, quest_id, campaign_id
  on public.canon_force_quests
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned', 'quest_id', 'quests', 'owned');

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('canon_force_quests', 1, true, null);

-- An AI-proposed step is marked edited when its words change, as an entry is.
create function private.canon_force_steps_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.ai_provenance is not null
     and new.ai_provenance is not distinct from old.ai_provenance
     and coalesce((old.ai_provenance ->> 'edited')::boolean, false) = false
     and new.title is distinct from old.title then
    new.ai_provenance := jsonb_set(old.ai_provenance, '{edited}', 'true'::jsonb);
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_force_steps_mark_edited() from public, anon, authenticated;

create trigger canon_force_steps_mark_edited
  before update on public.canon_force_steps
  for each row execute procedure private.canon_force_steps_mark_edited();

-- ── 4. Forces change hands with their campaign ────────────────────────────────
-- Restated whole from 20261119231628 with three lines added.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.location_roads        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.story_facts           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entries         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_clues           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_steps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_ticks     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;

-- ── 5. AI help: suggest a force ───────────────────────────────────────────────
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_force_suggestion', 'Force suggestions', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_forces', 'Force Suggestions', $prompt$You help a Dungeon Master name the forces moving in their campaign's world beyond the party: who wants what, and what they will do next if nobody stops them. Propose up to three forces. For each: who (a faction, person or power, preferring ones given, copied exactly), what they want in one line, three to five next steps in order, a clock size from 4 to 8 (how long until the last step), and the quests where the party meets it, chosen ONLY from the quests given, copied exactly.

Rules:
- A force moves on its own; its steps are things that happen in the world whether or not the party acts.
- Fit the premise, tone and truths given; never contradict a truth, and never answer an open question.
- Never repeat a force the campaign already has.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the forces.$prompt$)
on conflict (generator_type) do nothing;
