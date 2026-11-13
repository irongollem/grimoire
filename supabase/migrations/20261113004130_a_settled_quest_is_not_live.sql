-- A quest the DM has settled (Completed or Failed) is not in session, whatever
-- its threads say. Threads never close on their own (#850: "Closing a thread is
-- your call"), so settling a quest's lane leaves its Main thread running, and
-- this function went on reporting it: the session rail counted it, the
-- dashboard's Quests widget listed it, the cockpit offered it as an open chain.
-- The lane is the DM's own statement that the quest is over, so it wins here.
-- The thread itself is untouched: moving the quest back to Active brings it
-- back exactly where it stood. The quest board reads its own payload and
-- applies the same rule client-side (`isQuestInSession`, src/lib/quests/board.ts).
CREATE OR REPLACE FUNCTION public.get_campaign_live_quests(p_campaign_id uuid)
 RETURNS TABLE(quest_id uuid, quest_title text, quest_status text, beat_id uuid, beat_title text, beat_kind text, runtime_status text, version bigint, updated_at timestamp with time zone, thread_id uuid, thread_label text, thread_status text, sibling_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    q.id, q.title, q.status::text, b.id, b.title, b.kind, s.status, s.version, s.updated_at,
    t.id, t.label, t.status,
    (
      select count(*)::integer from public.quest_runtime_state s2
       where s2.campaign_id = p_campaign_id and s2.quest_id = q.id
         and s2.status in ('running', 'waiting')
    ) as sibling_count
  from public.quest_runtime_state s
  join public.quests q on q.id = s.quest_id and q.campaign_id = s.campaign_id
  join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = s.quest_id
  join public.quest_threads t on t.id = s.thread_id
  where s.campaign_id = p_campaign_id
    and s.status in ('running', 'waiting')
    and q.status not in ('completed', 'failed')
  order by (s.status = 'running') desc, s.updated_at desc;
end;
$function$;
