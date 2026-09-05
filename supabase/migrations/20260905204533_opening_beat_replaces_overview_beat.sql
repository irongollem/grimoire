-- The opening beat replaces the overview beat. Story #793, epic #780.
-- Finishes the database half of #792 on the way through.
--
-- `is_overview` existed to give generation one's quest-wide prose a home inside
-- generation two. Keeping it alive cost five special cases: a trigger to mint
-- it, a function to stop anyone deleting it, a partial unique index, an
-- exclusion from jump search and an exclusion from the player projection.
--
-- ── Demote, do not delete ───────────────────────────────────────────────────
--
-- The first plan was to delete every overview beat, on the evidence that not
-- one of them locally held anything its quest's `summary` did not. That was a
-- local artefact and nearly destroyed authored work: the local rows were minted
-- by `backfill_quest_story_flows` AFTER the seed, so they never passed through
-- `20260810220934`. Production went through it, and has had the overview beat
-- as the DM's front page for four weeks — 5 of 19 are wired into the edge graph
-- as roots with outgoing edges, two runs were STARTED on one, one carries 741
-- characters of hand-written prose, and all seven quests with notes already
-- keep that prose in the beat.
--
-- So the DM already treats "X — overview" as the opening beat. This migration
-- makes that true rather than replacing it: the beats stay, keep their edges,
-- transitions, loot and prose, and simply stop being special. Only husks go —
-- beats provably empty after the prose moves.
--
-- ── The opening beat is a root, not a flag ──────────────────────────────────
--
-- A stored "opening" flag would need minting for every quest (a trigger),
-- uniqueness (an index), protection from deletion (a guard), and an exclusion
-- in everything not about it. That is the five special cases with a new column
-- name. A root — a beat with no incoming edge — needs none of them, and it is
-- already the only definition of a start in the schema: the `roots` CTE in
-- `get_player_visible_quest_beats`. It also handles what a flag cannot: a quest
-- the party can enter at the tavern or the docks has two roots, and that is a
-- real authoring choice rather than a conflict to resolve.
--
-- ── `quests.summary` stays; its copies do not ───────────────────────────────
--
-- Owner's call, against this story's literal deletes line and for its intent.
-- A premise is neither an event nor state — it is the title's long form, read
-- by the quest list, the kanban card, board search, the player journal and the
-- MCP digest, and no beat field means "premise". The duplication the line was
-- aimed at is real but lives elsewhere: production copies `summary` into
-- `presentation_hint` on 17 beats and `dm_content` on 11. Those copies are
-- nulled here, leaving one fact with one home. `description` and `notes` are
-- the genuine leftovers and are moved into the beat, then dropped.

-- ── 0. Capture, before the flag stops identifying them ──────────────────────

create temporary table _overview_beats on commit drop as
  select id, quest_id from public.quest_beats where is_overview;

-- ── 1. The one quest whose prose has nowhere to go ──────────────────────────
--
-- `quest_beats.campaign_id` is NOT NULL, so a campaign-less quest can never own
-- a beat. Production has exactly one: "Test the grimoire", created 31 Jul, no
-- campaign, no beats, a summary and description that are both literally test
-- copy, reachable only by direct URL since every list filters on campaign.
-- Reviewed by the owner and deleted deliberately rather than migrated.

delete from public.quests
 where campaign_id is null
   and title = 'Test the grimoire'
   and not exists (select 1 from public.quest_beats b where b.quest_id = quests.id);

-- Anything else in that shape is not a known test row, so stop rather than
-- silently eat prose. This is the assertion that makes the delete above safe to
-- read as narrow.
do $$
declare v_count integer;
begin
  -- The parentheses are load-bearing. `and` binds tighter than `or`, so without
  -- them this reads "has a description, OR (has notes AND has no beat)" — the
  -- beat guard never reaches the description arm, and every quest with a
  -- description counts as unmigratable. On production that is 7 quests, so the
  -- assertion raises, the transaction rolls back, and every migration queued
  -- behind this one is stranded. Local cannot catch it: `seed.sql` no longer
  -- carries these columns at all, so the count is 0 either way.
  select count(*) into v_count
  from public.quests q
  where (coalesce(btrim(q.description), '') <> '' or coalesce(btrim(q.notes), '') <> '')
    and not exists (select 1 from public.quest_beats b where b.quest_id = q.id);
  if v_count > 0 then
    raise exception 'quest prose with no beat to move it into (% quests); resolve before releasing', v_count;
  end if;
end $$;

-- ── 2. Move the prose into the beat ─────────────────────────────────────────
--
-- Two fields to two fields, so nothing loses its distinction: `description` is
-- the DM's lead, `notes` is how it plays. This re-runs the rule `20260810220934`
-- already applied, idempotently — in production it copies one description and
-- no notes, because the rest are already there.

update public.quest_beats b
   set dm_content = btrim(q.description)
  from public.quests q
 where q.id = b.quest_id
   and b.id in (select id from _overview_beats)
   and coalesce(btrim(q.description), '') <> ''
   and (b.dm_content is null or b.dm_content = btrim(q.summary));

update public.quest_beats b
   set how_it_plays = btrim(q.notes)
  from public.quests q
 where q.id = b.quest_id
   and b.id in (select id from _overview_beats)
   and coalesce(btrim(q.notes), '') <> ''
   and b.how_it_plays is null;

-- ── 3. Verify the move before anything is dropped ───────────────────────────

do $$
declare v_lost integer;
begin
  select count(*) into v_lost
  from public.quests q
  join _overview_beats ob on ob.quest_id = q.id
  join public.quest_beats b on b.id = ob.id
  where (coalesce(btrim(q.description), '') <> '' and b.dm_content is distinct from btrim(q.description))
     or (coalesce(btrim(q.notes), '') <> '' and b.how_it_plays is distinct from btrim(q.notes));
  if v_lost > 0 then
    raise exception 'prose failed to land on % beats; refusing to drop the columns', v_lost;
  end if;
end $$;

-- ── 4. Null the premise copies — the duplication that was actually there ────

update public.quest_beats b
   set presentation_hint = null
  from public.quests q
 where q.id = b.quest_id and b.presentation_hint = btrim(q.summary);

update public.quest_beats b
   set dm_content = null
  from public.quests q
 where q.id = b.quest_id and b.dm_content = btrim(q.summary);

-- ── 5. Finish #792: the `objective` attachment type ─────────────────────────
--
-- #792 deleted this type from the client and left it in the schema — the CHECK
-- still admitted it, 42 rows still existed, and the arm below still projected
-- them to players. A type deleted on one side and alive on the other is worse
-- than either, so it ends here.
--
-- The 48 "Quest-wide material" rows go with them: every one is a backfill
-- projection with a matching `quest_refs` row, which is where that truth lives.

delete from public.quest_beat_attachments where attachment_type = 'objective';

delete from public.quest_beat_attachments a
 where a.beat_id in (select id from _overview_beats)
   and a.role = 'Quest-wide material'
   and exists (select 1 from public.quest_refs qr where qr.quest_id = a.quest_id);

alter table public.quest_beat_attachments
  drop constraint if exists quest_beat_attachments_attachment_type_check;

alter table public.quest_beat_attachments
  add constraint quest_beat_attachments_attachment_type_check
  check (attachment_type in (
    'encounter', 'quest_ref', 'location_set', 'npc', 'faction', 'item',
    'monster', 'sound', 'audio_scene', 'playlist', 'note', 'handout'
  ));

-- The validator still knew the type too. A CHECK that no longer admits
-- 'objective' makes this branch unreachable rather than gone, which is the same
-- half-deletion #792 shipped: the type was removed from the client and left in
-- the schema. Rebuilt from the live body with that arm dropped, so the type is
-- now absent from the client, the constraint, the rows, the player projection
-- and the validator — every place it existed.

CREATE OR REPLACE FUNCTION private.validate_quest_beat_attachment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_valid boolean := false;
begin
  -- An `else` arm on purpose. Without one, an attachment_type the CHECK no
  -- longer admits — an old browser tab still posting 'objective', say — fails
  -- with CASE_NOT_FOUND (SQLSTATE 20000), which PostgREST has no 4xx mapping
  -- for and returns as a 500. Fail closed either way, but say so in a class the
  -- client can read.
  case new.attachment_type
    when 'encounter' then
      select exists(select 1 from encounters e where e.id = new.ref_id::uuid and e.campaign_id = new.campaign_id) into v_valid;
    when 'quest_ref' then
      select exists(select 1 from quest_refs r where r.id = new.ref_id::uuid and r.quest_id = new.quest_id) into v_valid;
    when 'location_set' then
      select exists(
        select 1 from locations l
        where l.id = new.ref_id::uuid
          and (l.campaign_id = new.campaign_id or (l.campaign_id is null and (l.user_id = auth.uid() or l.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))
      ) and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(new.metadata->'room_ids', '[]'::jsonb)) room(id)
        where not exists (
          select 1 from locations l
          where l.id = room.id::uuid
            and (l.campaign_id = new.campaign_id or (l.campaign_id is null and (l.user_id = auth.uid() or l.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))
        )
      ) into v_valid;
    when 'npc' then
      select exists(select 1 from npcs n where n.id = new.ref_id::uuid and (n.campaign_id = new.campaign_id or (n.campaign_id is null and (n.user_id = auth.uid() or n.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'faction' then
      select exists(select 1 from factions f where f.id = new.ref_id::uuid and (f.campaign_id = new.campaign_id or (f.campaign_id is null and (f.user_id = auth.uid() or f.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'item' then
      select exists(select 1 from items i where i.id = new.ref_id::uuid and (i.campaign_id = new.campaign_id or (i.campaign_id is null and (i.user_id = auth.uid() or i.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'monster' then
      select exists(select 1 from monsters m where m.id = new.ref_id::uuid and (m.campaign_id = new.campaign_id or (m.campaign_id is null and (m.user_id = auth.uid() or m.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'sound' then
      select exists(select 1 from sounds s where s.id = new.ref_id::uuid and s.campaign_id = new.campaign_id) into v_valid;
    when 'audio_scene' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'ambient') into v_valid;
    when 'playlist' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'music') into v_valid;
    when 'note' then
      select exists(select 1 from notes n where n.id = new.ref_id::uuid and n.campaign_id = new.campaign_id) into v_valid;
    when 'handout' then
      select exists(select 1 from scriptorium_documents d where d.id = new.ref_id::uuid and (d.user_id = auth.uid() or d.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))) into v_valid;
    else
      v_valid := false;
  end case;

  if not v_valid then
    raise exception 'Invalid % attachment % for quest % in campaign %',
      new.attachment_type, new.ref_id, new.quest_id, new.campaign_id
      using errcode = '23514';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'Attachment reference must be a valid UUID for type %', new.attachment_type
    using errcode = '23514';
end;
$function$;

-- ── 6. The protector has to go before the demotion it would block ───────────

drop trigger if exists protect_quest_overview_beat on public.quest_beats;
drop function if exists private.protect_quest_overview_beat();

-- `overview` was never an authored kind: only the trigger and the backfill ever
-- wrote it, the composer never offered it, and `QUEST_BEAT_KINDS` does not list
-- it. Left in place it becomes the flag's shadow — the next exclusion would be
-- written as `kind <> 'overview'` and the outline would print it as a scene kind
-- forever.
update public.quest_beats
   set is_overview = false,
       kind = case when kind = 'overview' then 'neutral' else kind end
 where id in (select id from _overview_beats);

-- ── 7. Delete only what is provably empty ───────────────────────────────────

do $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(b.id), '{}') into v_ids
  from public.quest_beats b
  where b.id in (select id from _overview_beats)
    and b.dm_content is null and b.how_it_plays is null
    and b.presentation_hint is null and b.read_aloud is null
    and b.outcomes is null and b.consequences is null
    and b.visibility = 'hidden'
    and not exists (select 1 from public.quest_beat_edges e
                     where e.source_beat_id = b.id or e.target_beat_id = b.id)
    and not exists (select 1 from public.quest_beat_transitions t
                     where t.from_beat_id = b.id or t.to_beat_id = b.id)
    and not exists (select 1 from public.quest_beat_loot l where l.beat_id = b.id)
    and not exists (select 1 from public.quest_beat_attachments a where a.beat_id = b.id);

  delete from public.quest_beats where id = any(v_ids);
  raise notice 'removed % empty overview husks: %', coalesce(array_length(v_ids, 1), 0), v_ids;
end $$;

-- ── 8. Drop the machinery ───────────────────────────────────────────────────

drop trigger if exists create_quest_overview_beat on public.quests;
drop function if exists private.create_quest_overview_beat();
drop function if exists private.backfill_quest_story_flows(boolean);
drop index if exists public.quest_beats_one_overview_per_quest;
alter table public.quest_beats drop column if exists is_overview;

-- ── 9. The two definers that knew about the flag ────────────────────────────
--
-- Rebuilt from their LIVE bodies (`pg_get_functiondef`), not from the migrations
-- that wrote them — both have been replaced several times, and copying the wrong
-- one silently reverts whatever the others fixed. Everything but the marked
-- changes is byte for byte what is running.

CREATE OR REPLACE FUNCTION public.search_quest_runtime_jump_targets(p_campaign_id uuid, p_quest_id uuid, p_search text DEFAULT ''::text, p_limit integer DEFAULT 30)
 RETURNS TABLE(quest_id uuid, beat_id uuid, quest_title text, beat_title text, beat_kind text, is_improvised boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select q.id, b.id, q.title, b.title, b.kind, b.is_improvised
  from public.quest_beats b
  join public.quests q on q.id = b.quest_id
  where b.campaign_id = p_campaign_id
    and b.quest_id = p_quest_id
    and b.kind <> 'archived'
    and (
      nullif(btrim(p_search), '') is null
      or b.title ilike '%' || p_search || '%'
    )
  order by b.title, b.created_at
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_visible_quest_beats(p_campaign_id uuid, p_quest_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, quest_id uuid, campaign_id uuid, visibility text, kind text, presentation_hint text, player_text text, story_order integer, attachments jsonb, visits jsonb, updated_at timestamp with time zone)
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
$function$;


-- ── 10. The columns, and the projection whose shape they define ─────────────
--
-- `get_player_visible_quests` returns `setof quests` with a POSITIONAL column
-- list naming `q.description` and a `null::text` in the notes slot. Dropping the
-- columns does not fail the function — it fails every player quest list at call
-- time instead. Recreated immediately after, in the same migration, from its
-- live body minus those two positions.

-- `quests_updated_at` names every meaningful column in its WHEN clause,
-- `description` and `notes` among them, so Postgres refuses to drop either
-- while it stands ("cannot drop column description ... because other objects
-- depend on it"). Recreated without them, and only them — the rest of the list
-- is unchanged, so the column set that counts as a real edit is the same minus
-- two fields that no longer exist.
drop trigger if exists quests_updated_at on public.quests;
create trigger quests_updated_at
  before update on public.quests
  for each row
  when (old.parent_quest_id is distinct from new.parent_quest_id
       or old.title is distinct from new.title
       or old.summary is distinct from new.summary
       or old.status is distinct from new.status
       or old.giver_npc_id is distinct from new.giver_npc_id
       or old.location_id is distinct from new.location_id
       or old.rewards is distinct from new.rewards
       or old.reward_pp is distinct from new.reward_pp
       or old.reward_gp is distinct from new.reward_gp
       or old.reward_ep is distinct from new.reward_ep
       or old.reward_sp is distinct from new.reward_sp
       or old.reward_cp is distinct from new.reward_cp
       or old.tags is distinct from new.tags
       or old.reward_item_ids is distinct from new.reward_item_ids
       or old.reward_currency_pools is distinct from new.reward_currency_pools
       or old.started_at is distinct from new.started_at
       or old.resolved_at is distinct from new.resolved_at)
  execute procedure update_updated_at();

alter table public.quests drop column if exists description;
alter table public.quests drop column if exists notes;

CREATE OR REPLACE FUNCTION public.get_player_visible_quests(p_campaign_id uuid DEFAULT NULL::uuid, p_quest_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF quests
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_preview_party_member_id is not null and not exists (
    select 1 from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then raise exception 'Preview audience is not available to this DM'; end if;

  return query select
    q.id, q.user_id, q.campaign_id, q.parent_quest_id, q.title, q.summary,
    q.status, q.giver_npc_id, q.location_id, q.rewards, q.tags,
    q.started_at, q.resolved_at, q.created_at, q.updated_at,
    q.reward_pp, q.reward_gp, q.reward_ep, q.reward_sp, q.reward_cp,
    q.reward_currency_pools, q.reward_item_ids,
    q.reward_art_objects, q.player_visible_to, q.ai_provenance,
    q.flow_enabled_at
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
$function$;

-- Left for #799 deliberately: `flow_enabled_at`, `conversion_source_type/_id`
-- and their constraint and index. Their last writer (`backfill_quest_story_flows`)
-- dies above, so they are now inert — but they are that story's manifest line,
-- not this one's, and folding them in would hide the deletion inside a bigger
-- change.
