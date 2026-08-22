-- Migration: promote_quest_on_cursor_arrival
-- A quest the party is standing in counts as Active on the board.

-- Two things called themselves "active" and never met: the DM-curated kanban
-- lane (`quests.status`) and the live runtime cursor. `transition_quest_runtime`
-- never wrote to `quests`, so a DM could be mid-session with the cursor parked
-- in a quest that still sat in the Undiscovered or Rumor lane — absent from the
-- dashboard's "Active Quests" entirely, and from its count.
--
-- This is a **one-way ratchet**. Only `undiscovered` and `rumor` are promoted.
-- `completed` and `failed` are DM verdicts, and a cursor arriving in a finished
-- quest — a callback, a revisit, a flashback — must not silently reopen it.
-- Nothing here ever demotes.
--
-- It lives on the table rather than inside `transition_quest_runtime` because
-- the rule is a property of the relationship between a cursor and its quest,
-- not of one RPC. `archive_quest_beat` moves the cursor through its own internal
-- jump, and anything added later will too; a trigger holds for all of them and
-- avoids copying a 200-line function body forward to append four lines.
--
-- `started_at` is deliberately NOT set. Nothing in the app writes that column —
-- it is null on every quest and the kanban's own drag-to-Active does not touch
-- it either — so setting it here would invent a meaning no other path maintains
-- and make runtime-promoted quests differ from hand-promoted ones.
--
-- Note the promotion is player-visible by design: `quests_updated_at`
-- (20260529000002) lists `status` among the columns that bump `updated_at`, and
-- the player quest log renders the status badge. A quest going Rumor → Active is
-- a real change to what a player sees, so it earns its unread dot.

create function private.promote_quest_on_cursor_arrival()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- Ending a chain nulls its cursor. Leaving the quest Active is right: the
  -- party did play it, and only the DM decides it is finished.
  if new.current_beat_id is null then
    return new;
  end if;

  update public.quests
  set status = 'active'
  where id = new.quest_id
    and status in ('undiscovered', 'rumor');

  return new;
end;
$$;

-- Trigger functions bypass the EXECUTE check, and `private` is not published by
-- PostgREST, so this is unreachable as an RPC either way.
revoke all on function private.promote_quest_on_cursor_arrival() from public, anon, authenticated;

-- `update of current_beat_id` rather than a bare update: pausing, resuming or
-- bumping a version has nothing to say about which lane a quest belongs in.
create trigger promote_quest_on_cursor_arrival
  after insert or update of current_beat_id on public.quest_runtime_state
  for each row execute procedure private.promote_quest_on_cursor_arrival();

comment on function private.promote_quest_on_cursor_arrival() is
  'Promotes undiscovered/rumor quests to active when a runtime cursor enters them. One-way: never demotes, and never touches a completed or failed verdict.';

-- Existing chains predate the trigger. Same ratchet, applied once.
update public.quests q
set status = 'active'
where q.status in ('undiscovered', 'rumor')
  and exists (
    select 1 from public.quest_runtime_state s
    where s.quest_id = q.id and s.campaign_id = q.campaign_id
      and s.current_beat_id is not null
  );
