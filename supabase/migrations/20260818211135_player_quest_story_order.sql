-- The player's "Story so far" was ordered by `updated_at`, which is the moment
-- the DM flipped the switch, not the moment in the story. Revealing three beats
-- in whatever order you happen to click them produced a recap that contradicts
-- the narrative the party lived through.
--
-- Narrative order is a property of the graph, and the graph is deliberately
-- DM-only (see 20260810000012) — quest_beat_edges is not published to players
-- and must not be. So the projection hands out the *rank* without handing out
-- the edges: `story_order` is the beat's depth along the longest path from a
-- root, which is exactly "how far into the quest this moment sits" and reveals
-- nothing about which branches exist or where they lead.
--
-- Replacing rather than adding a signature, per 20260810000013, so the audited
-- public SECURITY DEFINER surface stays the same size.

drop function public.get_player_visible_quest_beats(uuid, uuid, uuid);

create function public.get_player_visible_quest_beats(
  p_campaign_id uuid,
  p_quest_id uuid default null,
  p_preview_party_member_id uuid default null
)
returns table (
  id uuid,
  quest_id uuid,
  campaign_id uuid,
  visibility text,
  kind text,
  presentation_hint text,
  player_text text,
  story_order integer,
  attachments jsonb,
  visits jsonb,
  updated_at timestamptz
)
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_preview_party_member_id is not null and not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Only a campaign DM can choose a preview audience';
  end if;
  if p_preview_party_member_id is not null and not exists (
    select 1 from public.party_members pm
    where pm.id = p_preview_party_member_id and pm.campaign_id = p_campaign_id
  ) then
    raise exception 'Preview audience is not in this campaign';
  end if;

  return query
  with recursive scoped as (
    -- Every beat of every quest in scope, hidden ones included: depth is a fact
    -- about the whole flow, and a hidden beat still occupies a step of the
    -- story. Ranking over revealed beats alone would renumber the recap each
    -- time the DM reveals one more. Nothing from this CTE reaches the caller
    -- except an integer position.
    select b.id, b.quest_id, b.is_overview
    from public.quest_beats b
    join public.quests q on q.id = b.quest_id and q.campaign_id = b.campaign_id
    where b.campaign_id = p_campaign_id
      and (p_quest_id is null or b.quest_id = p_quest_id)
      and case
        when p_preview_party_member_id is null then private.is_quest_player_visible(b.quest_id)
        else p_preview_party_member_id = any(q.player_visible_to)
      end
  ),
  roots as (
    select s.id
    from scoped s
    where not s.is_overview
      and not exists (
        select 1 from public.quest_beat_edges e where e.target_beat_id = s.id
      )
  ),
  walk as (
    select r.id as beat_id, 0 as depth, array[r.id] as seen
    from roots r
    union all
    -- `seen` is a cycle guard, not bookkeeping: a quest flow may legitimately
    -- loop back on itself, and without it the recursion never terminates.
    select e.target_beat_id, w.depth + 1, w.seen || e.target_beat_id
    from walk w
    join public.quest_beat_edges e on e.source_beat_id = w.beat_id
    where not (e.target_beat_id = any(w.seen))
  ),
  depths as (
    select w.beat_id, max(w.depth) as depth
    from walk w
    group by w.beat_id
  )
  select
    b.id,
    b.quest_id,
    b.campaign_id,
    b.visibility,
    b.kind,
    b.presentation_hint,
    case b.visibility when 'rumored' then b.rumor_text when 'revealed' then b.reveal_text end,
    -- The overview is the quest's premise rather than a step, so it leads. A
    -- beat wired to nothing has no place in the sequence and trails, instead of
    -- silently claiming depth 0 beside the real opening.
    (case when b.is_overview then -1 else coalesce(d.depth, 1000000) end)::integer,
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(safe.summary order by safe.sort_order, safe.created_at, safe.attachment_id)
      from (
        select a.id attachment_id, a.sort_order, a.created_at,
          jsonb_strip_nulls(jsonb_build_object(
            'attachment_id', a.id, 'type', 'objective', 'ref_id', o.id,
            'label', o.description, 'role', nullif(a.role, '')
          )) summary
        from public.quest_beat_attachments a
        join public.quest_objectives o on a.attachment_type = 'objective'
          and o.id::text = a.ref_id and o.quest_id = a.quest_id and o.is_player_visible
        where a.beat_id = b.id
        union all
        select a.id, a.sort_order, a.created_at,
          jsonb_strip_nulls(jsonb_build_object(
            'attachment_id', a.id, 'type', qr.ref_type, 'ref_id', qr.ref_id,
            'role', nullif(a.role, '')
          ))
        from public.quest_beat_attachments a
        join public.quest_refs qr on qr.quest_id = a.quest_id and qr.is_player_visible and (
          (a.attachment_type = 'quest_ref' and qr.id::text = a.ref_id)
          or (a.attachment_type in ('encounter', 'npc', 'faction', 'item', 'monster', 'location_set')
            and qr.ref_type = case a.attachment_type when 'location_set' then 'location' else a.attachment_type end
            and qr.ref_id::text = a.ref_id)
        )
        where a.beat_id = b.id
      ) safe
    ), '[]'::jsonb) else '[]'::jsonb end,
    coalesce((
      select jsonb_agg(jsonb_build_object('visit_id', t.id, 'visited_at', t.created_at) order by t.created_at, t.id)
      from public.quest_beat_transitions t
      where t.campaign_id = b.campaign_id and t.to_quest_id = b.quest_id and t.to_beat_id = b.id
    ), '[]'::jsonb),
    b.updated_at
  from public.quest_beats b
  join scoped s on s.id = b.id
  left join depths d on d.beat_id = b.id
  where b.visibility in ('rumored', 'revealed')
  order by 8, b.canvas_x, b.created_at, b.id;
end;
$$;

revoke all on function public.get_player_visible_quest_beats(uuid, uuid, uuid) from public;
revoke execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) from anon;
grant execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) to authenticated;
