-- Travel, the rest of the road (#1222, stories 3, 5 and the players' roads).
--
-- 1. Difficult going (story 3). The book halves a day's distance over difficult terrain (PHB "Travel Pace"), and a
--    mountain pass is difficult going whatever it is called, so it is the road's own flag rather than read from its
--    kind: a river may run fast or slow, a track may be good or bad. Default plain going, as every road so far was.
--
-- 2. Hunger (story 5). With the optional rule `rations` on, a character who sets out without food counts the days
--    in a row they have gone without, because that run, not the day's meal, is what costs them Exhaustion by the
--    book (2014 PHB "Food and Water", 2024 PHB "Malnutrition"). A day of eating sets it back to 0. It lives on the
--    character, beside the conditions it turns into; with the rule off nothing writes it. No hunger meter and no new
--    condition: the count only explains the next level of Exhaustion.
--
-- 3. What a player reads of a road (story 1's last part). A road is the DM's (`location_roads` RLS is DM-only), but
--    a player who knows both towns knows the road between them: the projection returns a road only when both its
--    places are shown to that player (`locations.player_visible_to`), and never the road's encounter table or who
--    drew it. It is the same reader the World Web uses (`private.world_ties_reader`): a stranger is refused, a DM
--    may preview one of the campaign's own characters and sees what that character would.

-- ── 1. Difficult going ─────────────────────────────────────────────────────────
alter table public.location_roads
  add column difficult boolean not null default false;

comment on column public.location_roads.difficult is
  'Difficult going (a pass, a bog, a broken road): a day covers half the distance, by the book.';

-- ── 2. Days without food ───────────────────────────────────────────────────────
alter table public.party_members
  add column days_without_food smallint not null default 0 check (days_without_food between 0 and 365);

comment on column public.party_members.days_without_food is
  'Days in a row this character has gone without food on the road (optional rule rations); 0 once they eat.';

-- ── 3. The roads a player knows ────────────────────────────────────────────────
create function private.player_roads(p_campaign_id uuid, p_member uuid)
returns table (
  id uuid,
  from_location_id uuid,
  to_location_id uuid,
  distance numeric,
  unit text,
  name text,
  going text,
  difficult boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.from_location_id, r.to_location_id, r.distance, r.unit, r.name, r.going, r.difficult
  from public.location_roads r
  join public.locations a on a.id = r.from_location_id
  join public.locations b on b.id = r.to_location_id
  where r.campaign_id = p_campaign_id
    and p_member is not null
    and p_member = any(a.player_visible_to)
    and p_member = any(b.player_visible_to);
$$;
revoke execute on function private.player_roads(uuid, uuid) from public, anon, authenticated;

create function public.get_player_roads(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid,
  from_location_id uuid,
  to_location_id uuid,
  distance numeric,
  unit text,
  name text,
  going text,
  difficult boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Refuses a stranger (42501) and a preview of another campaign's character (22023) before anything is read.
  v_member uuid := private.world_ties_reader(p_campaign_id, p_preview_member_id);
begin
  return query select * from private.player_roads(p_campaign_id, v_member);
end;
$$;
revoke execute on function public.get_player_roads(uuid, uuid) from public, anon;
grant execute on function public.get_player_roads(uuid, uuid) to authenticated, service_role;

comment on function public.get_player_roads(uuid, uuid) is
  'The roads a player knows: those whose two places are both shown to them. No encounter table, no author.';
