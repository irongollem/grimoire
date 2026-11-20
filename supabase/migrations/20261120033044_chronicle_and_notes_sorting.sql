-- The Chronicle, and notes without categories (#1226 story 6, frame 12; maintainer, 19 Nov 2026).
--
-- Session notes are canon: they are what happened. A note linked to a session (`notes.session_id`) IS that
-- session's chronicle entry, read on the Canon page's Chronicle and in the Open Book's Chronicle chapter, and no longer
-- listed among the DM's notes. Its rows stay where they are, so the Chronicler, the read-aloud, the pictures that land
-- in a note and the players' reads keep working on the same row; moving them into canon_entries would have rebuilt
-- every one of those for no gain. So canon_entries has no chronicle part after all.
--
-- `notes.category` goes. Production on 19 Nov 2026 held 50 notes: session 21, general 13, lore 12, `dm` 3, `ideas` 1;
-- location, quest and faction were never used. The maintainer used session and lore notes for player characters'
-- backgrounds, so nothing is moved automatically: every lore note, and every session note not linked to a session, is
-- put on a one-time list (`note_sorting`) the DM works through, sending each to a lore entry, a session, a character's
-- backstory, their own note on a character, or keeping it as a note.

-- ── 1. The notes still to sort ────────────────────────────────────────────────
create table public.note_sorting (
  note_id uuid primary key references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- What the note was, which decides what the list suggests for it.
  was text not null constraint note_sorting_was check (was in ('lore', 'session')),
  created_at timestamptz not null default now()
);
create index note_sorting_campaign_idx on public.note_sorting (campaign_id);
create index note_sorting_user_idx on public.note_sorting (user_id);

create trigger zz_same_campaign_refs
  before insert or update of note_id, campaign_id
  on public.note_sorting
  for each row execute procedure private.enforce_same_campaign_refs('note_id', 'notes', 'owned');

create trigger note_sorting_guard_content_author
  before update on public.note_sorting
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- Rows are taken off the list (deleted) when sorted, never edited, so no updated_at.
alter table public.note_sorting enable row level security;
create policy "note_sorting_select" on public.note_sorting for select using (private.is_campaign_dm(campaign_id));
create policy "note_sorting_insert" on public.note_sorting for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "note_sorting_update" on public.note_sorting for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "note_sorting_delete" on public.note_sorting for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.note_sorting to authenticated, service_role;

create trigger note_sorting_signal_insert after insert on public.note_sorting
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger note_sorting_signal_update after update on public.note_sorting
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger note_sorting_signal_delete after delete on public.note_sorting
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('note_sorting', 1, false, 'A one-time list of the DM''s own notes still to sort; a copied campaign starts with nothing to sort.');

insert into public.note_sorting (note_id, user_id, campaign_id, was)
select n.id, n.user_id, n.campaign_id, n.category
  from public.notes n
 where n.campaign_id is not null
   and (n.category = 'lore' or (n.category = 'session' and n.session_id is null));

-- ── 2. A canon entry has no chronicle part ────────────────────────────────────
alter table public.canon_entries drop constraint canon_entries_part;
alter table public.canon_entries add constraint canon_entries_part
  check (part in ('premise', 'truth', 'force', 'secret', 'question', 'lore'));

create or replace function private.canon_entry_seen(p_entry_id uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case e.part
      when 'truth' then
        e.knowledge = 'all'
        or (e.knowledge = 'some' and exists (
              select 1 from public.world_links l
               where l.from_canon_entry_id = e.id and l.type = 'known_to'
                 and (l.to_party_member_id = p_member
                      or exists (select 1 from public.faction_party_members m
                                  where m.faction_id = l.to_faction_id and m.party_member_id = p_member))))
      when 'premise' then e.premise_kind not in ('voice', 'look') and p_member = any (e.player_visible_to)
      when 'lore' then p_member = any (e.player_visible_to)
      when 'secret' then e.revealed_at is not null and p_member = any (e.player_visible_to)
      else false
    end
      from public.canon_entries e
     where e.id = p_entry_id and p_member is not null), false)
$$;

-- ── 3. notes.category goes; its readers are restated without it ───────────────
-- The players' read lists its columns one by one; with the category gone from the row, it is gone from here too.
drop function public.get_player_visible_notes(uuid, uuid);
-- notes_updated_at names the columns whose change stamps the row; it is restated without the category.
drop trigger notes_updated_at on public.notes;
alter table public.notes drop column category;
create trigger notes_updated_at
  before update on public.notes
  for each row when (
    old.title is distinct from new.title or old.content is distinct from new.content
    or old.tags is distinct from new.tags or old.session_id is distinct from new.session_id
    or old.is_pinned is distinct from new.is_pinned
    or old.session_start_year is distinct from new.session_start_year
    or old.session_start_month is distinct from new.session_start_month
    or old.session_start_day is distinct from new.session_start_day
    or old.session_end_year is distinct from new.session_end_year
    or old.session_end_month is distinct from new.session_end_month
    or old.session_end_day is distinct from new.session_end_day
    or old.session_real_date is distinct from new.session_real_date
    or old.linked_calendar_event_id is distinct from new.linked_calendar_event_id)
  execute procedure update_updated_at();

CREATE OR REPLACE FUNCTION public.get_player_visible_notes(p_campaign_id uuid, p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF notes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select
    n.id,
    n.user_id,
    n.title,
    private.withhold_secret_blocks(n.content),
    n.tags,
    n.is_pinned,
    n.created_at,
    n.updated_at,
    n.campaign_id,
    n.is_player_visible,
    n.player_visible_to,
    n.session_start_year,
    n.session_start_month,
    n.session_start_day,
    n.session_end_year,
    n.session_end_month,
    n.session_end_day,
    n.session_real_date,
    n.linked_calendar_event_id,
    n.sort_order,
    n.ai_provenance,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    n.session_id,
    -- The reading (below): a player hears a note they may read, so they are told it has one.
    n.reading_hash,
    n.reading_voice,
    n.reading_chars,
    n.reading_at
  from notes n
  where n.campaign_id = p_campaign_id
    and (
      exists (
        select 1 from campaign_members cm
         where cm.campaign_id = n.campaign_id
           and cm.user_id = (select auth.uid())
           and cm.party_member_id = any (n.player_visible_to)
      )
      or (
        private.is_campaign_dm(n.campaign_id)
        and case
          when p_preview_member_id is not null then p_preview_member_id = any (n.player_visible_to)
          else array_length(n.player_visible_to, 1) is not null
        end
      )
    )
$function$;
revoke execute on function public.get_player_visible_notes(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_notes(uuid, uuid) to authenticated, service_role;

-- The notes search took a list of categories, and its one narrowing caller (the Chronicler's spoiler gate: earlier
-- session reports only) now asks for session notes, which are the notes linked to a session.
drop function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, text[], integer);
-- hnsw.iterative_scan is registered when pgvector's library loads; touching the type loads it, or the function's SET
-- below fails with "permission denied to set parameter" in a session that has not used it (20261010133319).
select '[1]'::extensions.vector;
create function public.match_campaign_notes(
  query_embedding extensions.vector,
  p_campaign_id uuid,
  p_owner_id uuid,
  p_embedding_model text,
  p_exclude_id uuid,
  p_session_notes_only boolean,
  match_count integer)
returns table (id uuid, title text, session_num integer, distance double precision)
language sql
stable
set search_path to 'public', 'extensions'
set "hnsw.iterative_scan" to 'strict_order'
as $function$
  select
    n.id,
    n.title,
    s.number,
    e.embedding <=> query_embedding as distance
  from public.note_embeddings e
  join public.notes n on n.id = e.note_id
  left join public.campaign_sessions s on s.id = n.session_id
  where (
      (
        n.campaign_id = p_campaign_id
        and (
          n.user_id = p_owner_id
          or exists (
            select 1
            from public.campaign_members cm
            where cm.campaign_id = p_campaign_id
              and cm.user_id = n.user_id
              and cm.role = 'dm'
          )
        )
      )
      or (n.campaign_id is null and n.user_id = p_owner_id)
    )
    and e.embedding_model = p_embedding_model
    and (p_exclude_id is null or n.id <> p_exclude_id)
    and (not p_session_notes_only or n.session_id is not null)
  order by e.embedding <=> query_embedding
  limit match_count;
$function$;
revoke execute on function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, boolean, integer)
  to service_role;

-- The Open Book's Chronicle reads the notes linked to a session.
CREATE OR REPLACE FUNCTION private.open_book_snapshot(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_book public.open_books;
  v_campaign public.campaigns;
  v_party uuid[];
  v_places jsonb := '[]'::jsonb;
  v_folk jsonb := '[]'::jsonb;
  v_factions jsonb := '[]'::jsonb;
  v_pantheons jsonb := '[]'::jsonb;
  v_deities jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_truths jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_cited uuid[];
  v_entry_ids uuid[];
  v_ties jsonb := '[]'::jsonb;
  v_concealed uuid[];
begin
  select * into v_book from public.open_books where campaign_id = p_campaign_id;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  select coalesce(array_agg(pm.id), '{}'::uuid[]) into v_party
    from public.party_members pm where pm.campaign_id = p_campaign_id;

  if 'atlas' = any (v_book.chapters) then
    -- As get_player_visible_locations: description and map only when shared, DM notes and audio never, and
    -- only the pins players may see.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'parent_id', l.parent_id,
             'name', l.name,
             'location_type', l.location_type,
             'player_summary', l.player_summary,
             'description', case when l.is_description_shared then private.withhold_secret_blocks(l.description) end,
             'image_url', l.image_url,
             'tags', to_jsonb(l.tags),
             'is_level', l.is_level,
             'is_battle_map', l.is_battle_map,
             'npcs_shared', l.is_npcs_shared,
             'map', case when l.is_map_shared then jsonb_build_object(
                      'url', l.map_url,
                      'layer_url', l.map_layer_url,
                      'layer_calibration', l.map_layer_calibration,
                      'plan_size', l.plan_size,
                      'scale', l.map_scale) end,
             'pins', coalesce((
                      select jsonb_agg(pin)
                        from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
                       where coalesce((pin->>'visible_to_players')::boolean, false)), '[]'::jsonb)
           ) order by l.sort_order nulls last, l.name), '[]'::jsonb)
      into v_places
      from public.locations l
     where l.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'location', l.id,
             private.open_book_whole_party(l.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'folk' = any (v_book.chapters) then
    -- As get_player_visible_npcs: only the fields the DM shares, the cover while a disguise holds, the cover the
    -- party knew once it falls, and no prose (players are never shown an NPC's appearance, personality or
    -- backstory). A person whose name is not shared has no page to be on.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', case when s.concealed and s.disguise_name is not null then s.disguise_name else s.name end,
             'race', case when 'race' = any (s.player_visible_fields) then s.race end,
             'occupation', case when 'occupation' = any (s.player_visible_fields) then s.occupation end,
             'status', s.status,
             'relationship', s.relationship,
             'portrait_url', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
                else s.portrait_url end,
             'portrait_focal_point', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
                else s.portrait_focal_point end,
             'cutout_url', case when 'portrait' = any (s.player_visible_fields) and not s.concealed then s.cutout_url end,
             'location_id', case when 'location' = any (s.player_visible_fields) then s.location_id end,
             'former_name', case when s.unmasked then s.disguise_name end,
             'former_portrait_url', case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url end
           ) order by s.name), '[]'::jsonb)
      into v_folk
      from (
        select n.*,
          ((n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed) as concealed,
          (n.is_revealed and n.unmasked_at is not null
            and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
          from public.npcs n
         where n.campaign_id = p_campaign_id
           and 'name' = any (n.player_visible_fields)
      ) s
     where private.open_book_takes(p_campaign_id, 'npc', s.id,
             private.open_book_whole_party(s.player_visible_to, v_party)
             -- or shared with the party through the place they live, as the projection's arm (b)
             or exists (
               select 1 from public.locations l
                where l.id = s.location_id
                  and l.is_npcs_shared
                  and private.open_book_whole_party(l.player_visible_to, v_party)),
             v_book.include_shared);
  end if;

  if 'factions' = any (v_book.chapters) then
    -- As get_player_visible_factions: descent is the party's to know, the succession custom is not.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'faction_type', f.faction_type,
             'description', private.withhold_secret_blocks(f.description),
             'emblem_url', f.emblem_url,
             'alignment', f.alignment,
             'tags', to_jsonb(f.tags),
             'party_standing', f.party_standing,
             'descent', f.descent
           ) order by f.name), '[]'::jsonb)
      into v_factions
      from public.factions f
     where f.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'faction', f.id,
             private.open_book_whole_party(f.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'pantheon' = any (v_book.chapters) then
    -- Players read pantheons and deities as raw rows (DM notes on them live in entity_notes, which the book never
    -- reads); the book also strips the secret blocks the raw read would show.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'description', private.withhold_secret_blocks(p.description),
             'emblem_url', p.emblem_url,
             'tags', to_jsonb(p.tags)
           ) order by p.name), '[]'::jsonb)
      into v_pantheons
      from public.pantheons p
     where p.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'pantheon', p.id,
             private.open_book_whole_party(p.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'pantheon_id', d.pantheon_id,
             'name', d.name,
             'titles', d.titles,
             'alternate_names', to_jsonb(d.alternate_names),
             'alignment', d.alignment,
             'symbol', d.symbol,
             'symbol_image_url', d.symbol_image_url,
             'portrait_url', d.portrait_url,
             'portrait_focal_point', d.portrait_focal_point,
             'domains', to_jsonb(d.domains),
             'portfolio', d.portfolio,
             'description', private.withhold_secret_blocks(d.description),
             'tags', to_jsonb(d.tags)
           ) order by d.name), '[]'::jsonb)
      into v_deities
      from public.deities d
     where d.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'deity', d.id,
             private.open_book_whole_party(d.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'lore' = any (v_book.chapters) then
    -- The canon (#1226): lore the whole party can read, told as far as the whole party has been told it (the first
    -- passage with the entry, a later one once every member has heard it), and the truths known to all. Never a
    -- secret, a force, an open question or a truth known only to some.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'lore_kind', e.lore_kind,
             'world_date', case when e.world_year is not null then jsonb_build_object(
                             'year', e.world_year, 'month', e.world_month, 'day', e.world_day) end,
             'image_url', e.image_url,
             'body', private.withhold_secret_blocks(e.body),
             'passages', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'title', p.title,
                        'body', private.withhold_secret_blocks(p.body)
                      ) order by p.sort_order, p.created_at), '[]'::jsonb)
                 from public.canon_lore_passages p
                where p.entry_id = e.id
                  and (p.id = (select f.id from public.canon_lore_passages f where f.entry_id = e.id
                                order by f.sort_order, f.created_at limit 1)
                       or private.open_book_whole_party(p.player_visible_to, v_party))),
             'created_at', e.created_at
           ) order by e.world_year nulls last, e.world_month nulls last, e.world_day nulls last, e.sort_order, e.title),
           '[]'::jsonb)
      into v_lore
      from public.canon_entries e
     where e.campaign_id = p_campaign_id
       and e.part = 'lore'
       and private.open_book_takes(p_campaign_id, 'canon', e.id,
             private.open_book_whole_party(e.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.sort_order, e.created_at),
           '[]'::jsonb)
      into v_truths
      from public.canon_entries e
     where e.campaign_id = p_campaign_id
       and e.part = 'truth' and e.knowledge = 'all'
       and private.open_book_takes(p_campaign_id, 'canon', e.id, true, v_book.include_shared);
  end if;

  if 'chronicle' = any (v_book.chapters) then
    -- The Chronicle: a note linked to a session is that session's chronicle entry (#1226 story 6), with the session.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'session', case when cs.id is not null then jsonb_build_object(
                          'number', cs.number, 'title', cs.title, 'played_on', cs.played_on) end,
             'date', case when n.session_start_year is not null then jsonb_build_object(
                       'year', n.session_start_year, 'month', n.session_start_month, 'day', n.session_start_day,
                       'end_year', n.session_end_year, 'end_month', n.session_end_month, 'end_day', n.session_end_day) end,
             'real_date', n.session_real_date,
             'created_at', n.created_at
           ) order by cs.number nulls last, n.session_real_date nulls last, n.created_at), '[]'::jsonb)
      into v_sessions
      from public.notes n
      left join public.campaign_sessions cs on cs.id = n.session_id
     where n.campaign_id = p_campaign_id
       and n.session_id is not null
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);

    -- The calendar players already read (calendar_events_select): shown events and every session. Never the
    -- DM's links to quests, encounters or places.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'description', private.withhold_secret_blocks(e.description),
             'event_type', e.event_type,
             'year', e.year, 'month', e.month, 'day', e.day,
             'festival_day', e.festival_day,
             'is_multi_day', e.is_multi_day,
             'end_year', e.end_year, 'end_month', e.end_month, 'end_day', e.end_day,
             'color', e.color
           ) order by e.year nulls last, e.month nulls last, e.day nulls last), '[]'::jsonb)
      into v_events
      from public.calendar_events e
     where e.campaign_id = p_campaign_id
       and (e.player_visible or e.event_type = 'session');
  end if;

  -- Rich text mentions people and places by id only (entityMention stores no label), so the book carries a
  -- name for every id its own pages cite, when the whole table can already read that name: the party's
  -- characters, people under their cover, places and factions. Only cited ids: an entry the DM took out keeps
  -- its name out of the book unless released text names it. A mention of anything else stays unnamed.
  -- Cited means an entityMention in the released text, nothing else: a place's parent_id, a pin or a file name
  -- also hold ids, and reading those would name a place the DM took out (#1085 audit).
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
    into v_cited
    from (
      select jsonb_path_query(v_places, '$[*].description') #>> '{}' as doc
      union all select jsonb_path_query(v_factions, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_pantheons, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_deities, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].body') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].passages[*].body') #>> '{}'
      union all select jsonb_path_query(v_sessions, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_events, '$[*].description') #>> '{}'
    ) t
    cross join lateral unnest(private.open_book_mentions(t.doc)) as c(id);

  select coalesce(jsonb_object_agg(x.id::text, x.name), '{}'::jsonb)
    into v_names
    from (
      select pm.id, pm.name from public.party_members pm where pm.campaign_id = p_campaign_id
      union all
      select n.id,
             case when (n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed
                       and n.disguise_name is not null
                  then n.disguise_name else n.name end
        from public.npcs n
       where n.campaign_id = p_campaign_id
         and 'name' = any (n.player_visible_fields)
         and (private.open_book_whole_party(n.player_visible_to, v_party)
              or exists (
                select 1 from public.locations l
                 where l.id = n.location_id
                   and l.is_npcs_shared
                   and private.open_book_whole_party(l.player_visible_to, v_party)))
      union all
      select l.id, l.name from public.locations l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select f.id, f.name from public.factions f
       where f.campaign_id = p_campaign_id and private.open_book_whole_party(f.player_visible_to, v_party)
    ) x
   where x.name is not null
     and x.id = any (v_cited);

  -- World Web (#1084): the ties between two entries that are both in the book, as cross-references. The book
  -- never runs ahead of the table: a link only once the whole party knows it, a record by the rule the player
  -- projection already applies (a membership once the whole party knows it, never a disguised NPC's; a home only where
  -- the NPC's location is shared).
  -- A tie to anything not in this release is left out, so a reader can follow every one to its page.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_entry_ids
    from (
      select (e->>'id')::uuid as id from jsonb_array_elements(v_places) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_folk) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_factions) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_deities) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_lore) e
    ) x;

  -- A disguised NPC is in the book under the cover; the true one's allegiances and family stay out until it falls.
  select coalesce(array_agg(n.id), '{}'::uuid[]) into v_concealed
    from public.npcs n
   where n.campaign_id = p_campaign_id and not n.is_revealed
     and (n.disguise_name is not null or n.disguise_portrait_url is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', t.source, 'type', t.type,
           'from_kind', t.from_kind, 'from_id', t.from_id, 'to_kind', t.to_kind, 'to_id', t.to_id,
           'told', t.told)
           order by t.source, t.type, t.from_id, t.to_id), '[]'::jsonb)
    into v_ties
    from (
      select 'link' as source, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, '') as told
        from public.world_links l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select 'membership', 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null
        from public.faction_npcs m join public.factions f on f.id = m.faction_id
       where f.campaign_id = p_campaign_id
         and private.open_book_whole_party(m.player_visible_to, v_party)
         and m.npc_id <> all (v_concealed)
      union all
      select 'npc_home', 'lives_in', 'npc', n.id, 'location', n.location_id, null
        from public.npcs n
       where n.campaign_id = p_campaign_id and n.location_id is not null and 'location' = any (n.player_visible_fields)
      union all
      select 'seat', 'seat', 'faction', f.id, 'location', f.seat_location_id, null
        from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
      union all
      select 'kin', k.kind || '_of', 'npc', k.from_npc_id, 'npc', k.to_npc_id, null
        from public.kin_links k
       where k.campaign_id = p_campaign_id and k.from_npc_id is not null and k.to_npc_id is not null
         and k.from_npc_id <> all (v_concealed) and k.to_npc_id <> all (v_concealed)
    ) t
   where t.from_id = any (v_entry_ids) and t.to_id = any (v_entry_ids);

  return jsonb_build_object(
    'v', 2,
    'book', jsonb_build_object(
      'title', v_book.title,
      'subtitle', v_book.subtitle,
      'cover_art', v_book.cover_art,
      'cover_image_url', v_book.cover_image_url,
      'leather', v_book.leather,
      'chapters', to_jsonb(v_book.chapters),
      'campaign_name', v_campaign.name),
    'calendar', jsonb_build_object(
      'calendar_id', v_campaign.calendar_id,
      'custom_calendar', v_campaign.custom_calendar,
      'current', jsonb_build_object('year', v_campaign.current_year, 'month', v_campaign.current_month, 'day', v_campaign.current_day)),
    'places', v_places,
    'folk', v_folk,
    'factions', v_factions,
    'pantheons', v_pantheons,
    'deities', v_deities,
    'lore', v_lore,
    'truths', v_truths,
    'sessions', v_sessions,
    'events', v_events,
    'names', v_names,
    'ties', v_ties,
    'stats', jsonb_build_object(
      'places', jsonb_array_length(v_places),
      'folk', jsonb_array_length(v_folk),
      'factions', jsonb_array_length(v_factions),
      'pantheons', jsonb_array_length(v_pantheons),
      'deities', jsonb_array_length(v_deities),
      'lore', jsonb_array_length(v_lore),
      'truths', jsonb_array_length(v_truths),
      'sessions', jsonb_array_length(v_sessions),
      'events', jsonb_array_length(v_events))
  );
end;
$function$;

-- ── 4. The list changes hands with its campaign ───────────────────────────────
-- Restated whole from 20261120033042 with the one line added.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.location_roads        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.story_facts           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entries         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_clues           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_steps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_ticks     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_lore_passages   set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.note_sorting          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;

-- ── 5. Merging two sessions moves the canon's links to them too ───────────────
-- Restated whole from 20261119121121 with the canon's four session links added; the merge lists every link into the
-- session log by hand, and merge_campaign_sessions.test.sql fails on any it misses.
CREATE OR REPLACE FUNCTION public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
 RETURNS campaign_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_keep   public.campaign_sessions;
  v_absorb public.campaign_sessions;
begin
  -- Authorize before locking anything: a caller who may not merge these rows
  -- must not be able to hold locks on them either, even for a moment.
  -- One message for missing and foreign alike: a caller learns nothing about
  -- sessions in a campaign they do not run.
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if auth.uid() is null
     or v_keep.id is null
     or v_absorb.id is null
     or v_keep.campaign_id <> v_absorb.campaign_id
     or not coalesce(private.is_campaign_dm(v_keep.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Both rows locked in one statement, in id order: two merges naming the same
  -- pair the other way round would otherwise each hold one row and wait on
  -- the other. Then read again, since a concurrent merge may have changed or
  -- removed either while this one waited.
  perform 1 from public.campaign_sessions where id in (p_keep, p_absorb) order by id for update;
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if v_keep.id is null or v_absorb.id is null then
    raise exception 'That session was merged or deleted in the meantime';
  end if;

  if v_keep.id = v_absorb.id then
    raise exception 'A session cannot be merged into itself';
  end if;
  if (v_keep.started_at is not null and v_keep.ended_at is null)
     or (v_absorb.started_at is not null and v_absorb.ended_at is null) then
    raise exception 'End the running session before merging it';
  end if;

  update public.notes                  set session_id = p_keep where session_id = p_absorb;
  update public.session_proposals      set session_id = p_keep where session_id = p_absorb;
  update public.encounter_state        set session_id = p_keep where session_id = p_absorb;
  update public.npc_reveals            set session_id = p_keep where session_id = p_absorb;
  update public.location_reveals       set session_id = p_keep where session_id = p_absorb;
  update public.handout_reveals        set session_id = p_keep where session_id = p_absorb;
  update public.discovered_monsters    set session_id = p_keep where session_id = p_absorb;
  update public.quest_beat_transitions set session_id = p_keep where session_id = p_absorb;
  update public.npc_memories           set session_id = p_keep where session_id = p_absorb;
  update public.party_member_memories  set session_id = p_keep where session_id = p_absorb;
  update public.character_caretakers   set session_id = p_keep where session_id = p_absorb;
  update public.agent_sessions         set campaign_session_id = p_keep where campaign_session_id = p_absorb;
  update public.story_facts            set session_id = p_keep where session_id = p_absorb;
  -- The canon (#1226): when a clue was found, a force's step reached or its clock ticked, a lore passage told.
  update public.canon_clues            set found_session_id = p_keep where found_session_id = p_absorb;
  update public.canon_force_steps      set reached_session_id = p_keep where reached_session_id = p_absorb;
  update public.canon_force_ticks      set session_id = p_keep where session_id = p_absorb;
  update public.canon_lore_passages    set told_session_id = p_keep where told_session_id = p_absorb;

  delete from public.campaign_sessions where id = p_absorb;

  update public.campaign_sessions
     set number     = coalesce(v_keep.number, v_absorb.number),
         title      = coalesce(nullif(btrim(v_keep.title), ''), nullif(btrim(v_absorb.title), '')),
         played_on  = coalesce(v_keep.played_on, v_absorb.played_on),
         started_at = case
                        when v_keep.started_at is null then v_absorb.started_at
                        when v_absorb.started_at is null then v_keep.started_at
                        else least(v_keep.started_at, v_absorb.started_at)
                      end,
         ended_at   = case
                        when v_keep.started_at is null then v_absorb.ended_at
                        when v_absorb.started_at is null then v_keep.ended_at
                        else greatest(v_keep.ended_at, v_absorb.ended_at)
                      end
   where id = p_keep
  returning * into v_keep;

  return v_keep;
end;
$function$;
