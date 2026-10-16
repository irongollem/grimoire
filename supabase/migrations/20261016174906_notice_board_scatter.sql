-- A notice board's scatter: the leftover tacks, nails and torn scraps that make a board look used, behind the DM's
-- pins. The DM adds it with a button in the editor, and it is worked out then from the space the pins leave
-- (src/lib/noticeBoard/scatter.ts), so it is stored rather than derived: dragging a pin later must not reshuffle the
-- board's clutter, and every screen has to show the same board during Present now. Pressing it again re-rolls it;
-- Clear empties it. A board nobody pressed it on stays clean.
--
-- Each piece is {art, x, y, r, tack}: the image (a scrap-*, poster-scrap-*, tack-* or nail), its centre as fractions
-- of the board, its tilt in degrees, and for a scrap the tack or nail still holding it (or null). Decoration only, so
-- the shape is checked loosely: an array, and short enough that a hand-written write cannot bloat every player read.

alter table public.notice_boards
  add column scatter jsonb not null default '[]'::jsonb;

alter table public.notice_boards
  add constraint notice_boards_scatter_shape
  check (jsonb_typeof(scatter) = 'array' and jsonb_array_length(scatter) <= 60);

-- Players draw the scatter too. Restated from 20261016002013 with the one new key.
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
             'scatter', b.scatter,
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
