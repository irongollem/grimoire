-- The story tools of the Canon review (#1255 items 11, 17, 20, 21 and 31; maintainer, 23 Nov 2026: "all those
-- suggestions seem good, so implement them"). Each section says what it is for; the proposals they follow are in the
-- epic's comments.
--
--  1. Arcs (11): the one grouping of the canon. An entry belongs to at most one arc.
--  2. Deleted entries (17): deleting a canon entry from the page keeps it, with everything that hangs off it, for
--     thirty days, and Restore brings it back. Kept as a snapshot in its own table rather than as a flag on the row,
--     so no reader of the canon (the player's journal, the world block, the Narrator, search, the world web, the
--     book import, MCP) has to learn to leave deleted rows out: a deleted entry is simply not in canon_entries.
--  3. A quest clock that moves a force (20): when its clock ticks, the force's clock ticks the same way, at commit of
--     the same write, whatever ticked it (the run screen, a rule, an undo).
--  4. A beat tied to a canon secret (21): the quest beat's secret is the canon secret's, written once.
--  5. Ecology (31): the world's habitats, the places each covers, and what lives in each as shares, rolled in code
--     like the peoples; a truth may belong to a habitat.
--
-- Everything here is the DM's: players read none of it, and no audience rule changes.

-- ── 1. Arcs ─────────────────────────────────────────────────────────────────
create table public.canon_arcs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null constraint canon_arcs_name_length check (char_length(btrim(name)) between 1 and 80),
  summary text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index canon_arcs_campaign_idx on public.canon_arcs (campaign_id, sort_order);
create index canon_arcs_user_idx on public.canon_arcs (user_id);

create trigger canon_arcs_updated_at
  before update on public.canon_arcs
  for each row execute procedure update_updated_at();

alter table public.canon_entries
  add column arc_id uuid references public.canon_arcs (id) on delete set null,
  -- The premise is the whole campaign's, never one arc's.
  add constraint canon_entries_premise_has_no_arc check (arc_id is null or part <> 'premise');
create index canon_entries_arc_idx on public.canon_entries (arc_id) where arc_id is not null;

-- ── 2. Deleted entries ──────────────────────────────────────────────────────
-- One row per deleted entry: who and where, its title for the list, and a snapshot of the entry and everything that
-- hangs off it (passages, steps, ticks, clues, quest ties, world links) plus the pointers other rows held to it, so a
-- restore puts the pointers back too. Kept thirty days (purge-canon-trash, below; context/compliance/retention.md).
create table public.canon_trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- The id the entry comes back as. Not a foreign key: the entry does not exist while it is here.
  entry_id uuid not null,
  part text not null,
  title text not null,
  snapshot jsonb not null,
  deleted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index canon_trash_campaign_idx on public.canon_trash (campaign_id, deleted_at desc);
create index canon_trash_user_idx on public.canon_trash (user_id);
create index canon_trash_deleted_idx on public.canon_trash (deleted_at);

create trigger canon_trash_updated_at
  before update on public.canon_trash
  for each row execute procedure update_updated_at();

-- ── 3. A quest clock that moves a force ─────────────────────────────────────
alter table public.quest_clocks
  add column moves_force_id uuid references public.canon_entries (id) on delete set null;
create index quest_clocks_moves_force_idx on public.quest_clocks (moves_force_id) where moves_force_id is not null;
-- The DM writes a clock's label, size and order directly and moves its fill only through tick_quest_clock; which
-- force it moves is one more column they write.
grant update (moves_force_id) on public.quest_clocks to authenticated;

create trigger quest_clocks_move_a_force
  before insert or update of moves_force_id on public.quest_clocks
  for each row when (new.moves_force_id is not null)
  execute procedure private.canon_child_belongs_to('force', 'moves_force_id');

create trigger zz_same_campaign_refs
  before insert or update of moves_force_id, campaign_id on public.quest_clocks
  for each row execute procedure private.enforce_same_campaign_refs('moves_force_id', 'canon_entries', 'owned');

-- The force's clock moves by exactly what the quest clock moved, forward or back, with the clock's name as the reason,
-- the open session and today's date in the world (only when a calendar was chosen: the stored 1/1/1 of a campaign
-- with none is a default, not a day in the story). An ended force does not move. Invoker: a DM's own write ticks the
-- force as that DM; a rule firing inside a definer runs as its owner.
create function private.quest_clock_moves_its_force()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_force public.canon_entries;
  v_campaign public.campaigns;
  v_session uuid;
begin
  if new.moves_force_id is null or new.filled = old.filled then
    return null;
  end if;
  select * into v_force from public.canon_entries e
   where e.id = new.moves_force_id and e.part = 'force' and e.closed_as is null;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns c where c.id = new.campaign_id;
  select s.id into v_session from public.campaign_sessions s
   where s.campaign_id = new.campaign_id and s.started_at is not null and s.ended_at is null
   order by s.started_at desc limit 1;
  insert into public.canon_force_ticks (user_id, campaign_id, force_id, delta, note, session_id, world_year, world_month, world_day)
  values (
    coalesce((select auth.uid()), v_force.user_id), new.campaign_id, v_force.id, new.filled - old.filled,
    'Quest clock: ' || new.label, v_session,
    case when v_campaign.calendar_id is not null then v_campaign.current_year end,
    case when v_campaign.calendar_id is not null then v_campaign.current_month end,
    case when v_campaign.calendar_id is not null then v_campaign.current_day end
  );
  return null;
end;
$$;
revoke execute on function private.quest_clock_moves_its_force() from public, anon, authenticated;

create trigger quest_clocks_move_their_force
  after update of filled on public.quest_clocks
  for each row execute procedure private.quest_clock_moves_its_force();

-- ── 4. A beat tied to a canon secret ────────────────────────────────────────
alter table public.quest_beats
  add column canon_secret_id uuid references public.canon_entries (id) on delete set null;
create index quest_beats_canon_secret_idx on public.quest_beats (canon_secret_id) where canon_secret_id is not null;

create trigger quest_beats_tie_a_secret
  before insert or update of canon_secret_id on public.quest_beats
  for each row when (new.canon_secret_id is not null)
  execute procedure private.canon_child_belongs_to('secret', 'canon_secret_id');

drop trigger zz_same_campaign_refs on public.quest_beats;
create trigger zz_same_campaign_refs
  before insert or update of staged_at_location_id, canon_secret_id, campaign_id on public.quest_beats
  for each row execute procedure private.enforce_same_campaign_refs(
    'staged_at_location_id', 'locations', 'owned',
    'canon_secret_id', 'canon_entries', 'owned');

comment on column public.quest_beats.canon_secret_id is
  'The canon secret this beat''s secret is (#1255): the beat shows its words, and revealing the beat offers to reveal it. Never in a player projection.';

-- ── 5. Ecology ──────────────────────────────────────────────────────────────
create table public.campaign_habitats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null constraint campaign_habitats_name_length check (char_length(btrim(name)) between 1 and 80),
  -- Rich text (Tiptap JSON), the DM's description of this kind of country.
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_habitats_campaign_idx on public.campaign_habitats (campaign_id, sort_order);
create index campaign_habitats_user_idx on public.campaign_habitats (user_id);
create trigger campaign_habitats_updated_at
  before update on public.campaign_habitats
  for each row execute procedure update_updated_at();

-- The Atlas places a habitat covers. A place lies in at most one habitat; a place inside it (a room of a covered
-- town) is in it too unless it is covered itself, which is the reader's rule, not a row per room.
create table public.campaign_habitat_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  habitat_id uuid not null references public.campaign_habitats (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_habitat_places_one_habitat unique (location_id)
);
create index campaign_habitat_places_habitat_idx on public.campaign_habitat_places (habitat_id);
create index campaign_habitat_places_campaign_idx on public.campaign_habitat_places (campaign_id);
create index campaign_habitat_places_user_idx on public.campaign_habitat_places (user_id);
create trigger campaign_habitat_places_updated_at
  before update on public.campaign_habitat_places
  for each row execute procedure update_updated_at();

-- What lives in a habitat, as shares, the way campaign_peoples does for people: a bestiary creature (the DM's own, or
-- a shared book's) and its percent. What the shares leave over is "anything else".
create table public.campaign_habitat_life (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  habitat_id uuid not null references public.campaign_habitats (id) on delete cascade,
  monster_id uuid references public.monsters (id) on delete cascade,
  library_monster_id text,
  percent numeric(5, 2) not null constraint campaign_habitat_life_percent check (percent >= 0 and percent <= 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_habitat_life_one_creature check (num_nonnulls(monster_id, library_monster_id) = 1)
);
create unique index campaign_habitat_life_monster_once on public.campaign_habitat_life (habitat_id, monster_id) where monster_id is not null;
create unique index campaign_habitat_life_library_once on public.campaign_habitat_life (habitat_id, library_monster_id) where library_monster_id is not null;
create index campaign_habitat_life_habitat_idx on public.campaign_habitat_life (habitat_id, sort_order);
create index campaign_habitat_life_campaign_idx on public.campaign_habitat_life (campaign_id);
create index campaign_habitat_life_user_idx on public.campaign_habitat_life (user_id);
create index campaign_habitat_life_monster_idx on public.campaign_habitat_life (monster_id) where monster_id is not null;
create trigger campaign_habitat_life_updated_at
  before update on public.campaign_habitat_life
  for each row execute procedure update_updated_at();

-- A shared book's creature id is text, checked on write here and in production by content_integrity.sql.
create function private.campaign_habitat_life_library_id_exists()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.library_monster_id is not null
     and not exists (select 1 from public.library_monsters m where m.id = new.library_monster_id) then
    raise exception using errcode = '23503', message = 'campaign_habitat_life.library_monster_id names no creature in the library';
  end if;
  return new;
end;
$$;
revoke execute on function private.campaign_habitat_life_library_id_exists() from public, anon, authenticated;
create trigger campaign_habitat_life_library_id_exists
  before insert or update of library_monster_id on public.campaign_habitat_life
  for each row execute procedure private.campaign_habitat_life_library_id_exists();

-- A habitat's shares never pass a hundred: at commit, one checker per habitat at a time (the peoples' rule).
create function private.campaign_habitat_life_within_hundred()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('campaign_habitat_life:' || new.habitat_id::text, 0));
  select coalesce(sum(l.percent), 0) into v_total from public.campaign_habitat_life l where l.habitat_id = new.habitat_id;
  if v_total > 100 then
    raise exception using errcode = '23514',
      message = format('What lives in a habitat adds up to %s%%: it cannot pass 100%%', trim_scale(v_total));
  end if;
  return null;
end;
$$;
revoke execute on function private.campaign_habitat_life_within_hundred() from public, anon, authenticated;
create constraint trigger campaign_habitat_life_within_hundred
  after insert or update of percent, habitat_id on public.campaign_habitat_life
  deferrable initially deferred
  for each row execute procedure private.campaign_habitat_life_within_hundred();

-- Same campaign for every reference a DM writes.
create trigger zz_same_campaign_refs
  before insert or update of habitat_id, location_id, campaign_id on public.campaign_habitat_places
  for each row execute procedure private.enforce_same_campaign_refs(
    'habitat_id', 'campaign_habitats', 'owned',
    'location_id', 'locations', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of habitat_id, monster_id, campaign_id on public.campaign_habitat_life
  for each row execute procedure private.enforce_same_campaign_refs(
    'habitat_id', 'campaign_habitats', 'owned',
    'monster_id', 'monsters', 'owned');

-- What lives in each habitat by name, for the screen, the roll and the world block. An invoker view: the row stays
-- when its creature is not this reader's to name (a co-DM's own), so the shares still add up.
create view public.campaign_habitat_life_named
with (security_invoker = true) as
select l.id, l.campaign_id, l.habitat_id, l.percent, l.sort_order,
       coalesce(l.monster_id::text, l.library_monster_id) as record_id,
       l.monster_id is null as from_library,
       coalesce(m.name, lm.name) as name
  from public.campaign_habitat_life l
  left join public.monsters m on m.id = l.monster_id
  left join public.library_monsters lm on lm.id = l.library_monster_id;

-- A truth may belong to a habitat ("wolves have not been seen south of the river"): shown under it in Ecology and
-- still among the truths, told to players exactly as any truth is.
alter table public.canon_entries
  add column habitat_id uuid references public.campaign_habitats (id) on delete set null,
  add constraint canon_entries_only_a_truth_has_a_habitat check (habitat_id is null or part = 'truth');
create index canon_entries_habitat_idx on public.canon_entries (habitat_id) where habitat_id is not null;

-- ── Every reference of a canon entry stays in its campaign ─────────────────
drop trigger zz_same_campaign_refs on public.canon_entries;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, became_entry_id, from_fact_id, arc_id, habitat_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs(
    'party_member_id', 'party_members', 'owned',
    'became_entry_id', 'canon_entries', 'owned',
    'from_fact_id', 'story_facts', 'owned',
    'arc_id', 'canon_arcs', 'owned',
    'habitat_id', 'campaign_habitats', 'owned');

-- ── Access: the DMs of the campaign, one policy per command ────────────────
alter table public.canon_arcs enable row level security;
create policy "canon_arcs_select" on public.canon_arcs for select using (private.is_campaign_dm(campaign_id));
create policy "canon_arcs_insert" on public.canon_arcs for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_arcs_update" on public.canon_arcs for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_arcs_delete" on public.canon_arcs for delete using (private.is_campaign_dm(campaign_id));

-- The trash is read, filled and emptied, never edited: a snapshot is what was deleted, so it has no update policy.
alter table public.canon_trash enable row level security;
create policy "canon_trash_select" on public.canon_trash for select using (private.is_campaign_dm(campaign_id));
create policy "canon_trash_insert" on public.canon_trash for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_trash_delete" on public.canon_trash for delete using (private.is_campaign_dm(campaign_id));

alter table public.campaign_habitats enable row level security;
create policy "campaign_habitats_select" on public.campaign_habitats for select using (private.is_campaign_dm(campaign_id));
create policy "campaign_habitats_insert" on public.campaign_habitats for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "campaign_habitats_update" on public.campaign_habitats for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "campaign_habitats_delete" on public.campaign_habitats for delete using (private.is_campaign_dm(campaign_id));

alter table public.campaign_habitat_places enable row level security;
create policy "campaign_habitat_places_select" on public.campaign_habitat_places for select using (private.is_campaign_dm(campaign_id));
create policy "campaign_habitat_places_insert" on public.campaign_habitat_places for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "campaign_habitat_places_update" on public.campaign_habitat_places for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "campaign_habitat_places_delete" on public.campaign_habitat_places for delete using (private.is_campaign_dm(campaign_id));

alter table public.campaign_habitat_life enable row level security;
create policy "campaign_habitat_life_select" on public.campaign_habitat_life for select using (private.is_campaign_dm(campaign_id));
create policy "campaign_habitat_life_insert" on public.campaign_habitat_life for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "campaign_habitat_life_update" on public.campaign_habitat_life for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "campaign_habitat_life_delete" on public.campaign_habitat_life for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_arcs to authenticated, service_role;
grant select, insert, delete on public.canon_trash to authenticated;
grant select, insert, update, delete on public.canon_trash to service_role;
grant select, insert, update, delete on public.campaign_habitats to authenticated, service_role;
grant select, insert, update, delete on public.campaign_habitat_places to authenticated, service_role;
grant select, insert, update, delete on public.campaign_habitat_life to authenticated, service_role;
grant select on public.campaign_habitat_life_named to authenticated, service_role;

-- ── Live: each rings the campaign doorbell ─────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['canon_arcs', 'canon_trash', 'campaign_habitats', 'campaign_habitat_places', 'campaign_habitat_life'] loop
    execute format('create trigger %1$s_signal_insert after insert on public.%1$I referencing new table as changed for each statement execute procedure signal_campaign_change()', t);
    execute format('create trigger %1$s_signal_update after update on public.%1$I referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change()', t);
    execute format('create trigger %1$s_signal_delete after delete on public.%1$I referencing old table as changed for each statement execute procedure signal_campaign_change()', t);
    execute format('create trigger %1$s_guard_content_author before update on public.%1$I for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id) execute procedure private.guard_content_author()', t);
  end loop;
end $$;

-- ── The demo copy ──────────────────────────────────────────────────────────
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('canon_arcs', 1, true, null),
  ('campaign_habitats', 1, true, null),
  ('campaign_habitat_places', 1, true, null),
  ('campaign_habitat_life', 1, true, null),
  ('canon_trash', 1, false, 'what the author deleted is not part of the template');

-- ── Deleting and restoring ─────────────────────────────────────────────────
-- Puts rows back from a snapshot. Each row is written as the restoring DM (`user_id`; a passage keeps its author),
-- only the columns the snapshot holds are written (a column added since takes its default), and a single-column
-- reference to a row that is gone is emptied when it may be, or the row is skipped when it may not (a quest tie
-- whose quest was deleted). Invoker: every write is the caller's, under their own policies. Only the canon's tables.
create function private.canon_restore_rows(p_table text, p_rows jsonb, p_user uuid, p_required boolean)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_fk record;
  v_cols text;
  v_written integer := 0;
  v_ok boolean;
  v_exists boolean;
begin
  if p_table not in ('canon_entries', 'canon_lore_passages', 'canon_force_steps', 'canon_force_ticks', 'canon_clues',
                     'canon_entry_quests', 'world_links') then
    raise exception 'canon_restore_rows: % is not a canon table', p_table;
  end if;
  for v_row in select e from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e loop
    v_row := v_row || jsonb_build_object('user_id', p_user);
    v_ok := true;
    for v_fk in
      select a.attname as col, rc.relname as ref_table, ra.attname as ref_col, not a.attnotnull as nullable
        from pg_constraint con
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
        join pg_class rc on rc.oid = con.confrelid
        join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = con.confkey[1]
       where con.conrelid = format('public.%I', p_table)::regclass and con.contype = 'f'
         and cardinality(con.conkey) = 1 and a.attname <> 'user_id'
    loop
      continue when v_row ->> v_fk.col is null;
      execute format('select exists (select 1 from %s where %I = $1::%s)',
                     case when v_fk.ref_table = 'users' then 'auth.users' else format('public.%I', v_fk.ref_table) end,
                     v_fk.ref_col,
                     (select format_type(atttypid, atttypmod) from pg_attribute
                       where attrelid = format('public.%I', p_table)::regclass and attname = v_fk.col))
        into v_exists using v_row ->> v_fk.col;
      continue when v_exists;
      if v_fk.nullable then
        v_row := v_row || jsonb_build_object(v_fk.col, null);
      else
        v_ok := false;
      end if;
    end loop;
    if not v_ok then
      if p_required then
        raise exception using errcode = '23503', message = format('The %s this belonged to is gone', replace(p_table, '_', ' '));
      end if;
      continue;
    end if;
    select string_agg(quote_ident(c.column_name), ', ') into v_cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = p_table and c.is_generated = 'NEVER'
       and c.column_name in (select jsonb_object_keys(v_row));
    if p_required then
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', p_table, v_cols, v_cols, p_table)
        using v_row;
    else
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', p_table, v_cols, v_cols, p_table)
          using v_row;
      exception when others then
        continue;
      end;
    end if;
    v_written := v_written + 1;
  end loop;
  return v_written;
end;
$$;
revoke execute on function private.canon_restore_rows(text, jsonb, uuid, boolean) from public, anon;
grant execute on function private.canon_restore_rows(text, jsonb, uuid, boolean) to authenticated, service_role;

-- Deletes an entry into the trash. Invoker: the caller reads the entry and its rows, and deletes it, under their own
-- policies, so only a DM of its campaign can; anyone else finds nothing to delete.
create function public.trash_canon_entry(p_entry_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.canon_entries;
  v_passage_ids uuid[];
  v_trash uuid;
begin
  select * into v_entry from public.canon_entries e where e.id = p_entry_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'That canon entry is gone, or it is not yours to delete.';
  end if;
  select coalesce(array_agg(p.id), '{}') into v_passage_ids from public.canon_lore_passages p where p.entry_id = p_entry_id;
  insert into public.canon_trash (campaign_id, entry_id, part, title, snapshot)
  values (
    v_entry.campaign_id, v_entry.id, v_entry.part, v_entry.title,
    jsonb_build_object(
      'entry', to_jsonb(v_entry),
      'passages', (select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order), '[]') from public.canon_lore_passages p where p.entry_id = p_entry_id),
      'steps', (select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]') from public.canon_force_steps s where s.force_id = p_entry_id),
      'ticks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.canon_force_ticks t where t.force_id = p_entry_id),
      'clues', (select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]') from public.canon_clues c where c.secret_id = p_entry_id),
      'quests', (select coalesce(jsonb_agg(to_jsonb(q)), '[]') from public.canon_entry_quests q where q.entry_id = p_entry_id),
      'links', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.world_links l
                 where l.from_canon_entry_id = p_entry_id or l.to_canon_entry_id = p_entry_id),
      -- What other rows pointed at it, emptied by the delete and put back by a restore.
      'became_from', (select coalesce(jsonb_agg(e.id), '[]') from public.canon_entries e where e.became_entry_id = p_entry_id),
      'clue_passages', (select coalesce(jsonb_agg(jsonb_build_object('clue', c.id, 'passage', c.passage_id)), '[]')
                          from public.canon_clues c where c.passage_id = any (v_passage_ids) and c.secret_id <> p_entry_id),
      'beats', (select coalesce(jsonb_agg(b.id), '[]') from public.quest_beats b where b.canon_secret_id = p_entry_id),
      'clocks', (select coalesce(jsonb_agg(k.id), '[]') from public.quest_clocks k where k.moves_force_id = p_entry_id)
    )
  )
  returning id into v_trash;
  delete from public.canon_entries where id = p_entry_id;
  return v_trash;
end;
$$;
revoke execute on function public.trash_canon_entry(uuid) from public, anon;
grant execute on function public.trash_canon_entry(uuid) to authenticated, service_role;

-- Brings a deleted entry back, as the DM who restores it. Invoker, like the delete.
create function public.restore_canon_entry(p_trash_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_trash public.canon_trash;
  v_user uuid := (select auth.uid());
  v_snap jsonb;
  v_entry_id uuid;
begin
  select * into v_trash from public.canon_trash t where t.id = p_trash_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'That deleted entry is gone, or it is not yours to restore.';
  end if;
  v_snap := v_trash.snapshot;
  v_entry_id := v_trash.entry_id;
  if v_snap #>> '{entry,party_member_id}' is not null and exists (
       select 1 from public.canon_entries e where e.party_member_id = (v_snap #>> '{entry,party_member_id}')::uuid) then
    raise exception using errcode = '23505', message = 'This character has a backstory again. Delete that one first to bring this one back.';
  end if;
  perform private.canon_restore_rows('canon_entries', jsonb_build_array(v_snap -> 'entry'), v_user, true);
  perform private.canon_restore_rows('canon_lore_passages', v_snap -> 'passages', v_user, false);
  perform private.canon_restore_rows('canon_force_steps', v_snap -> 'steps', v_user, false);
  perform private.canon_restore_rows('canon_force_ticks', v_snap -> 'ticks', v_user, false);
  perform private.canon_restore_rows('canon_clues', v_snap -> 'clues', v_user, false);
  perform private.canon_restore_rows('canon_entry_quests', v_snap -> 'quests', v_user, false);
  perform private.canon_restore_rows('world_links', v_snap -> 'links', v_user, false);
  -- The pointers the delete emptied, where the row is still there and has not been pointed elsewhere since.
  update public.canon_entries e set became_entry_id = v_entry_id
   where e.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_snap -> 'became_from') x) and e.became_entry_id is null;
  update public.canon_clues c set passage_id = (x ->> 'passage')::uuid
    from jsonb_array_elements(v_snap -> 'clue_passages') x
   where c.id = (x ->> 'clue')::uuid and c.passage_id is null
     and exists (select 1 from public.canon_lore_passages p where p.id = (x ->> 'passage')::uuid);
  update public.quest_beats b set canon_secret_id = v_entry_id
   where b.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_snap -> 'beats') x) and b.canon_secret_id is null;
  update public.quest_clocks k set moves_force_id = v_entry_id
   where k.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_snap -> 'clocks') x) and k.moves_force_id is null;
  delete from public.canon_trash where id = p_trash_id;
  return v_entry_id;
end;
$$;
revoke execute on function public.restore_canon_entry(uuid) from public, anon;
grant execute on function public.restore_canon_entry(uuid) to authenticated, service_role;

-- Thirty days, then gone for good (context/compliance/retention.md).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-canon-trash') then
    perform cron.unschedule('purge-canon-trash');
  end if;
end $$;
select cron.schedule(
  'purge-canon-trash',
  '33 4 * * *',  -- daily, in the 04:00-04:40 retention window, after the retention purge
  $$ delete from public.canon_trash where deleted_at < now() - interval '30 days'; $$
);

-- ── Handing a campaign on ──────────────────────────────────────────────────
-- The mover behind an ownership transfer, restated whole as it stands today with the five new tables added beside
-- the rest of the canon: their user_id cascades from the account, so left behind they would be deleted with it.
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
  update public.canon_entry_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_peoples      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_arcs             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_trash            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitats      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitat_places set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitat_life  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_lore_passages   set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  -- Who wrote a passage moves with it (#1226 story 10): the journal tells a DM's passage from the player's
  -- by its author, so a passage the outgoing owner wrote must stay the DM's words.
  update public.canon_lore_passages   set author_id = p_to where campaign_id = p_campaign_id and author_id = p_from;
  update public.note_sorting          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
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

comment on table public.canon_arcs is 'The arcs of a campaign''s canon: the one grouping an entry may belong to (#1255).';
comment on table public.canon_trash is 'Canon entries deleted in the last thirty days, each with a snapshot to restore it from (#1255).';
comment on table public.campaign_habitats is 'The kinds of country in a campaign''s world, for its ecology (#1255).';
comment on table public.campaign_habitat_places is 'The Atlas places a habitat covers; a place lies in at most one (#1255).';
comment on table public.campaign_habitat_life is 'What lives in a habitat, as shares of bestiary creatures, rolled in code (#1255).';
