-- An improvisation is not an opening.
--
-- `get_player_visible_quest_beats` computed `story_order` by walking from every
-- beat with no incoming edge. That is the right rule for an authored graph and
-- the wrong one for a played session: a beat improvised at the table is created
-- with no incoming edge on purpose (`improvise_quest_runtime`'s `p_keep_edge`
-- defaults to false), so it satisfied the definition of a root, took depth 0,
-- and appeared *first* in the players' recap the moment it was revealed —
-- ahead of every scene they had actually played through.
--
-- The client half of this concept, `rootBeatIds` in `src/lib/quests/graph.ts`,
-- already excluded improvised and archived beats and said why. Only the SQL
-- projection disagreed, which is why nothing caught it: the DM's graph drew
-- the right shape while the player journal told a different story.
--
-- Found during the #825 pre-deploy review. Regression cover lives in
-- `supabase/tests/player_quest_story_order.test.sql`.

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
    select b.id, b.quest_id, b.is_improvised, b.kind
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
    -- A root is a beat with no incoming edge — and, since this migration, one
    -- that could actually be an entrance. The comment here used to claim "that
    -- is now the only definition of a start anywhere", and it was wrong: the
    -- client's `rootBeatIds` (src/lib/quests/graph.ts) had always excluded
    -- improvised and archived beats as well, with its reasoning written out.
    -- Two definitions of "start", one of them player-facing.
    --
    -- `improvise_quest_runtime` defaults `p_keep_edge` to false, so a beat
    -- named at the table mid-session has no incoming edge by construction.
    -- Under the old rule it therefore became a root, took depth 0, and — once
    -- the DM revealed it — sorted to the very top of the players' "Story so
    -- far", ahead of everything the party had actually played. An
    -- improvisation happens part-way through a story; it is never the way in.
    -- Archived beats are excluded for the same reason: a tombstone is not an
    -- opening.
    where not exists (
        select 1 from public.quest_beat_edges e where e.target_beat_id = s.id
      )
      and not s.is_improvised
      and s.kind is distinct from 'archived'
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
$function$
