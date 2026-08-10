-- Contextual DM preview uses the exact player DTOs with an explicit audience.
-- Replacing (rather than adding) both RPC signatures keeps the audited public
-- SECURITY DEFINER surface unchanged.

drop function public.get_player_visible_quest_beats(uuid, uuid);

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

  return query select
    b.id,
    b.quest_id,
    b.campaign_id,
    b.visibility,
    b.kind,
    b.presentation_hint,
    case b.visibility when 'rumored' then b.rumor_text when 'revealed' then b.reveal_text end,
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
  join public.quests q on q.id = b.quest_id and q.campaign_id = b.campaign_id
  where b.campaign_id = p_campaign_id
    and (p_quest_id is null or b.quest_id = p_quest_id)
    and b.visibility in ('rumored', 'revealed')
    and case
      when p_preview_party_member_id is null then private.is_quest_player_visible(b.quest_id)
      else p_preview_party_member_id = any(q.player_visible_to)
    end
  order by b.updated_at, b.id;
end;
$$;

revoke all on function public.get_player_visible_quest_beats(uuid, uuid, uuid) from public;
revoke execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) from anon;
grant execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) to authenticated;

drop function public.get_player_visible_quests(uuid, uuid);

create function public.get_player_visible_quests(
  p_campaign_id uuid default null,
  p_quest_id uuid default null,
  p_preview_party_member_id uuid default null
)
returns setof public.quests
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_preview_party_member_id is not null and not exists (
    select 1
    from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then
    raise exception 'Preview audience is not available to this DM';
  end if;

  return query select
    q.id, q.user_id, q.campaign_id, q.parent_quest_id, q.title, q.summary,
    q.status, q.giver_npc_id, q.location_id, q.rewards, q.tags,
    null::text, -- notes
    q.started_at, q.resolved_at, q.created_at, q.updated_at,
    q.reward_pp, q.reward_gp, q.reward_ep, q.reward_sp, q.reward_cp,
    q.reward_currency_pools, q.description, q.reward_item_ids,
    q.reward_art_objects, q.player_visible_to, q.ai_provenance
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
$$;

revoke all on function public.get_player_visible_quests(uuid, uuid, uuid) from public;
revoke execute on function public.get_player_visible_quests(uuid, uuid, uuid) from anon;
grant execute on function public.get_player_visible_quests(uuid, uuid, uuid) to authenticated, service_role;
