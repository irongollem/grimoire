-- Migration: quest_beat_player_text_is_rich_text
-- A quest beat's rumour and reveal text are rich text, so a beat can hold a
-- lens pair and a DM-only block (#1115).
--
-- They were plain text (a MentionTextarea), the only words of a beat a player
-- ever reads. A beat could therefore offer neither a lens pair (Bright and Deep
-- readings, the Deep half the DM's alone, 20261027012548) nor a [secret] block
-- (20261007092700), and a setting whose quests are written at two levels had
-- nowhere to put the second one. Now both columns hold Tiptap JSON like every
-- other prose field of a beat, and the same server rule applies to them as to
-- every projection a player reads: what is withheld is never sent.
--
-- 1. Existing plain text becomes a document: one paragraph per blank-line
--    block, the split the client's toTiptapJson makes. Blank text becomes null.
--    No mention to recover: the old field stored "@Name" as literal text, with
--    no id, so it stays literal text.
-- 2. get_player_visible_quest_beats runs player_text through
--    private.withhold_secret_blocks. That is the boundary. The client renders
--    what arrives; it is never asked to hide anything.
-- 3. get_quest_board's has_rumor_text / has_reveal_text read the text, not the
--    string: an emptied editor stores a document, which is not ''.
-- 4. Secret blocks in the two columns get ids (private.stamp_secret_block_ids)
--    and appear in list_campaign_secrets, so an NPC memory can name one. A
--    beat's secret is filed under its QUEST (entity_type 'quest'): every other
--    secret's home opens from its id alone, and a beat page needs its quest's
--    id too. npc_memories accepts 'quest' as a secret's home accordingly.
--
-- improvise_quest_runtime is untouched: the client sends the improvised reveal
-- as a document. A plain string written any other way still reads correctly
-- (withhold_secret_blocks passes non-JSON through, and so do the client's
-- viewer and tiptapToPlainText), it just cannot hold a pair.

-- ── 1. Existing text ──────────────────────────────────────────────────────────

create function pg_temp.plain_to_doc(p text) returns text language sql immutable as $$
  select case
    when p is null or p !~ '\S' then null
    when p ~ '^\s*\{' then p
    else jsonb_build_object('type', 'doc', 'content', (
      select jsonb_agg(jsonb_build_object('type', 'paragraph', 'content',
               jsonb_build_array(jsonb_build_object('type', 'text', 'text', para))) order by n)
        from (select btrim(part, E' \t\r\n') as para, n
                from regexp_split_to_table(p, '\n\s*\n') with ordinality as t(part, n)) parts
       where para <> ''))::text
  end
$$;

update public.quest_beats
   set rumor_text = pg_temp.plain_to_doc(rumor_text),
       reveal_text = pg_temp.plain_to_doc(reveal_text)
 where rumor_text is distinct from pg_temp.plain_to_doc(rumor_text)
    or reveal_text is distinct from pg_temp.plain_to_doc(reveal_text);

-- ── 2. The player projection ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_visible_quest_beats(p_campaign_id uuid, p_quest_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, quest_id uuid, campaign_id uuid, visibility text, kind text, presentation_hint text, player_text text, story_order integer, attachments jsonb, visits jsonb, updated_at timestamp with time zone, staged_at_location_id uuid, thread_id uuid, thread_label text, is_current boolean, payoff jsonb)
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
    -- The one change in this version: the text passes the secret-block strip.
    private.withhold_secret_blocks(case b.visibility when 'rumored' then b.rumor_text when 'revealed' then b.reveal_text end),
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
            'label', coalesce(nullif(l.label, ''), i.name, li.name, l.payload ->> 'loot_table_name', 'Loot'),
            'state', computed.state,
            'claimed_by', case when computed.state = 'claimed' then computed.claimed_by else null end,
            'message_id', l.dispatch_message_id
          )
        from public.loot_placements l
        left join public.items i on i.id = l.item_id
        left join public.library_items li on li.id = l.library_item_id
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

-- ── 3. The board's "has copy" flags ───────────────────────────────────────────

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
    'objectives', (
      select coalesce(jsonb_agg(jsonb_build_object('quest_id', o.quest_id, 'status', o.status)), '[]'::jsonb)
      from public.quest_objectives o
      join public.quests q on q.id = o.quest_id
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

-- ── 4. Secret ids and the secrets list ────────────────────────────────────────

create trigger quest_beats_stamp_secret_ids
  before insert or update of rumor_text, reveal_text on public.quest_beats
  for each row execute function private.stamp_secret_block_ids('rumor_text', 'reveal_text');

update public.quest_beats
   set rumor_text = private.stamp_secret_ids(rumor_text),
       reveal_text = private.stamp_secret_ids(reveal_text)
 where rumor_text ~ 'secretBlock' or reveal_text ~ 'secretBlock';

alter table public.npc_memories drop constraint npc_memories_secret_entity_type_check;
alter table public.npc_memories add constraint npc_memories_secret_entity_type_check
  check (secret_entity_type = any (array['location', 'item', 'puzzle', 'note', 'faction', 'quest']));

CREATE OR REPLACE FUNCTION private.normalize_npc_memory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and new.user_id is not null then
    new.user_id := old.user_id;
  end if;
  select n.campaign_id into new.campaign_id from public.npcs n where n.id = new.npc_id;
  if new.campaign_id is null then
    raise exception 'A memory belongs to an NPC in a campaign';
  end if;
  new.body := btrim(new.body);
  new.party_member_ids := array(
    select pm.id from public.party_members pm
     where pm.campaign_id = new.campaign_id and pm.id = any (new.party_member_ids)
     order by pm.id);
  new.player_visible_to := array(
    select pm.id from public.party_members pm
     where pm.campaign_id = new.campaign_id and pm.id = any (new.player_visible_to)
     order by pm.id);
  if new.secret_entity_id is not null and not (
    case new.secret_entity_type
      when 'location' then exists (select 1 from public.locations x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'item'     then exists (select 1 from public.items x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'puzzle'   then exists (select 1 from public.puzzle_rooms x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'note'     then exists (select 1 from public.notes x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'faction'  then exists (select 1 from public.factions x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      when 'quest'    then exists (select 1 from public.quests x where x.id = new.secret_entity_id and x.campaign_id = new.campaign_id)
      else false
    end) then
    raise exception 'A memory can only disclose a secret from its own campaign';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_campaign_secrets(p_campaign_id uuid)
 RETURNS TABLE(entity_type text, entity_id uuid, entity_name text, field text, secret_id uuid, excerpt text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;
  return query
    select q.entity_type, q.entity_id, q.entity_name, q.field, q.secret_id, q.excerpt
      from (
        select 'location'::text as entity_type, x.id as entity_id, x.name as entity_name, 'description'::text as field, s.secret_id, s.excerpt
          from public.locations x cross join lateral private.secret_blocks_in(x.description) s
         where x.campaign_id = p_campaign_id
        union all
        select 'item', x.id, x.name, f.field, s.secret_id, s.excerpt
          from public.items x
         cross join lateral (values ('description', x.description), ('mundane_description', x.mundane_description),
                                    ('curse_description', x.curse_description), ('content', x.content)) f(field, value)
         cross join lateral private.secret_blocks_in(f.value) s
         where x.campaign_id = p_campaign_id
        union all
        select 'puzzle', x.id, x.name, f.field, s.secret_id, s.excerpt
          from public.puzzle_rooms x
         cross join lateral (values ('description', x.description), ('read_aloud', x.read_aloud)) f(field, value)
         cross join lateral private.secret_blocks_in(f.value) s
         where x.campaign_id = p_campaign_id
        union all
        select 'note', x.id, x.title, 'content', s.secret_id, s.excerpt
          from public.notes x cross join lateral private.secret_blocks_in(x.content) s
         where x.campaign_id = p_campaign_id
        union all
        select 'faction', x.id, x.name, 'description', s.secret_id, s.excerpt
          from public.factions x cross join lateral private.secret_blocks_in(x.description) s
         where x.campaign_id = p_campaign_id
        union all
        -- A beat's secret is filed under its quest, named "Quest · Beat" (20261029074145).
        select 'quest', q2.id, q2.title || ' · ' || b.title, f.field, s.secret_id, s.excerpt
          from public.quest_beats b
          join public.quests q2 on q2.id = b.quest_id
         cross join lateral (values ('rumor_text', b.rumor_text), ('reveal_text', b.reveal_text)) f(field, value)
         cross join lateral private.secret_blocks_in(f.value) s
         where b.campaign_id = p_campaign_id
      ) q
     order by q.entity_type, q.entity_name, q.secret_id;
end;
$function$;
