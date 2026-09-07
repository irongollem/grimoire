-- ── A quest holds many threads ───────────────────────────────────────────────
--
-- The Quest Manager Redesign (quests/Quest Manager Redesign.html, frame 1
-- "What actually changes") names three things the shipped model cannot say:
--
--   1. a quest can only hold one cursor;
--   2. a route cannot say "and also";
--   3. payoffs are split across two panels that don't know about each other.
--
-- This migration is the schema half of the first two, plus the three verbs the
-- design adds so knowledge, favours and milestones stop living as prose. The
-- engine that reads it (thread-scoped transitions, spawning, converging,
-- holding a payoff) is the next migration; both land in one push.
--
-- The rules this is written under (CLAUDE.md, "The four rules"): no legacy —
-- there is no thread-less cursor left behind, the primary key moves; the
-- migration is additive in the design's own words ("existing edges default to
-- choice, existing beats to any, every current runtime row becomes thread
-- Main — nothing replays; the transition log stays valid").

-- ── 1. Threads ──────────────────────────────────────────────────────────────

create table public.quest_threads (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid not null references public.campaigns(id) on delete cascade,
  quest_id              uuid not null,
  label                 text not null check (char_length(btrim(label)) between 1 and 80),
  -- live: has a running/paused cursor. waiting: parked at a converge-all beat
  -- until every incoming route has been walked. merged: folded into another
  -- thread at such a beat. closed: ended by the DM or by the quest.
  status                text not null default 'live' check (status in ('live', 'waiting', 'closed', 'merged')),
  -- The parallel route that opened this thread, when one did. Null for a
  -- thread opened by hand (the thread bar) or for the Main thread.
  opened_by_edge_id     uuid references public.quest_beat_edges(id) on delete set null,
  parent_thread_id      uuid references public.quest_threads(id) on delete set null,
  merged_into_thread_id uuid references public.quest_threads(id) on delete set null,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  closed_at             timestamptz,
  updated_at            timestamptz not null default now(),
  foreign key (quest_id, campaign_id) references public.quests(id, campaign_id) on delete cascade,
  -- The composite every cursor and transition targets, so a thread can never
  -- be attached to a quest it does not belong to.
  unique (id, quest_id, campaign_id)
);

create index quest_threads_quest_idx on public.quest_threads (quest_id, status);

create trigger quest_threads_updated_at
  before update on public.quest_threads
  for each row execute procedure update_updated_at();

alter table public.quest_threads enable row level security;

create policy quest_threads_dm_all on public.quest_threads
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

revoke truncate on public.quest_threads from anon, authenticated;

comment on table public.quest_threads is
  'One live cursor of a quest. A quest holds as many as the story has open at once; a parallel route spawns one, a converge-all beat merges them.';

-- ── 2. The cursor belongs to a thread ───────────────────────────────────────
--
-- Every existing cursor becomes the quest's thread "Main". Added nullable,
-- filled, then made NOT NULL — the order that lets the backfill run before the
-- constraint exists to refuse it.

alter table public.quest_runtime_state add column thread_id uuid;

insert into public.quest_threads (campaign_id, quest_id, label, status, created_by, created_at, closed_at)
select s.campaign_id, s.quest_id, 'Main',
       case when s.status = 'ended' then 'closed' else 'live' end,
       s.updated_by, s.created_at,
       case when s.status = 'ended' then s.updated_at end
  from public.quest_runtime_state s;

update public.quest_runtime_state s
   set thread_id = t.id
  from public.quest_threads t
 where t.quest_id = s.quest_id and t.campaign_id = s.campaign_id and t.label = 'Main';

alter table public.quest_runtime_state
  alter column thread_id set not null,
  drop constraint quest_runtime_state_pkey,
  add primary key (campaign_id, quest_id, thread_id),
  add constraint quest_runtime_state_thread_fkey
    foreign key (thread_id, quest_id, campaign_id)
    references public.quest_threads(id, quest_id, campaign_id) on delete cascade,
  drop constraint quest_runtime_state_status_check,
  -- `waiting`: parked at a converge-all beat. Not `paused` — the DM did not
  -- stop it, the story did, and it resumes on its own when the last thread
  -- arrives.
  add constraint quest_runtime_state_status_check
    check (status in ('idle', 'running', 'paused', 'waiting', 'ended'));

comment on column public.quest_runtime_state.thread_id is
  'The thread this cursor belongs to. A quest has one row per thread; there is no thread-less cursor.';

-- ── 3. The log knows which thread walked ────────────────────────────────────
--
-- Nullable on purpose: `assert_quest_objective_status` writes an `assert`
-- row with no cursor at all, and the design's prep panel records history
-- against a quest, not a thread.

alter table public.quest_beat_transitions
  add column thread_id uuid references public.quest_threads(id) on delete set null;

update public.quest_beat_transitions tr
   set thread_id = t.id
  from public.quest_threads t
 where t.label = 'Main'
   and t.quest_id = coalesce(tr.to_quest_id, tr.from_quest_id)
   and t.campaign_id = tr.campaign_id
   and tr.transition_kind <> 'assert';

create index quest_beat_transitions_thread_idx on public.quest_beat_transitions (thread_id, created_at);

-- ── 4. A route says which kind it is ────────────────────────────────────────

alter table public.quest_beat_edges
  add column route_kind text not null default 'choice' check (route_kind in ('choice', 'parallel')),
  -- The label a parallel route gives the thread it opens — "shown to the DM
  -- and on the player thread" (frame 2, Selected route). Null on a choice.
  add column thread_label text check (thread_label is null or char_length(btrim(thread_label)) between 1 and 80);

comment on column public.quest_beat_edges.route_kind is
  'choice moves the cursor (its siblings become unreachable); parallel spawns a thread and leaves the current cursor alone. Gates apply to both.';

-- ── 5. A beat says how it receives several threads ──────────────────────────

alter table public.quest_beats
  add column converge_mode text not null default 'any' check (converge_mode in ('any', 'all'));

comment on column public.quest_beats.converge_mode is
  'any: every arriving thread proceeds on its own. all: the beat holds each arriving thread until every incoming route has been walked, then merges them into one cursor.';

-- ── 6. Three verbs the system had no word for ───────────────────────────────
--
-- The design's diagnosis: "knowledge, favours and milestones have no verb, so
-- they end up as prose in `outcomes`." Same table, same delay, same event
-- log, same undo. Each verb writes one row somewhere a person will read it:
--
--   grant_knowledge  → the party journal (`player_journal_entries`, shared,
--                      category `discovery`) — the table players already read
--   owe_favor        → `npc_favors`, pinned to the NPC's page
--   award_milestone  → `party_milestones`, on the party screen, announced to
--                      the table through the broadcast the engine already has

alter table public.quest_consequences
  drop constraint quest_consequences_action_check,
  add constraint quest_consequences_action_check check (action in (
    'raise', 'reveal', 'complete', 'fail',
    'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
    'grant_knowledge', 'owe_favor', 'award_milestone'
  )),
  drop constraint quest_consequences_npc_pair,
  add constraint quest_consequences_npc_pair
    check ((action in ('shift_npc_relationship', 'owe_favor')) = (target_npc_id is not null));

create table public.npc_favors (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  npc_id          uuid not null references public.npcs(id) on delete cascade,
  quest_id        uuid references public.quests(id) on delete set null,
  text            text not null check (char_length(btrim(text)) between 1 and 500),
  source_event_id uuid,
  settled_at      timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index npc_favors_npc_idx on public.npc_favors (npc_id, settled_at);

create trigger npc_favors_updated_at
  before update on public.npc_favors
  for each row execute procedure update_updated_at();

alter table public.npc_favors enable row level security;

create policy npc_favors_dm_all on public.npc_favors
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

revoke truncate on public.npc_favors from anon, authenticated;

comment on table public.npc_favors is
  'What an NPC owes the party. Written by the owe_favor consequence or by the DM on the NPC sheet; settled, never deleted, once repaid.';

create table public.party_milestones (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  quest_id        uuid references public.quests(id) on delete set null,
  text            text not null check (char_length(btrim(text)) between 1 and 500),
  source_event_id uuid,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index party_milestones_campaign_idx on public.party_milestones (campaign_id, created_at);

create trigger party_milestones_updated_at
  before update on public.party_milestones
  for each row execute procedure update_updated_at();

alter table public.party_milestones enable row level security;

create policy party_milestones_dm_all on public.party_milestones
  for all using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

-- Players read the milestones the party has earned; the DM writes them.
create policy party_milestones_member_select on public.party_milestones
  for select using (private.is_campaign_member(campaign_id));

revoke truncate on public.party_milestones from anon, authenticated;

comment on table public.party_milestones is
  'A milestone the party earned — renown, a promise kept, a threshold crossed. Written by the award_milestone consequence or by the DM on the party screen.';

-- ── 7. The event log: handles for the new verbs, and a held payoff ──────────
--
-- `held_at`: the Advance dialog lets the DM untick a payoff. The rule still
-- logs an event — it is part of the record that this beat carried it — but
-- performs nothing, and the cockpit offers it later ("Held payoff — not yet
-- fired"). Firing clears `held_at`; undo stamps `undone_at` like any other.

alter table public.quest_consequence_events
  add column held_at          timestamptz,
  add column journal_entry_id uuid references public.player_journal_entries(id) on delete set null,
  add column favor_id         uuid references public.npc_favors(id) on delete set null,
  add column milestone_id     uuid references public.party_milestones(id) on delete set null;

alter table public.npc_favors
  add constraint npc_favors_source_event_fkey
    foreign key (source_event_id) references public.quest_consequence_events(id) on delete set null;
alter table public.party_milestones
  add constraint party_milestones_source_event_fkey
    foreign key (source_event_id) references public.quest_consequence_events(id) on delete set null;

comment on column public.quest_consequence_events.held_at is
  'Set when the DM held this payoff back in the Advance dialog instead of letting it fire. Cleared when it is fired from the log.';

-- ── 8. The prose the verbs replace ──────────────────────────────────────────
--
-- `quest_beats.outcomes` and `quest_beats.consequences` exist because the
-- system had no verb for the thing; it has the verbs now, and the route
-- itself is a beat's outcome (#795). Nothing a DM wrote is lost: each column's
-- text becomes trailing paragraphs of `how_it_plays`, under a bold label, and
-- then the column goes. Tiptap-aware — a document is appended as a document,
-- plain text as paragraphs — because both shapes exist in the column.

create function private.tiptap_doc(p_text text) returns jsonb
language plpgsql immutable
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_paragraphs jsonb := '[]'::jsonb;
  v_line text;
begin
  if coalesce(btrim(p_text), '') = '' then
    return null;
  end if;
  if left(btrim(p_text), 1) = '{' then
    begin
      v_doc := p_text::jsonb;
      if v_doc ->> 'type' = 'doc' and jsonb_typeof(v_doc -> 'content') = 'array' then
        return v_doc;
      end if;
    exception when others then
      v_doc := null;
    end;
  end if;
  foreach v_line in array regexp_split_to_array(btrim(p_text), E'\n+') loop
    if btrim(v_line) <> '' then
      v_paragraphs := v_paragraphs || jsonb_build_array(jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', btrim(v_line)))
      ));
    end if;
  end loop;
  return jsonb_build_object('type', 'doc', 'content', v_paragraphs);
end $$;

revoke execute on function private.tiptap_doc(text) from public, anon, authenticated;

do $$
declare
  v_row record;
  v_doc jsonb;
  v_folded integer := 0;
begin
  for v_row in
    select id, how_it_plays, outcomes, consequences
      from public.quest_beats
     where coalesce(btrim(outcomes), '') <> '' or coalesce(btrim(consequences), '') <> ''
  loop
    v_doc := coalesce(private.tiptap_doc(v_row.how_it_plays), jsonb_build_object('type', 'doc', 'content', '[]'::jsonb));

    if coalesce(btrim(v_row.outcomes), '') <> '' then
      v_doc := jsonb_set(v_doc, '{content}', (v_doc -> 'content')
        || jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
             jsonb_build_object('type', 'text', 'marks', jsonb_build_array(jsonb_build_object('type', 'bold')), 'text', 'Outcomes'))))
        || (private.tiptap_doc(v_row.outcomes) -> 'content'));
    end if;

    if coalesce(btrim(v_row.consequences), '') <> '' then
      v_doc := jsonb_set(v_doc, '{content}', (v_doc -> 'content')
        || jsonb_build_array(jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
             jsonb_build_object('type', 'text', 'marks', jsonb_build_array(jsonb_build_object('type', 'bold')), 'text', 'Consequences'))))
        || (private.tiptap_doc(v_row.consequences) -> 'content'));
    end if;

    update public.quest_beats set how_it_plays = v_doc::text where id = v_row.id;
    v_folded := v_folded + 1;
  end loop;

  raise notice 'beat prose: % beat(s) had outcomes/consequences folded into how_it_plays', v_folded;
end $$;

alter table public.quest_beats
  drop column outcomes,
  drop column consequences;

drop function private.tiptap_doc(text);
