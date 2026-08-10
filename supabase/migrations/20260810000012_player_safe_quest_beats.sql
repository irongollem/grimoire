-- Player quest beats are an explicit projection, never a filtered copy of the
-- authored graph. Raw beats, edges, attachments, and runtime history remain
-- DM-only and are not published as realtime payloads.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'quest_beats',
    'quest_beat_edges',
    'quest_beat_attachments',
    'quest_beat_transitions'
  ]
  loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end $$;

-- A quest-level share does not make every relationship safe. Keep the
-- relationship's own reveal switch authoritative at the database boundary.
drop policy if exists "quest_refs_player_select" on public.quest_refs;
create policy "quest_refs_player_select" on public.quest_refs
  for select using (
    quest_refs.is_player_visible
    and private.is_quest_player_visible(quest_refs.quest_id)
  );

drop function public.get_player_visible_quest_beats(uuid, uuid);

create function public.get_player_visible_quest_beats(
  p_campaign_id uuid,
  p_quest_id uuid default null
)
returns table (
  id uuid,
  quest_id uuid,
  campaign_id uuid,
  visibility text,
  kind text,
  presentation_hint text,
  player_text text,
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

  return query select
    b.id,
    b.quest_id,
    b.campaign_id,
    b.visibility,
    b.kind,
    b.presentation_hint,
    case b.visibility
      when 'rumored' then b.rumor_text
      when 'revealed' then b.reveal_text
    end as player_text,
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(safe.summary order by safe.sort_order, safe.created_at, safe.attachment_id)
      from (
        -- Objective descriptions are already guarded by their own explicit
        -- player visibility flag. No DM objective fields are copied here.
        select
          a.id as attachment_id,
          a.sort_order,
          a.created_at,
          jsonb_strip_nulls(jsonb_build_object(
            'attachment_id', a.id,
            'type', 'objective',
            'ref_id', o.id,
            'label', o.description,
            'role', nullif(a.role, '')
          )) as summary
        from public.quest_beat_attachments a
        join public.quest_objectives o
          on a.attachment_type = 'objective'
         and o.id::text = a.ref_id
         and o.quest_id = a.quest_id
         and o.is_player_visible
        where a.beat_id = b.id

        union all

        -- Entity placements are exposed only when their authoritative
        -- quest_ref was explicitly revealed. Labels stay with each entity's
        -- existing player-safe projection; this summary never invents one.
        select
          a.id as attachment_id,
          a.sort_order,
          a.created_at,
          jsonb_strip_nulls(jsonb_build_object(
            'attachment_id', a.id,
            'type', qr.ref_type,
            'ref_id', qr.ref_id,
            'role', nullif(a.role, '')
          )) as summary
        from public.quest_beat_attachments a
        join public.quest_refs qr
          on qr.quest_id = a.quest_id
         and qr.is_player_visible
         and (
           (a.attachment_type = 'quest_ref' and qr.id::text = a.ref_id)
           or (
             a.attachment_type in ('encounter', 'npc', 'faction', 'item', 'monster', 'location_set')
             and qr.ref_type = case a.attachment_type when 'location_set' then 'location' else a.attachment_type end
             and qr.ref_id::text = a.ref_id
           )
         )
        where a.beat_id = b.id
      ) safe
    ), '[]'::jsonb) else '[]'::jsonb end as attachments,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'visit_id', t.id,
        'visited_at', t.created_at
      ) order by t.created_at, t.id)
      from public.quest_beat_transitions t
      where t.campaign_id = b.campaign_id
        and t.to_quest_id = b.quest_id
        and t.to_beat_id = b.id
    ), '[]'::jsonb) as visits,
    b.updated_at
  from public.quest_beats b
  where b.campaign_id = p_campaign_id
    and (p_quest_id is null or b.quest_id = p_quest_id)
    and b.visibility in ('rumored', 'revealed')
    and private.is_quest_player_visible(b.quest_id)
  order by b.updated_at, b.id;
end;
$$;

revoke all on function public.get_player_visible_quest_beats(uuid, uuid) from public;
revoke execute on function public.get_player_visible_quest_beats(uuid, uuid) from anon;
grant execute on function public.get_player_visible_quest_beats(uuid, uuid) to authenticated;
