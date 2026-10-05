-- The quest board reads its inputs in one request (#972, story 9).
--
-- `useQuestBoardSummaries` ran nine reads in parallel and then up to twelve
-- more to learn whether each attachment's target still exists: two waves and
-- about twenty requests on every board open. It also fetched more than it
-- used. It took every beat's rich text only to test whether the text was
-- empty, and the campaign's whole transition history, `provenance` and all,
-- only to reduce it to three facts.
--
-- This function returns exactly what `deriveQuestBoardSummaries`
-- (src/lib/quests/board.ts) reads, in the shape it reads it. The board's rules
-- stay in that one TypeScript function, which the Build canvas shares, rather
-- than being restated here where the two copies could drift. What moves to the
-- server is only the reduction:
--
--   beats        the columns the rules read; each text as "is it written",
--                never the words
--   attachments  whether each target still exists, resolved here rather than
--                by a read per attachment type
--   visits       distinct (thread, beat) pairs from the history. A later visit
--                never undoes an earlier one, so no row limit applies.
--   converges    distinct cross-quest arrivals on a converge-all beat
--   endings      the latest `end` transition per quest
--
-- SECURITY INVOKER: every table here is already DM-scoped by RLS, and each
-- attachment target is checked as the caller, as the client did. The explicit
-- DM check is still needed: `quest_consequences` and `quest_objectives` follow
-- the quest owner and `quests` is readable by every member, so without it a
-- player would get a partial board instead of a refusal.
-- `get_loot_placements` is a definer with its own DM check.

create function public.get_quest_board(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'beats', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'quest_id', b.quest_id, 'title', b.title,
        'converge_mode', b.converge_mode, 'visibility', b.visibility,
        'is_improvised', b.is_improvised, 'improv_reviewed_at', b.improv_reviewed_at,
        'staged_at_location_id', b.staged_at_location_id,
        'has_guidance', coalesce(b.dm_content, '') <> '' or coalesce(b.how_it_plays, '') <> '',
        'has_rumor_text', coalesce(b.rumor_text, '') <> '',
        'has_reveal_text', coalesce(b.reveal_text, '') <> ''
      ) order by b.created_at, b.canvas_x, b.id), '[]'::jsonb)
      from public.quest_beats b
      where b.campaign_id = p_campaign_id and b.kind <> 'archived'
    ),
    'edges', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'source_beat_id', e.source_beat_id, 'target_beat_id', e.target_beat_id
      )), '[]'::jsonb)
      from public.quest_beat_edges e
      where e.campaign_id = p_campaign_id
    ),
    'attachments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'beat_id', a.beat_id, 'quest_id', a.quest_id,
        'attachment_type', a.attachment_type, 'is_required', a.is_required,
        -- A check carries its own data and points at no row. Every other type
        -- names an own row by uuid, and an item or a monster may instead name
        -- shared library content by its text id.
        'target_exists', case
          when a.attachment_type = 'check' then true
          when a.attachment_type = 'item' and a.ref_id !~ v_uuid then
            exists (select 1 from public.library_items x where x.id = a.ref_id)
          when a.attachment_type = 'monster' and a.ref_id !~ v_uuid then
            exists (select 1 from public.library_monsters x where x.id = a.ref_id)
          when a.ref_id !~ v_uuid then false
          when a.attachment_type = 'encounter' then exists (select 1 from public.encounters x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'npc' then exists (select 1 from public.npcs x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'faction' then exists (select 1 from public.factions x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'item' then exists (select 1 from public.items x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'monster' then exists (select 1 from public.monsters x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'sound' then exists (select 1 from public.sounds x where x.id = a.ref_id::uuid)
          when a.attachment_type in ('audio_scene', 'playlist') then
            exists (select 1 from public.soundboard_playlists x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'note' then exists (select 1 from public.notes x where x.id = a.ref_id::uuid)
          when a.attachment_type = 'handout' then
            exists (select 1 from public.scriptorium_documents x where x.id = a.ref_id::uuid)
          else false
        end
      )), '[]'::jsonb)
      from public.quest_beat_attachments a
      where a.campaign_id = p_campaign_id
    ),
    -- One cursor per thread that stands on a beat, oldest thread first, so the
    -- board's "first cursor" is the same one on every read.
    'runtime', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'quest_id', s.quest_id, 'thread_id', s.thread_id,
        'current_beat_id', s.current_beat_id, 'status', s.status
      ) order by t.created_at nulls last, s.thread_id), '[]'::jsonb)
      from public.quest_runtime_state s
      left join public.quest_threads t on t.id = s.thread_id
      where s.campaign_id = p_campaign_id and s.current_beat_id is not null
    ),
    'threads', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'quest_id', t.quest_id, 'label', t.label,
        'status', t.status, 'created_at', t.created_at
      ) order by t.created_at, t.id), '[]'::jsonb)
      from public.quest_threads t
      where t.campaign_id = p_campaign_id
    ),
    -- A null thread is a visit from before threads existed, which counts for
    -- every thread. It stays null here for the client to apply that rule.
    'visits', (
      select coalesce(jsonb_agg(jsonb_build_object('thread_id', v.thread_id, 'beat_id', v.to_beat_id)), '[]'::jsonb)
      from (
        select distinct tr.thread_id, tr.to_beat_id
        from public.quest_beat_transitions tr
        where tr.campaign_id = p_campaign_id and tr.to_beat_id is not null
      ) v
    ),
    'converges', (
      select coalesce(jsonb_agg(jsonb_build_object('quest_id', c.from_quest_id, 'title', c.to_quest_title)
        order by c.first_at), '[]'::jsonb)
      from (
        select tr.from_quest_id, tr.to_quest_title, min(tr.created_at) as first_at
        from public.quest_beat_transitions tr
        join public.quest_beats b on b.id = tr.to_beat_id
          and b.campaign_id = p_campaign_id and b.kind <> 'archived' and b.converge_mode = 'all'
        where tr.campaign_id = p_campaign_id
          and tr.from_quest_id is not null
          and tr.to_quest_id is not null and tr.to_quest_id <> tr.from_quest_id
          and tr.to_quest_title is not null and tr.to_quest_title <> ''
        group by tr.from_quest_id, tr.to_quest_title
      ) c
    ),
    -- An end transition belongs to both quests it names.
    'endings', (
      select coalesce(jsonb_agg(jsonb_build_object('quest_id', e.quest_id, 'reason', e.reason)), '[]'::jsonb)
      from (
        select distinct on (q.quest_id) q.quest_id, q.reason
        from (
          select tr.from_quest_id as quest_id, tr.reason, tr.created_at, tr.id
            from public.quest_beat_transitions tr
           where tr.campaign_id = p_campaign_id and tr.transition_kind = 'end' and tr.from_quest_id is not null
          union all
          select tr.to_quest_id, tr.reason, tr.created_at, tr.id
            from public.quest_beat_transitions tr
           where tr.campaign_id = p_campaign_id and tr.transition_kind = 'end' and tr.to_quest_id is not null
        ) q
        order by q.quest_id, q.created_at desc, q.id desc
      ) e
    ),
    'consequences', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'quest_id', c.quest_id, 'on_beat_id', c.on_beat_id, 'action', c.action,
        'target_quest_id', c.target_quest_id, 'entry_beat_id', c.entry_beat_id
      ) order by c.created_at, c.id), '[]'::jsonb)
      from public.quest_consequences c
      join public.quests q on q.id = c.quest_id
      where q.campaign_id = p_campaign_id
    ),
    'objectives', (
      select coalesce(jsonb_agg(jsonb_build_object('quest_id', o.quest_id, 'status', o.status)), '[]'::jsonb)
      from public.quest_objectives o
      join public.quests q on q.id = o.quest_id
      where q.campaign_id = p_campaign_id
    ),
    -- Room-homed loot has no quest and belongs to no card.
    'loot', (
      select coalesce(jsonb_agg(jsonb_build_object('quest_id', l.quest_id, 'delivery_state', l.delivery_state)), '[]'::jsonb)
      from public.get_loot_placements(p_campaign_id, null, null) l
      where l.quest_id is not null
    )
  );
end;
$$;

revoke execute on function public.get_quest_board(uuid) from public, anon;
grant execute on function public.get_quest_board(uuid) to authenticated, service_role;
