-- The player journal and the filling-in map. Story #798, epic #780.
--
-- Two things the players' side needs and cannot currently get:
--
--   1. An objectives list that is the DM's own ledger, filtered to what the
--      party has actually been told — never an untaken branch.
--   2. The site map filling in as they explore, which is only possible because
--      #787 made the site remember what was explored.
--
-- ── 1. A dormant objective already cannot reach a player ───────────────────
--
-- Checked rather than assumed, and the assumption was wrong. The obvious worry
-- is that `quest_objectives_player_select` reads `is_player_visible and
-- private.is_quest_player_visible(quest_id)` with no mention of status, so a
-- DM ticking visibility on a dormant row would show the party a branch they
-- have not taken — "Avenge Sildar" before Sildar is in any danger.
--
-- That row cannot exist. #792 shipped
-- `quest_objectives_dormant_is_hidden CHECK (status <> 'dormant' OR NOT
-- is_player_visible)`, so the combination is rejected at write time, and the
-- policy's `is_player_visible` therefore excludes dormant transitively.
--
-- So this migration adds NO predicate here on purpose. A `status <> 'dormant'`
-- clause in the policy would be unreachable code sitting in a security
-- boundary, and the next reader would have to work out which of the two rules
-- is authoritative — while the CHECK is strictly the stronger of the two,
-- because it stops the row existing rather than merely stops it being read.
-- `supabase/tests/player_journal_and_site_map.test.sql` pins the invariant.

-- ── 2. The map fills in ─────────────────────────────────────────────────────
--
-- Players have no RLS path to `locations`, `location_map_regions` or
-- `location_state` — every player read of the Atlas already goes through
-- `get_player_visible_locations`, a SECURITY DEFINER projection that nulls the
-- DM-only columns. This is its sibling for the inside of a site.
--
-- What it deliberately does NOT return: any region whose space the party has
-- not explored. That absence *is* the feature — a map that arrives complete is
-- a floor plan, and a map that arrives empty and fills in is a record of where
-- they have been. So the filter is not cosmetic and must not be moved to the
-- client, where an unexplored room would sit in the payload waiting to be read
-- out of the network tab.
--
-- `cleared` and `looted` come back alongside, because those are facts about a
-- room the party themselves established. `explored` is not returned as a
-- column: every row in the result is explored by construction.
--
-- Note on why this must authorize internally rather than lean on the view:
-- `location_state` is a view with `security_invoker = true`, so inside a
-- SECURITY DEFINER function it resolves as the *definer* (postgres) and sees
-- every campaign's rows. The membership and visibility checks below are the
-- only thing standing between a caller and another table's dungeon — and they
-- must bind BOTH ends of a region, the site and the space, because the schema
-- does not guarantee the two share a campaign. See the predicate below.

create or replace function public.get_player_visible_site_state(
  p_site_location_id uuid,
  p_preview_party_member_id uuid default null
) returns table (
  space_location_id uuid,
  name text,
  cells jsonb,
  label text,
  sort_order integer,
  is_cleared boolean,
  is_looted boolean
)
language sql
stable
security definer
set search_path = 'public', 'private'
as $$
  -- `p_preview_party_member_id` mirrors get_player_visible_quest_beats: a DM
  -- asks "what does THIS character see?" and gets exactly that, gated on
  -- private.is_campaign_dm. Without it a DM previewing the journal would get an
  -- empty room list, because a DM's own campaign_members row has a null
  -- party_member_id and so matches nothing in player_visible_to — the feature
  -- would be unpreviewable by the only person who can fix what it shows.
  -- Deliberate difference from the sibling, so nobody "aligns" it later:
  -- get_player_visible_quest_beats RAISES on a bad preview request, this one
  -- returns empty. That function is plpgsql and already has a guard block; this
  -- one is plain SQL, and converting it to plpgsql to raise would trade a
  -- readable set-returning query for an error message the client cannot act on
  -- anyway — the preview id comes from a picker of this campaign's own party
  -- members, so a bad one is a programming error, not something a DM can type.
  -- The realistic empty result is "nothing explored yet", which is exactly what
  -- an empty set should mean.
  select
    r.space_location_id,
    space.name,
    r.cells,
    r.label,
    r.sort_order,
    coalesce((select s.value from public.location_state s
               where s.location_id = r.space_location_id and s.fact = 'cleared'), false),
    coalesce((select s.value from public.location_state s
               where s.location_id = r.space_location_id and s.fact = 'looted'), false)
  from public.location_map_regions r
  join public.locations site  on site.id  = r.site_location_id
  join public.locations space on space.id = r.space_location_id
  where r.site_location_id = p_site_location_id
    and r.space_location_id is not null
    -- The caller must be a member of the campaign the site belongs to.
    and site.campaign_id is not null
    and exists (
      select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = site.campaign_id
    )
    -- … the site must be shared with this player's character, and its map
    -- shared at all. A site whose map the DM has not shared has no picture for
    -- regions to sit on, so returning its geometry would leak the floor plan
    -- in coordinates.
    and site.is_map_shared
    and case
      when p_preview_party_member_id is null then exists (
        select 1 from public.campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = site.campaign_id
          and cm.party_member_id = any (site.player_visible_to)
      )
      -- Preview: only a DM of THIS campaign may ask, and only about a character
      -- who is actually in it. Both checks are coalesced because a missing
      -- membership row must deny rather than answer NULL.
      else coalesce(private.is_campaign_dm(site.campaign_id), false)
           and exists (
             select 1 from public.party_members pm
             where pm.id = p_preview_party_member_id
               and pm.campaign_id = site.campaign_id
           )
           and p_preview_party_member_id = any (site.player_visible_to)
    end
    -- … the room must belong to the SAME campaign as the site it is drawn on.
    --
    -- Not redundant, though it reads that way. Nothing in the schema guarantees
    -- a region's space and site share a campaign: `guard_location_map_region_space`
    -- checks that the space's parent_id equals the site, and
    -- `guard_location_room_parent` checks that the parent can hold rooms —
    -- neither compares campaign_id, and neither table's RLS relates a child's
    -- campaign to its parent's. So a DM running two campaigns can, with two
    -- ordinary writes that pass every existing check, park a room belonging to
    -- campaign B under a site belonging to campaign A. Without this line the
    -- projection then serves B's room name and B's looted state to A's players,
    -- who have never been near it. Demonstrated with a working exploit during
    -- the #798 audit; the root-cause trigger gap is filed separately.
    and space.campaign_id = site.campaign_id
    -- … and the space itself must have been explored.
    and coalesce((
      select s.value from public.location_state s
       where s.location_id = r.space_location_id and s.fact = 'explored'
    ), false)
  order by r.sort_order, space.name;
$$;

comment on function public.get_player_visible_site_state(uuid, uuid) is
  'The inside of a site as the party knows it: one row per region whose space '
  'they have explored, with the cleared/looted facts they established '
  'themselves. Unexplored rooms are absent rather than flagged — the map fills '
  'in as they go (#798).';

revoke execute on function public.get_player_visible_site_state(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_site_state(uuid, uuid) to authenticated, service_role;


-- ── The player's beats carry the place they happen ──────────────────────────
--
-- #797 gave a beat a staged place, but a player has no route to that column:
-- `quest_beats` has exactly one policy (`quest_beats_dm_all`, DM-only), so the
-- only way a beat reaches the party is this projection — and it did not select
-- the new column. The journal's map therefore could not find its site, which is
-- how the client half of #798 came to fall back to the quest's own
-- `location_id`. This closes the gap so the map follows the story rather than
-- the quest header.
--
-- Revealed beats only: see the inline comment.
--
-- It also removes a `location_set` arm this function still carried. #797
-- deleted that attachment type from the CHECK, the validator, the rows and the
-- client, and missed this one call site — a dead branch that can no longer
-- match anything, which is exactly the half-deletion the epic exists to stop.
-- Rebuilt from the live body rather than from the migration that created it.

-- The return type gains a column, so CREATE OR REPLACE is refused (42P13) and
-- the function must be dropped first. DROP discards the ACL along with the
-- function, so the grants are restated below — the pre-drop ACL was
-- {authenticated, service_role} and nothing else, verified before dropping.
-- There was no comment to preserve; one is added now.

drop function if exists public.get_player_visible_quest_beats(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_player_visible_quest_beats(p_campaign_id uuid, p_quest_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, quest_id uuid, campaign_id uuid, visibility text, kind text, presentation_hint text, player_text text, story_order integer, attachments jsonb, visits jsonb, updated_at timestamp with time zone, staged_at_location_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
    select b.id, b.quest_id
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
    -- A root is a beat with no incoming edge, and that is now the only
    -- definition of a start anywhere. It used to also exclude the overview
    -- beat, which is what let a bridge object sit in front of the real one.
    where not exists (
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
    -- A beat wired to nothing has no place in the sequence and trails, rather
    -- than silently claiming depth 0 beside a real opening. Roots are depth 0;
    -- there may be more than one, and they tie.
    coalesce(d.depth, 1000000)::integer,
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(safe.summary order by safe.sort_order, safe.created_at, safe.attachment_id)
      from (
        -- The `objective` attachment arm is gone with the type (#792). An
        -- objective reaches players through the ledger, not by being stapled
        -- to a beat as a second way of saying "relevant here".
        select a.id attachment_id, a.sort_order, a.created_at,
          jsonb_strip_nulls(jsonb_build_object(
            'attachment_id', a.id, 'type', qr.ref_type, 'ref_id', qr.ref_id,
            'role', nullif(a.role, '')
          )) summary
        from public.quest_beat_attachments a
        join public.quest_refs qr on qr.quest_id = a.quest_id and qr.is_player_visible and (
          (a.attachment_type = 'quest_ref' and qr.id::text = a.ref_id)
          or (a.attachment_type in ('encounter', 'npc', 'faction', 'item', 'monster')
            and qr.ref_type = a.attachment_type
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
    b.updated_at,
    -- Revealed beats only. A rumored beat is one the party has heard about but
    -- not reached; handing over where it happens would place a pin on the map
    -- for a scene they have not had, which is the same spoiler the rumor/reveal
    -- split exists to prevent.
    case when b.visibility = 'revealed' then b.staged_at_location_id end
  from public.quest_beats b
  join scoped s on s.id = b.id
  left join depths d on d.beat_id = b.id
  where b.visibility in ('rumored', 'revealed')
  order by 8, b.canvas_x, b.created_at, b.id;
end;
$function$;

comment on function public.get_player_visible_quest_beats(uuid, uuid, uuid) is
  'The only route a quest beat takes to a player: quest_beats itself is DM-only. '
  'Returns rumored and revealed beats with player-safe text, ordered by story '
  'position, and — for revealed beats alone — the place the beat stages at, so '
  'the journal map can follow the story (#798).';

revoke execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) to authenticated, service_role;
