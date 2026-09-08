-- ── The player journal reads by thread ──────────────────────────────────────
--
-- Frame "08 Player" of the Quest Manager Redesign: revealed beats grouped by
-- thread so parallel reads as parallel; a rumoured beat shows its rumour
-- text with a "happening now" mark when a thread stands on it; payoff chips
-- under a beat for the knowledge it granted and the loot it dropped; and a
-- thread exists for players only once its first beat is revealed.
--
-- Threads and cursors are DM-only tables (quest_threads, quest_runtime_state,
-- quest_beat_transitions all carry a single is_campaign_dm policy), so this
-- projection is the one door a player-facing client has to them — the same
-- door visibility already goes through. Four columns are added.

-- A changed return type cannot be replaced in place; drop and recreate, and
-- restate the grants the drop discards.
drop function public.get_player_visible_quest_beats(uuid, uuid, uuid);

create function public.get_player_visible_quest_beats(
  p_campaign_id uuid,
  p_quest_id uuid default null::uuid,
  p_preview_party_member_id uuid default null::uuid
)
returns table(
  id uuid, quest_id uuid, campaign_id uuid, visibility text, kind text,
  presentation_hint text, player_text text, story_order integer,
  attachments jsonb, visits jsonb, updated_at timestamp with time zone,
  staged_at_location_id uuid,
  thread_id uuid, thread_label text, is_current boolean, payoff jsonb
)
language plpgsql
stable security definer
set search_path to 'public', 'private'
as $function$
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
    select e.target_beat_id, w.depth + 1, w.seen || e.target_beat_id
    from walk w
    join public.quest_beat_edges e on e.source_beat_id = w.beat_id
    where not (e.target_beat_id = any(w.seen))
  ),
  depths as (
    select w.beat_id, max(w.depth) as depth
    from walk w
    group by w.beat_id
  ),

  -- ── Which thread a beat belongs to, on the player's side ─────────────────
  --
  -- Every quest has a "Main" thread from the day it is created (the
  -- create_quest_main_thread trigger), used both as the fallback and as the
  -- column a thread folds into until it has said something the party heard.
  main_threads as (
    select t.quest_id, t.id as main_thread_id
    from public.quest_threads t
    where t.campaign_id = p_campaign_id
      and (p_quest_id is null or t.quest_id = p_quest_id)
      and t.label = 'Main'
  ),
  -- The thread that actually walked into a beat, first. Asserts count — a
  -- beat recorded as already played is a real arrival. `seq`, not
  -- `created_at`: two transitions in one transaction share a timestamp.
  first_visit_thread as (
    select distinct on (tr.to_quest_id, tr.to_beat_id)
      tr.to_quest_id as quest_id, tr.to_beat_id as beat_id, tr.thread_id
    from public.quest_beat_transitions tr
    where tr.campaign_id = p_campaign_id
      and tr.thread_id is not null
      and tr.to_beat_id is not null
      and (p_quest_id is null or tr.to_quest_id = p_quest_id)
    order by tr.to_quest_id, tr.to_beat_id, tr.seq asc
  ),
  -- For a beat nobody has visited yet (revealed early, or rumoured ahead of
  -- the party), whichever live cursor can still reach it forward claims it.
  -- A waiting thread can still reach beyond its converge point; a closed or
  -- merged one reaches nowhere new.
  live_cursors as (
    select s.quest_id, s.thread_id, s.current_beat_id
    from public.quest_runtime_state s
    join public.quest_threads t on t.id = s.thread_id
    where s.campaign_id = p_campaign_id
      and (p_quest_id is null or s.quest_id = p_quest_id)
      and s.current_beat_id is not null
      and t.status in ('live', 'waiting')
  ),
  reach as (
    select lc.quest_id, lc.thread_id, lc.current_beat_id as beat_id, array[lc.current_beat_id] as seen
    from live_cursors lc
    union all
    select r.quest_id, r.thread_id, e.target_beat_id, r.seen || e.target_beat_id
    from reach r
    join public.quest_beat_edges e
      on e.source_beat_id = r.beat_id and e.quest_id = r.quest_id
    where not (e.target_beat_id = any(r.seen))
  ),
  -- Two live threads reaching the same beat: the senior one (oldest, Main
  -- when it qualifies) wins — deterministic, and keeps a foreshadowed beat
  -- out of a thread that only glimpses it from a spur.
  forward_thread as (
    select distinct on (r.quest_id, r.beat_id)
      r.quest_id, r.beat_id, r.thread_id
    from reach r
    join public.quest_threads t on t.id = r.thread_id
    order by r.quest_id, r.beat_id, t.created_at asc, t.id asc
  ),
  raw_assign as (
    select
      b.id as beat_id, b.quest_id,
      coalesce(fv.thread_id, ft.thread_id, mt.main_thread_id) as raw_thread_id
    from public.quest_beats b
    join scoped s on s.id = b.id
    left join first_visit_thread fv on fv.quest_id = b.quest_id and fv.beat_id = b.id
    left join forward_thread ft on ft.quest_id = b.quest_id and ft.beat_id = b.id
    left join main_threads mt on mt.quest_id = b.quest_id
    where b.visibility in ('rumored', 'revealed')
  ),
  -- A thread earns its own column once at least one beat assigned to it is
  -- revealed. All rumour or hidden means a layer opened in secret: it stays
  -- folded into Main until it says something the party has heard.
  earned_threads as (
    select distinct ra.quest_id, ra.raw_thread_id
    from raw_assign ra
    join public.quest_beats b on b.id = ra.beat_id
    where b.visibility = 'revealed' and ra.raw_thread_id is not null
  ),
  assign as (
    select
      ra.beat_id,
      case when et.raw_thread_id is not null then ra.raw_thread_id else mt.main_thread_id end as thread_id
    from raw_assign ra
    left join earned_threads et on et.quest_id = ra.quest_id and et.raw_thread_id = ra.raw_thread_id
    left join main_threads mt on mt.quest_id = ra.quest_id
  )

  select
    b.id,
    b.quest_id,
    b.campaign_id,
    b.visibility,
    b.kind,
    b.presentation_hint,
    case b.visibility when 'rumored' then b.rumor_text when 'revealed' then b.reveal_text end,
    coalesce(d.depth, 1000000)::integer,
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(safe.summary order by safe.sort_order, safe.created_at, safe.attachment_id)
      from (
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
    case when b.visibility = 'revealed' then b.staged_at_location_id end,
    a.thread_id,
    th.label,
    exists (
      select 1
      from public.quest_runtime_state s2
      join public.quest_threads t2 on t2.id = s2.thread_id
      where s2.campaign_id = b.campaign_id
        and s2.quest_id = b.quest_id
        and s2.current_beat_id = b.id
        and t2.status in ('live', 'waiting')
    ),
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(entry.item order by entry.item_group, entry.sort_at, entry.tiebreak)
      from (
        -- Knowledge the party learned here: journal entries a grant_knowledge
        -- rule wrote from an event on one of this beat's arrival transitions.
        select 1 as item_group, ev.created_at as sort_at, ev.id as tiebreak,
          jsonb_build_object('kind', 'knowledge', 'text', pje.content) as item
        from public.quest_consequence_events ev
        join public.quest_beat_transitions trx on trx.id = ev.transition_id
        join public.player_journal_entries pje on pje.id = ev.journal_entry_id
        where trx.campaign_id = b.campaign_id
          and trx.to_quest_id = b.quest_id
          and trx.to_beat_id = b.id
          and ev.journal_entry_id is not null

        union all

        -- Loot dispatched from this beat. Only dispatched rows: loot still
        -- held is DM prep, not yet part of the party's story. The delivery
        -- ladder collapses to the two states a player acts on.
        select 2, l.dispatched_at, l.id,
          jsonb_build_object(
            'kind', 'loot',
            'label', coalesce(nullif(l.label, ''), i.name, l.payload ->> 'loot_table_name', 'Loot'),
            'state', computed.state,
            'claimed_by', case when computed.state = 'claimed' then computed.claimed_by else null end,
            'message_id', l.dispatch_message_id
          )
        from public.loot_placements l
        left join public.items i on i.id = l.item_id
        left join public.campaign_messages m on m.id = l.dispatch_message_id
        cross join lateral (
          select
            case
              when m.id is null then 'claimed'
              when l.kind = 'item' and coalesce((m.metadata ->> 'quantity_remaining')::integer, l.quantity) <= 0 then 'claimed'
              when l.kind = 'currency' and m.metadata ->> 'claimed_by_user_id' is not null then 'claimed'
              when l.kind = 'loot_chest' and jsonb_array_length(coalesce(m.metadata -> 'claims', '[]'::jsonb)) >= coalesce((m.metadata ->> 'claims_total')::integer, 0) then 'claimed'
              else 'claimable'
            end as state,
            case
              when l.kind = 'currency' then m.metadata ->> 'claimed_by_name'
              else (
                select string_agg(distinct coalesce(claim ->> 'name', claim ->> 'claimed_by_name'), ', ')
                from jsonb_array_elements(coalesce(m.metadata -> 'claims', '[]'::jsonb)) claim
              )
            end as claimed_by
        ) computed
        where l.beat_id = b.id and l.dispatched_at is not null
      ) entry
    ), '[]'::jsonb) else '[]'::jsonb end
  from public.quest_beats b
  join scoped s on s.id = b.id
  left join depths d on d.beat_id = b.id
  left join assign a on a.beat_id = b.id
  left join public.quest_threads th on th.id = a.thread_id
  where b.visibility in ('rumored', 'revealed')
  order by 8, b.canvas_x, b.created_at, b.id;
end;
$function$;

revoke execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_quest_beats(uuid, uuid, uuid) to authenticated, service_role;

comment on function public.get_player_visible_quest_beats(uuid, uuid, uuid) is
  'The player projection of a quest''s beats: rumored and revealed only, in story order, with the thread each belongs to (a thread exists for players only once its first beat is revealed), whether a thread stands on it now, and the knowledge and loot it paid out.';
