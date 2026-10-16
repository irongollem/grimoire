-- Migration: notice_board_offers_and_news
-- Two fixes to the notice board (#1064, 20261015234112).
--
--   * A notice offers only its own campaign's quest and handout. zz_same_campaign_refs lets a pin name the DM's
--     campaign-less quest or account-wide handout, but take_notice_board_pin reveals and shares within the pin's campaign
--     only (reveal_quest_to and the handout share both match campaign_id), so such an offer was shown to players, taken,
--     and never given, while the take still answered with its ids. The pin now refuses the offer instead. Production
--     held no pins when this was written, so no row needs moving.
--   * Reading order puts what is up first and the taken stubs after. The DM orders only what is up, so a taken stub's
--     old sort_order used to land it between two notices the DM had arranged.
--   * A player's unread dot for a board followed the board row's updated_at, which no pin write touches and which
--     presenting bumps: new notices never lit it and Present lit it for nothing. The projection now stamps a board by
--     its visible notices.

create or replace function private.notice_pin_offers_this_campaign()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.quest_id is not null
     and not exists (select 1 from public.quests q where q.id = new.quest_id and q.campaign_id = new.campaign_id) then
    raise exception 'A notice offers only a quest from its own campaign' using errcode = '23514';
  end if;
  if new.handout_id is not null
     and not exists (select 1 from public.scriptorium_documents d
                      where d.id = new.handout_id and d.campaign_id = new.campaign_id) then
    raise exception 'A notice offers only a handout from its own campaign' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.notice_pin_offers_this_campaign() from public, anon, authenticated;
create trigger notice_board_pins_offer_this_campaign
  before insert or update of quest_id, handout_id, campaign_id on public.notice_board_pins
  for each row execute procedure private.notice_pin_offers_this_campaign();

create or replace function public.get_player_notice_boards(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id,
             'name', b.name,
             'surface', b.surface,
             'presented_at', b.presented_at,
             -- What a player can see change: the board appearing, and a notice going up, being edited or being taken.
             -- Not the board row's own updated_at, which presenting and un-presenting bump while nothing on it moves,
             -- and which no pin write touches.
             'updated_at', greatest(b.created_at, (select max(p.updated_at) from public.notice_board_pins p
                                                    where p.board_id = b.id and p.status <> 'draft')),
             -- only the places the caller's character may see: an undiscovered place stays undiscovered
             'location_ids', coalesce((select jsonb_agg(lp.location_id)
                                         from public.location_placements lp
                                         join public.locations l on l.id = lp.location_id
                                        where lp.notice_board_id = b.id
                                          and private.my_party_member_id(p_campaign_id) = any (l.player_visible_to)), '[]'::jsonb),
             'pins', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'style', p.style,
                        'headline', p.headline,
                        'body', p.body,
                        'reward', p.reward,
                        'image_url', p.image_url,
                        'seal', p.seal,
                        'size', p.size,
                        'x', p.x,
                        'y', p.y,
                        'sort_order', p.sort_order,
                        'status', p.status,
                        'updated_at', p.updated_at,
                        -- that it offers something, never what, until it is taken
                        'offers', p.quest_id is not null or p.handout_id is not null,
                        'taken_by_name', pm.name,
                        'taken_at', p.taken_at,
                        'taken_session_number', p.taken_session_number,
                        'quest_id', case when p.status = 'taken' then p.quest_id end,
                        'handout_id', case when p.status = 'taken' then p.handout_id end
                      -- up notices in the DM's order, then the taken stubs: the order the DM's list arranges, and
                      -- inReadingOrder (src/lib/noticeBoard/readingOrder.ts) on the client
                      ) order by p.status = 'taken', p.sort_order, p.created_at)
                 from public.notice_board_pins p
                 left join public.party_members pm on pm.id = p.taken_by
                where p.board_id = b.id and p.status <> 'draft'), '[]'::jsonb)
           ) order by b.name)
      from public.notice_boards b
     where b.campaign_id = p_campaign_id and b.is_revealed), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_player_notice_boards(uuid) from public, anon;
grant execute on function public.get_player_notice_boards(uuid) to authenticated, service_role;
