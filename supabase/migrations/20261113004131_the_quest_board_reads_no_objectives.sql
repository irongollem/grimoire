-- The quest log's featured "In session" cards are gone (12 Nov 2026): they
-- repeated the Active lane, whose cards already carry the thread spines and
-- "Party is here". Their objectives tally was the only reader of this
-- payload's `objectives` key, so the board stops fetching objectives at all.
CREATE OR REPLACE FUNCTION public.get_quest_board(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
        'has_rumor_text', btrim(private.rich_text_plain(b.rumor_text)) <> '',
        'has_reveal_text', btrim(private.rich_text_plain(b.reveal_text)) <> ''
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
    -- Room-homed loot has no quest and belongs to no card.
    'loot', (
      select coalesce(jsonb_agg(jsonb_build_object('quest_id', l.quest_id, 'delivery_state', l.delivery_state)), '[]'::jsonb)
      from public.get_loot_placements(p_campaign_id, null, null) l
      where l.quest_id is not null
    )
  );
end;
$function$;
