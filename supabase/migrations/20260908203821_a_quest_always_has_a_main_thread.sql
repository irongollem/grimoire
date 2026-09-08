-- A quest always has a Main thread — and the app can restore that itself.
--
-- The trigger `private.create_quest_main_thread` and the backfill in
-- `20260907234512` promise every quest a Main thread. Two things still break
-- the promise: a local `supabase db reset` loads `seed.sql` AFTER the
-- migrations with `session_replication_role = replica`, so the trigger never
-- fires for a seeded quest; and any future import that writes `quests` the
-- same way. The maintainer hit it on the first test: "Start run" on such a
-- quest had no thread to point at, and the cockpit answered with two errors
-- and no way forward.
--
-- The invariant is the engine's to keep, so the repair lives here: one
-- idempotent, DM-gated call that returns the quest's oldest thread or creates
-- Main. The client fires it the moment it sees a quest with no thread; a race
-- between two tabs is settled by the row lock on the quest.

create function public.ensure_quest_main_thread(p_campaign_id uuid, p_quest_id uuid)
returns public.quest_threads
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_quest public.quests;
  v_thread public.quest_threads;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_quest from public.quests q
   where q.id = p_quest_id and q.campaign_id = p_campaign_id
   for update;
  if not found then
    raise exception 'That quest is not in this campaign';
  end if;

  select * into v_thread from public.quest_threads t
   where t.quest_id = p_quest_id
   order by t.created_at asc
   limit 1;
  if found then
    return v_thread;
  end if;

  insert into public.quest_threads (campaign_id, quest_id, label, status, created_by, created_at)
  values (p_campaign_id, p_quest_id, 'Main', 'live', auth.uid(), v_quest.created_at)
  returning * into v_thread;
  return v_thread;
end;
$$;

comment on function public.ensure_quest_main_thread(uuid, uuid) is
  'Returns the quest''s oldest thread, creating Main when it has none. Idempotent; the client calls it on a quest that shows no thread (seeded or imported rows bypass the insert trigger).';

revoke execute on function public.ensure_quest_main_thread(uuid, uuid) from public, anon;
grant execute on function public.ensure_quest_main_thread(uuid, uuid) to authenticated, service_role;
