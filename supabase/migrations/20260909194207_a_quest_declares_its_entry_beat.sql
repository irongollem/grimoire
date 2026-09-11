-- Migration: a_quest_declares_its_entry_beat
-- A quest names the beat the story begins at; a bridge names where the party
-- comes in. The database defaults both, so no creation path has to know.
--
-- The cockpit used to open on "Choose a starting beat…" — a dropdown of every
-- beat by title. The maintainer's verdict, weeks after prepping: "the
-- drop-down instantly confuses me when I prepped a while ago and forgot the
-- names." #793 made the opening beat a *computed* graph root, which is the
-- honest answer to "where could the party come in" but not to "where does the
-- story begin" — the DM knows that at prep time and forgets it by the table.
--
-- Two columns, both defaulted by the database:
--
-- * `quests.entry_beat_id` — the formal entry. Set by the DM on the overview;
--   defaulted to the first non-archived beat by trigger, so a quest with any
--   beat always has an entry (the generator, the paste import, the hook path
--   and the starter all get it for free). Reassigned when the entry is
--   archived or deleted: oldest remaining root, or the oldest beat when the
--   graph is a pure cycle. Null only for a quest with no beats at all —
--   legacy data; the starter now writes the rumor beat with the quest.
--
-- * `quest_consequences.entry_beat_id` — where an `unlock_quest` rule brings
--   the party in. A sequel entered sideways through a bridge does not start at
--   its own rumor; it starts at the beat the bridge lands on. Null means "the
--   target's own entry". The cockpit's start default reads the most recent
--   performed unlock event for the quest, then the quest's entry, then the
--   sole root, and only then asks.
--
-- Both FKs are composite onto (id, quest_id) so a quest can only name its own
-- beat and a bridge can only name a beat of the quest it unlocks. That needs
-- one more unique on quest_beats: (id, quest_id) — the existing one carries
-- campaign_id too, and quest_consequences has no campaign column to match.
-- `on delete set null (column)` is the PG 15+ form that nulls only the named
-- column; the two-column form would try to null `quests.id`.
--
-- One consequence for the client: quests and quest_beats now share TWO
-- relationships (this FK and quest_beats_quest_campaign_fkey), so a bare
-- PostgREST embed between them answers PGRST201 "more than one relationship".
-- Every embed names its constraint — `quests!quest_beats_quest_campaign_fkey`
-- — and scripts/check-embeds.sh (the spell-database CI job) holds the release
-- if one does not. It held this one, for useBeatsStagedAt.ts.

alter table public.quest_beats
  add constraint quest_beats_id_quest_key unique (id, quest_id);

-- ── quests.entry_beat_id ────────────────────────────────────────────────────

alter table public.quests add column entry_beat_id uuid;

alter table public.quests
  add constraint quests_entry_beat_fkey
  foreign key (entry_beat_id, id) references public.quest_beats (id, quest_id)
  on delete set null (entry_beat_id);

comment on column public.quests.entry_beat_id is
  'The beat the story begins at — the cockpit''s start default and the overview''s "Opens at". Defaulted to the first beat and reassigned on archive/delete by private.settle_quest_entry_beat(); null only while the quest has no beats.';

create index quests_entry_beat_idx on public.quests (entry_beat_id) where entry_beat_id is not null;

-- Roots first (no incoming route), oldest first; a pure cycle falls back to
-- the oldest beat rather than to nothing, since "where does this begin" has
-- to have an answer once there is any beat to answer with.
create function private.quest_entry_beat_candidate(p_quest_id uuid)
returns uuid
language sql
stable
set search_path = public, private
as $$
  select b.id
  from public.quest_beats b
  where b.quest_id = p_quest_id and b.kind <> 'archived'
  order by
    (exists (select 1 from public.quest_beat_edges e where e.target_beat_id = b.id)) asc,
    b.created_at asc,
    b.id asc
  limit 1
$$;

-- Not revoked from `authenticated`: the settle trigger below calls this as
-- whoever wrote the beat, and `private` is not exposed by PostgREST anyway —
-- the same reason the RLS helpers there keep EXECUTE (CLAUDE.md, item 1).
revoke execute on function private.quest_entry_beat_candidate(uuid) from public, anon;
grant execute on function private.quest_entry_beat_candidate(uuid) to authenticated, service_role;

-- An entry must be a live beat of this quest. The FK proves the quest; this
-- proves it is not a tombstone.
create function private.guard_quest_entry_beat()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.entry_beat_id is not null and exists (
    select 1 from public.quest_beats b
    where b.id = new.entry_beat_id and b.kind = 'archived'
  ) then
    raise exception 'An archived beat cannot be a quest''s entry' using errcode = '23514';
  end if;
  return new;
end
$$;

revoke execute on function private.guard_quest_entry_beat() from public, anon, authenticated;

create trigger quests_guard_entry_beat
  before insert or update of entry_beat_id on public.quests
  for each row execute procedure private.guard_quest_entry_beat();

-- The first beat becomes the entry; losing the entry picks the next. Fires
-- after the row trigger `RI_ConstraintTrigger_*` has already set-null'd a
-- deleted entry (RI triggers sort first by name), and does not rely on it:
-- the predicate re-derives "no live entry" from the beats table.
--
-- SECURITY DEFINER on purpose: whoever RLS let write the beat (a co-DM, an
-- edge function) may not own the quest row, and an invoker-rights UPDATE on
-- `quests` would then match zero rows and leave the entry unset with no
-- error. The body touches exactly one column of exactly one row the beat
-- already belongs to; it is a trigger function in `private`, so PostgREST
-- never sees it and no client can call it.
create function private.settle_quest_entry_beat()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_quest_id uuid := coalesce(new.quest_id, old.quest_id);
begin
  update public.quests q
     set entry_beat_id = private.quest_entry_beat_candidate(q.id)
   where q.id = v_quest_id
     and (
       q.entry_beat_id is null
       or not exists (
         select 1 from public.quest_beats b
         where b.id = q.entry_beat_id and b.kind <> 'archived'
       )
     )
     and q.entry_beat_id is distinct from private.quest_entry_beat_candidate(q.id);
  return null;
end
$$;

revoke execute on function private.settle_quest_entry_beat() from public, anon, authenticated;

create trigger quest_beats_settle_entry
  after insert or delete or update of kind on public.quest_beats
  for each row execute procedure private.settle_quest_entry_beat();

-- Backfill: every quest that has a beat gets one. In production this is the
-- "— overview" beat on every wired quest, which is what the cockpit already
-- preselected as the sole root.
update public.quests q
   set entry_beat_id = private.quest_entry_beat_candidate(q.id)
 where q.entry_beat_id is null
   and exists (select 1 from public.quest_beats b where b.quest_id = q.id and b.kind <> 'archived');

-- ── quest_consequences.entry_beat_id ────────────────────────────────────────

alter table public.quest_consequences add column entry_beat_id uuid;

alter table public.quest_consequences
  add constraint quest_consequences_entry_beat_fkey
  foreign key (entry_beat_id, target_quest_id) references public.quest_beats (id, quest_id)
  on delete set null (entry_beat_id);

alter table public.quest_consequences
  add constraint quest_consequences_entry_needs_unlock
  check (entry_beat_id is null or action = 'unlock_quest');

comment on column public.quest_consequences.entry_beat_id is
  'unlock_quest only: the beat of target_quest_id the party comes in at through this bridge. Null means the target''s own entry_beat_id.';


-- ── get_player_visible_quests returns the row, not a column list ────────────
--
-- The players' quest RPC is declared `returns setof quests` but selected
-- sixteen named columns. Adding `entry_beat_id` above made the row seventeen
-- wide, and PostgREST answered every player's quest log with 42804 "structure
-- of query does not match function result type" — found the same day by
-- looking at the player view as the player fixture, which is the only place
-- it could have been found: no test called the RPC as a player after a
-- column was added. `q.*` follows the declared return type by construction,
-- so the next column cannot break it; the row carries nothing a player may
-- not see (the beat ids it names are the same ids the beats RPC hands out).
create or replace function public.get_player_visible_quests(p_campaign_id uuid DEFAULT NULL::uuid, p_quest_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF quests
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_preview_party_member_id is not null and not exists (
    select 1 from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then raise exception 'Preview audience is not available to this DM'; end if;

  -- Column list narrowed by #799. A SETOF quests projection cannot name a
  -- column that no longer exists, and the quest-level payout fields are dropped
  -- below: loot is an event, so it reaches players through the beat that grants
  -- it (loot_placements, renamed from quest_beat_loot by #830 when rooms
  -- gained the same verb), not through the quest header.
  return query select q.*
  from public.quests q
  where q.campaign_id is not null
    and (p_campaign_id is null or q.campaign_id = p_campaign_id)
    and (p_quest_id is null or q.id = p_quest_id)
    and case
      when p_preview_party_member_id is null then private.is_quest_player_visible(q.id)
      else p_preview_party_member_id = any(q.player_visible_to)
        and coalesce(private.is_campaign_dm(q.campaign_id), false)
    end;
end;
$function$;
