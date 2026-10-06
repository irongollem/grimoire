-- The session log (#985). Design: Session log canvas; decisions in #985.
--
-- The app could not answer "which session was that?". `campaign_session_state`
-- was one row per campaign that every Start overwrote: it knew whether a game
-- was running and nothing about the ones before, so `encounter_state.session_id`
-- pointed at the same row for every combat ever run. Session numbers lived only
-- on session notes (`notes.session_num`), typed by hand when a note was written.
--
-- Now a session is a row in a log:
--
--   * `number` is a label the DM gives it, never a key. Nothing advances it on
--     its own, and three sessions called "2" are fine (a test start, a one-shot,
--     a typo): nothing is unique on it, sorts on it alone, or joins on it.
--   * A game is running when a session is still open (started, not ended); at
--     most one per campaign. This replaces `campaign_session_state` outright.
--   * A session note links to its session (`notes.session_id`); the number moves
--     off the note. The 19 numbered session notes in production become sessions
--     dated by their real date, two of them sharing a number, as the log allows.
--   * A scheduled session points at the session it became
--     (`session_proposals.session_id`). The link lives on the proposal because
--     the demo copy copies sessions and never proposals: a copied row may only
--     reference copied rows.
--
-- What the party learned in each session (people, places, handouts, creatures,
-- quest steps) follows in the next migration.

-- ── The log ─────────────────────────────────────────────────────────────────

create table public.campaign_sessions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number      integer check (number is null or number >= 0),
  title       text,
  -- The evening it was played, for a session never run through Start (written
  -- up from a note, or added afterwards). A run session dates by started_at.
  played_on   date,
  started_at  timestamptz,
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint campaign_sessions_end_after_start check (ended_at is null or (started_at is not null and ended_at >= started_at))
);

-- At most one open session per campaign: two claiming to be "the game tonight"
-- is unresolvable.
create unique index campaign_sessions_one_open on public.campaign_sessions (campaign_id)
  where started_at is not null and ended_at is null;
create index campaign_sessions_campaign_id_idx on public.campaign_sessions (campaign_id);
create index campaign_sessions_user_id_idx on public.campaign_sessions (user_id);

create trigger campaign_sessions_updated_at
  before update on public.campaign_sessions
  for each row execute procedure update_updated_at();

alter table public.campaign_sessions enable row level security;

-- DM-only, like the row it replaces: players read sessions through
-- get_player_sessions / get_player_session_state, never the row (user_id).
create policy "campaign_sessions_select" on public.campaign_sessions for select using (private.is_campaign_dm(campaign_id));
create policy "campaign_sessions_insert" on public.campaign_sessions for insert with check (private.is_campaign_dm(campaign_id));
create policy "campaign_sessions_update" on public.campaign_sessions for update using (private.is_campaign_dm(campaign_id));
create policy "campaign_sessions_delete" on public.campaign_sessions for delete using (private.is_campaign_dm(campaign_id));

-- ── Carry the old live rows over ────────────────────────────────────────────
-- Each campaign_session_state row becomes one session (unnumbered: nobody said
-- which it was), and the encounters that pointed at it follow it.

create temporary table pg_temp.state_map on commit drop as
select s.id as old_id, gen_random_uuid() as new_id, s.*
  from public.campaign_session_state s
 where s.started_at is not null;

insert into public.campaign_sessions (id, campaign_id, user_id, started_at, ended_at, created_at)
select new_id, campaign_id, user_id, started_at,
       case when is_running then null else coalesce(ended_at, started_at) end,
       created_at
  from pg_temp.state_map;

alter table public.encounter_state drop constraint encounter_state_session_id_fkey;
update public.encounter_state e
   set session_id = m.new_id
  from pg_temp.state_map m
 where e.session_id = m.old_id;
update public.encounter_state set session_id = null
 where session_id is not null
   and session_id not in (select id from public.campaign_sessions);
alter table public.encounter_state
  add constraint encounter_state_session_id_fkey
  foreign key (session_id) references public.campaign_sessions (id) on delete set null;

drop trigger if exists zz_same_campaign_refs on public.encounter_state;
create trigger zz_same_campaign_refs
  before insert or update of encounter_id, session_id, campaign_id on public.encounter_state
  for each row execute procedure private.enforce_same_campaign_refs('encounter_id', 'encounters', 'owned', 'session_id', 'campaign_sessions', 'owned');

-- ── Session notes link to their session ─────────────────────────────────────

alter table public.notes add column session_id uuid references public.campaign_sessions (id) on delete set null;
create index notes_session_id_idx on public.notes (session_id);

-- Every numbered session note becomes a session of its own, dated by the
-- evening it records (session_real_date, "YYYY-MM-DD"), else the day it was
-- written. Titled by the note, which is what the DM called that evening.
create temporary table pg_temp.note_map on commit drop as
select n.id as note_id, gen_random_uuid() as session_id, n.campaign_id, n.user_id, n.session_num, n.title,
       case when n.session_real_date ~ '^\d{4}-\d{2}-\d{2}$' then n.session_real_date::date else n.created_at::date end as played_on
  from public.notes n
 where n.category = 'session' and n.session_num is not null and n.campaign_id is not null;

insert into public.campaign_sessions (id, campaign_id, user_id, number, title, played_on)
select session_id, campaign_id, user_id, session_num, nullif(btrim(title), ''), played_on
  from pg_temp.note_map;

update public.notes n set session_id = m.session_id
  from pg_temp.note_map m
 where n.id = m.note_id;

drop trigger if exists zz_same_campaign_refs on public.notes;
create trigger zz_same_campaign_refs
  before insert or update of linked_calendar_event_id, session_id, campaign_id on public.notes
  for each row execute procedure private.enforce_same_campaign_refs('linked_calendar_event_id', 'calendar_events', 'owned', 'session_id', 'campaign_sessions', 'owned');

-- The number lives on the session now; keeping it on the note too would be two
-- answers to one question (no-legacy rule). match_campaign_notes is the only
-- database reader; it reads the session's number instead.
create or replace function public.match_campaign_notes(query_embedding vector, p_campaign_id uuid, p_owner_id uuid, p_embedding_model text, p_exclude_id uuid, p_categories text[], match_count integer)
 returns table(id uuid, title text, category text, session_num integer, distance double precision)
 language sql
 stable
 set search_path to 'public', 'extensions'
as $function$
  select
    n.id,
    n.title,
    n.category,
    s.number,
    e.embedding <=> query_embedding as distance
  from public.note_embeddings e
  join public.notes n on n.id = e.note_id
  left join public.campaign_sessions s on s.id = n.session_id
  where (
      (
        n.campaign_id = p_campaign_id
        and (
          n.user_id = p_owner_id
          or exists (
            select 1
            from public.campaign_members cm
            where cm.campaign_id = p_campaign_id
              and cm.user_id = n.user_id
              and cm.role = 'dm'
          )
        )
      )
      or (n.campaign_id is null and n.user_id = p_owner_id)
    )
    and e.embedding_model = p_embedding_model
    and (p_exclude_id is null or n.id <> p_exclude_id)
    and n.category = any(p_categories)
  order by e.embedding <=> query_embedding
  limit match_count;
$function$;

-- notes_updated_at bumps updated_at only on a content change (20260529000002);
-- which session a note belongs to is one, so session_id takes session_num's place.
drop trigger notes_updated_at on public.notes;
create trigger notes_updated_at
  before update on public.notes
  for each row
  when (
    old.title is distinct from new.title
    or old.content is distinct from new.content
    or old.category is distinct from new.category
    or old.tags is distinct from new.tags
    or old.session_id is distinct from new.session_id
    or old.is_pinned is distinct from new.is_pinned
    or old.session_start_year is distinct from new.session_start_year
    or old.session_start_month is distinct from new.session_start_month
    or old.session_start_day is distinct from new.session_start_day
    or old.session_end_year is distinct from new.session_end_year
    or old.session_end_month is distinct from new.session_end_month
    or old.session_end_day is distinct from new.session_end_day
    or old.session_real_date is distinct from new.session_real_date
    or old.linked_calendar_event_id is distinct from new.linked_calendar_event_id
  )
  execute procedure update_updated_at();

alter table public.notes drop column session_num;

-- ── A scheduled session points at the session it became ─────────────────────

alter table public.session_proposals add column session_id uuid references public.campaign_sessions (id) on delete set null;
create index session_proposals_session_id_idx on public.session_proposals (session_id);

drop trigger if exists zz_same_campaign_refs on public.session_proposals;
create trigger zz_same_campaign_refs
  before insert or update of session_id, campaign_id on public.session_proposals
  for each row execute procedure private.enforce_same_campaign_refs('session_id', 'campaign_sessions', 'owned');

-- ── Start, end, and what players may read ───────────────────────────────────

drop function public.start_campaign_session(uuid);
drop function public.end_campaign_session(uuid);
drop function public.get_player_session_state(uuid);

-- Start: the DM says which session it is (a label, or none for a test), and
-- may name the scheduled session it fulfils. Re-starting while one is open
-- returns that one with its clock untouched: a DM who reopens the app mid-game
-- keeps their elapsed time.
create function public.start_campaign_session(
  p_campaign_id uuid,
  p_number integer default null,
  p_title text default null,
  p_proposal_id uuid default null
)
returns public.campaign_sessions
language plpgsql
set search_path to 'public', 'private'
as $$
declare
  v_row public.campaign_sessions;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_row from public.campaign_sessions
   where campaign_id = p_campaign_id and started_at is not null and ended_at is null;
  if found then
    return v_row;
  end if;

  insert into public.campaign_sessions (campaign_id, user_id, number, title, started_at)
  values (p_campaign_id, auth.uid(), p_number, nullif(btrim(p_title), ''), now())
  returning * into v_row;

  if p_proposal_id is not null then
    update public.session_proposals
       set session_id = v_row.id
     where id = p_proposal_id and campaign_id = p_campaign_id;
  end if;

  return v_row;
end;
$$;

-- End: closes the open session, then what it contains (combat, open chains),
-- exactly as before.
create function public.end_campaign_session(p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'public', 'private'
as $$
declare
  v_encounters integer := 0;
  v_chains     integer := 0;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  update public.campaign_sessions
     set ended_at = now()
   where campaign_id = p_campaign_id and started_at is not null and ended_at is null;

  -- Ending the session ends what it contains. Combat first: an encounter left
  -- `is_running` when the DM closed the tab had nothing to clear it otherwise.
  with stopped as (
    update public.encounter_state
    set is_running = false
    where campaign_id = p_campaign_id and is_running
    returning 1
  )
  select count(*)::integer into v_encounters from stopped;

  -- Then the open chains, paused at their beat with reason 'Session ended'
  -- (#755), delegated so the transition log keeps one author.
  v_chains := public.end_campaign_quest_session(p_campaign_id);

  return jsonb_build_object('encounters_ended', v_encounters, 'chains_paused', v_chains);
end;
$$;

-- What a player may know of the live session: that it runs, since when, and
-- which session it is. Never user_id. A closed session projects nothing.
create function public.get_player_session_state(p_campaign_id uuid)
returns table(is_running boolean, started_at timestamptz, session_id uuid, number integer, title text)
language plpgsql
stable
security definer
set search_path to 'public', 'private'
as $$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select true, s.started_at, s.id, s.number, s.title
    from public.campaign_sessions s
   where s.campaign_id = p_campaign_id
     and s.started_at is not null
     and s.ended_at is null;
end;
$$;

-- What a player may know of past sessions: the labels People and the journal
-- show ("Session 14 · The Southern Road · 4 Oct"). Never user_id.
create function public.get_player_sessions(p_campaign_id uuid)
returns table(id uuid, number integer, title text, played_on date, started_at timestamptz, ended_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'private'
as $$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select s.id, s.number, s.title, coalesce(s.started_at::date, s.played_on), s.started_at, s.ended_at
    from public.campaign_sessions s
   where s.campaign_id = p_campaign_id;
end;
$$;

revoke execute on function public.start_campaign_session(uuid, integer, text, uuid) from public, anon;
revoke execute on function public.end_campaign_session(uuid) from public, anon;
revoke execute on function public.get_player_session_state(uuid) from public, anon;
revoke execute on function public.get_player_sessions(uuid) from public, anon;
grant execute on function public.start_campaign_session(uuid, integer, text, uuid) to authenticated, service_role;
grant execute on function public.end_campaign_session(uuid) to authenticated, service_role;
grant execute on function public.get_player_session_state(uuid) to authenticated, service_role;
grant execute on function public.get_player_sessions(uuid) to authenticated, service_role;

-- ── Live sync ───────────────────────────────────────────────────────────────
-- The same route the old row took: the DM's channel subscribes to the table
-- (DM-only RLS), and every write rings the doorbell so players' projections
-- refresh; a campaign-filtered DELETE never arrives on its own.

alter publication supabase_realtime add table public.campaign_sessions;

create trigger campaign_sessions_signal_insert
  after insert on public.campaign_sessions
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger campaign_sessions_signal_update
  after update on public.campaign_sessions
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger campaign_sessions_signal_delete
  after delete on public.campaign_sessions
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- ── The demo copy ───────────────────────────────────────────────────────────
-- Sessions are copied: a template's session notes keep their numbers. Nothing
-- in a session references an uncopied table.

delete from private.demo_campaign_tables where table_name = 'campaign_session_state';
insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('campaign_sessions', 1, true, null);

-- ── Retire the old row ──────────────────────────────────────────────────────

drop table public.campaign_session_state;
