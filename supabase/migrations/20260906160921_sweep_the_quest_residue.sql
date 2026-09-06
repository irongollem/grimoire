-- Sweep the residue. Story #799, epic #780 — the last story.
--
-- The epic's manifest is an acceptance test about *absence*. This closes the
-- lines that survived, and narrows one that was wrong.
--
-- Nothing here quotes a row's contents. Every data move below is expressed as a
-- rule over the column, never as a literal, because this repo is public and the
-- rows in question include a DM's copy of a commercially published adventure.
-- "Reviewable" means reviewable as logic.

-- ── 1. `quests.summary` stays, and becomes provably a blurb ─────────────────
--
-- The manifest read "Writable quests.summary / description / notes". The other
-- two were duplicate homes for story prose and are already gone. `summary` was
-- bracketed with them and should not have been: it is the quest's identity
-- line — the blurb that tells you what a quest is without opening it — and it
-- appears on the DM quest card, the kanban board, the player's quest-log card,
-- the player's quest page, and quest search. A beat cannot serve that role; a
-- list card cannot render a graph.
--
-- The measurement, before deciding: 19 of 20 production quests have one, and
-- the two DMs other than the owner filled it on *every* quest they made, at 59
-- and 32 characters — one sentence, no newlines, no prose. It is the one field
-- every DM fills, including the two who never authored a beat.
--
-- But the intent lived only in a placeholder string, a prompt row and a code
-- comment, which is rule 1 of this epic violated verbatim: one writer per fact,
-- enforced by the database, never deprecated in a comment. And it had already
-- regressed — one row holds five sentences, because the importer caps `summary`
-- with the same 600-character limit it uses for a character backstory.
--
-- So the constraint is the deletion. `summary` is one line because the database
-- says so, not because four call sites agree.

-- Move the overflow before constraining, so nothing is truncated: a cut
-- sentence is a lie. The first sentence stays as the blurb; the remainder joins
-- the quest's opening beat, where prose belongs and where the rumor/reveal
-- split can hold back anything the players should not read. Expressed as a
-- regex over the column — no row's text appears in this file.
--
-- The pattern matches up to the FIRST sentence terminator and is deliberately
-- unbounded: Postgres caps bounded repetition at 255, so the obvious
-- `^.{1,280}?[.!?]` raises `invalid regular expression: invalid repetition
-- count(s)` and takes the whole migration — and everything queued behind it —
-- down with it. That could not be caught locally, because `db reset` applies
-- migrations *before* it seeds, so this block always runs against an empty
-- table here. Verified by dry-running the expression against production.
do $$
declare
  v_moved   integer := 0;
  v_orphan  integer := 0;
begin
  with overlong as (
    select q.id as quest_id,
           btrim(substring(q.summary from '^[^.!?]*[.!?]')) as head,
           btrim(regexp_replace(q.summary, '^[^.!?]*[.!?]\s*', '')) as tail
      from public.quests q
     where char_length(q.summary) > 280
  ),
  -- The opening beat is the graph root, computed the same way the client
  -- computes it (#793): a live, non-improvised beat with no incoming edge.
  roots as (
    select distinct on (b.quest_id) b.quest_id, b.id as beat_id
      from public.quest_beats b
      join overlong o on o.quest_id = b.quest_id
     where b.kind <> 'archived'
       and not b.is_improvised
       and not exists (
         select 1 from public.quest_beat_edges e where e.target_beat_id = b.id
       )
     order by b.quest_id, b.canvas_x, b.created_at, b.id
  )
  update public.quest_beats b
     set dm_content = case
           when coalesce(btrim(b.dm_content), '') = '' then o.tail
           else b.dm_content || E'\n\n' || o.tail
         end
    from overlong o
    join roots r on r.quest_id = o.quest_id
   where b.id = r.beat_id
     and coalesce(btrim(o.tail), '') <> '';
  get diagnostics v_moved = row_count;

  -- Only shorten a summary whose tail actually landed. A quest can legitimately
  -- have beats and yet no ROOT beat — every beat archived, every beat
  -- improvised, or a cycle with no zero-incoming-edge node; `rootBeatIds` in
  -- src/lib/quests/graph.ts documents that as a normal graph state, not an
  -- impossible one. Truncating regardless would drop the tail on the floor
  -- while this block's own comment promises it never truncates.
  update public.quests q
     set summary = o.head
    from (
      select q2.id as quest_id,
             btrim(substring(q2.summary from '^[^.!?]*[.!?]')) as head,
             btrim(regexp_replace(q2.summary, '^[^.!?]*[.!?]\s*', '')) as tail
        from public.quests q2
       where char_length(q2.summary) > 280
    ) o
   where q.id = o.quest_id
     and coalesce(btrim(o.head), '') <> ''
     and (
       coalesce(btrim(o.tail), '') = ''
       or exists (
         select 1 from public.quest_beats b
          where b.quest_id = q.id
            and b.kind <> 'archived'
            and not b.is_improvised
            and not exists (select 1 from public.quest_beat_edges e where e.target_beat_id = b.id)
       )
     );

  -- Anything still too long has no sentence boundary in its first 280
  -- characters. Fail loudly rather than truncate: a summary that cannot be cut
  -- cleanly is a judgement call for its author, not for a migration.
  -- Anything still over the cap either had no sentence break in it, or had a
  -- tail with no beat to carry it. Both are judgement calls for the author, so
  -- fail loudly rather than quietly lose a sentence.
  select count(*) into v_orphan from public.quests where char_length(summary) > 280;
  if v_orphan > 0 then
    raise exception 'ABORT: % quest summary(ies) still exceed 280 characters — either no sentence break to split on, or no opening beat to carry the remainder. Shorten them by hand, or give the quest an opening beat, before applying.', v_orphan;
  end if;

  raise notice 'summary: % overflow(s) moved to an opening beat', v_moved;
end $$;

alter table public.quests
  add constraint quests_summary_is_one_line
  check (
    summary is null
    or (char_length(summary) <= 280 and summary !~ E'[\n\r]')
  );

comment on column public.quests.summary is
  'The blurb that lets you tell what a quest is without opening it. One line, '
  'by CHECK — not prose, which belongs on a beat. Shown on the DM quest card, '
  'the kanban board, the player quest log and the player quest page, and '
  'matched by quest search. Player-facing: never put a DM secret here (#799).';

-- ── 2. Quest-level rewards go; loot belongs to the beat that grants it ──────
--
-- Unlike `summary`, these have **no editor**. `QuestOverviewMetadata` offers
-- title, premise, status, giver, location, parent and tags — no rewards. The
-- only writers are the two creation paths, and they write zeroes; the only
-- reader is the player's quest page. So the values are frozen and uneditable,
-- authored by a generation-one editor deleted in August.
--
-- The replacement is live and better used: `quest_beat_loot` holds 32 rows
-- against 7 quest-level reward texts, 3 with coin and 3 with items. Loot is an
-- event — the party is given it at a moment — which is what a beat is.
--
-- The free-text `rewards` is preserved onto the opening beat rather than
-- dropped. The structured columns are not: `reward_art_objects` is empty
-- everywhere, `reward_currency_pools` is non-null on every row (a default, not
-- an authorship), and coin/items exist on three quests each.
do $$
declare
  v_moved  integer := 0;
  v_lost   text;
begin
  with sourced as (
    select q.id as quest_id, btrim(q.rewards) as text
      from public.quests q
     where coalesce(btrim(q.rewards), '') <> ''
  ),
  -- The LAST beat, not the first: a reward is what you get for finishing, so
  -- it belongs where the chain ends — "report back to the quest giver". A
  -- terminal beat is one with no outgoing edge; where a fork leaves several,
  -- the ordering picks one deterministically rather than duplicating the text
  -- across every ending.
  roots as (
    select distinct on (b.quest_id) b.quest_id, b.id as beat_id
      from public.quest_beats b
      join sourced s on s.quest_id = b.quest_id
     where b.kind <> 'archived'
       and not b.is_improvised
       and not exists (select 1 from public.quest_beat_edges e where e.source_beat_id = b.id)
     order by b.quest_id, b.canvas_x desc, b.created_at desc, b.id
  )
  update public.quest_beats b
     set dm_content = case
           when coalesce(btrim(b.dm_content), '') = '' then 'Reward: ' || s.text
           else b.dm_content || E'\n\nReward: ' || s.text
         end
    from sourced s
    join roots r on r.quest_id = s.quest_id
   where b.id = r.beat_id;
  get diagnostics v_moved = row_count;

  -- A quest with nowhere to put it. Deliberately NOT just "has no beats": a
  -- quest can have beats and still have no TERMINAL one — all archived, all
  -- improvised, or a cycle where every beat has an outgoing edge. Counting only
  -- the no-beats case makes this notice under-report exactly the rows it exists
  -- to name. Titles, never the text, so the log says what was dropped without
  -- publishing a word of it.
  select string_agg(q.title, ', ') into v_lost
    from public.quests q
   where coalesce(btrim(q.rewards), '') <> ''
     and not exists (
       select 1 from public.quest_beats b
        where b.quest_id = q.id
          and b.kind <> 'archived'
          and not b.is_improvised
          and not exists (select 1 from public.quest_beat_edges e where e.source_beat_id = b.id)
     );

  raise notice 'rewards: % text(s) moved to an opening beat', v_moved;
  if v_lost is not null then
    raise notice 'rewards: no beat to carry the text on: %', v_lost;
  end if;
end $$;

-- Two objects name these columns and must be rebuilt before the drop, or
-- Postgres refuses with 2BP01. Same wall `20260905204533` hit dropping
-- `description` and `notes`: a trigger's WHEN clause is a dependency like any
-- other. The list is "what counts as a real edit worth restamping updated_at
-- for" — rebuilt minus the payout fields, unchanged otherwise.

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
       or old.tags is distinct from new.tags
       or old.started_at is distinct from new.started_at
       or old.resolved_at is distinct from new.resolved_at)
  execute procedure update_updated_at();

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

  -- Column list narrowed by #799. A SETOF quests projection cannot name a
  -- column that no longer exists, and the quest-level payout fields are dropped
  -- below: loot is an event, so it reaches players through the beat that grants
  -- it (quest_beat_loot), not through the quest header.
  return query select
    q.id, q.user_id, q.campaign_id, q.parent_quest_id, q.title, q.summary,
    q.status, q.giver_npc_id, q.location_id, q.tags,
    q.started_at, q.resolved_at, q.created_at, q.updated_at,
    q.player_visible_to, q.ai_provenance
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

alter table public.quests
  drop column if exists rewards,
  drop column if exists reward_pp,
  drop column if exists reward_gp,
  drop column if exists reward_ep,
  drop column if exists reward_sp,
  drop column if exists reward_cp,
  drop column if exists reward_item_ids,
  drop column if exists reward_art_objects,
  drop column if exists reward_currency_pools;

-- ── 3. A flag that can never be false is not a checkpoint ───────────────────
--
-- `flow_enabled_at NOT NULL DEFAULT now()` is the epic's own worked example of
-- a parallel period with no expiry: it declared the previous migration complete
-- while both stores kept taking writes. Non-null on 20 of 20 production rows.

alter table public.quests drop column if exists flow_enabled_at;

-- ── 4. Conversion provenance ────────────────────────────────────────────────
--
-- Not a no-op, and worth stating plainly: 37 production beats carry a
-- `conversion_source_type`, recording that they were projected from the
-- generation-one shape. That is a real if small loss. It is taken because the
-- provenance describes a migration path that no longer exists in any code —
-- nothing reads these columns outside the TypeScript types — and a column kept
-- only to remember how a row was born is the definition of residue.

drop index if exists public.quest_beats_conversion_source_key;

alter table public.quest_beats
  drop column if exists conversion_source_type,
  drop column if exists conversion_source_id;

-- ── 5. A beat pointing at a pointer ─────────────────────────────────────────
--
-- `quest_ref` is admitted by the CHECK and offered by nothing: it is absent
-- from the attachment panel's supportedTypes on purpose. Zero rows in
-- production and zero locally, so removing it is inert — verified before
-- writing this, per the epic's rule about local data proving nothing.

do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.quest_beat_attachments where attachment_type = 'quest_ref';
  if v_rows > 0 then
    raise exception 'ABORT: % quest_ref attachment(s) exist; this migration assumed none', v_rows;
  end if;
end $$;

alter table public.quest_beat_attachments
  drop constraint if exists quest_beat_attachments_attachment_type_check;

alter table public.quest_beat_attachments
  add constraint quest_beat_attachments_attachment_type_check
  check (attachment_type in (
    'encounter', 'npc', 'faction', 'item',
    'monster', 'sound', 'audio_scene', 'playlist', 'note', 'handout'
  ));

-- The validator knew the type too. Removing it from the CHECK and leaving the
-- branch would make it unreachable rather than gone — the half-deletion #792
-- shipped and #798 found again in the player projection. Rebuilt from the live
-- body with that arm dropped; the `else` arm still fails closed, so an old tab
-- posting the type gets a 23514 rather than a CASE_NOT_FOUND 500.

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
  -- longer admits — an old browser tab posting a type this epic deleted — fails
  -- with CASE_NOT_FOUND (SQLSTATE 20000), which PostgREST has no 4xx mapping
  -- for and returns as a 500. Fail closed either way, but say so in a class the
  -- client can read.
  case new.attachment_type
    when 'encounter' then
      select exists(select 1 from encounters e where e.id = new.ref_id::uuid and e.campaign_id = new.campaign_id) into v_valid;
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
