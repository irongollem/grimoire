-- Fixes from the code review of the Canon review branch (#1256).
--
-- 1. Deleting an entry into the trash, then restoring it, put back every pointer other rows held to it except the two
--    the second round added: an arc's theme (`canon_arcs.theme_id`) and a player's wonder taken up as this question
--    (`canon_wonders.adopted_entry_id`). Both are snapshotted and restored now, like the beats and clocks. A snapshot
--    taken before this has neither key, which reads as an empty list.
-- 2. A player could file a wonder under another player's character: the insert checked only that the row was theirs
--    and in the campaign. The character must now be the one the author is seated as.
-- 3. A clue can lie in a handout (`document_id`), but the players' found clues did not say so. The read returns it.
-- 4. The NPC sheet's "Told of in" read the whole canon and every passage on each sheet (dm-npc-detail went from 4 to
--    7 requests). `get_canon_here` on a person now also returns the lore about them, in the read the sheet makes anyway.

create or replace function public.trash_canon_entry(p_entry_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.canon_entries;
  v_passage_ids uuid[];
  v_trash uuid;
begin
  select * into v_entry from public.canon_entries e where e.id = p_entry_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'That canon entry is gone, or it is not yours to delete.';
  end if;
  select coalesce(array_agg(p.id), '{}') into v_passage_ids from public.canon_lore_passages p where p.entry_id = p_entry_id;
  insert into public.canon_trash (campaign_id, entry_id, part, title, snapshot)
  values (
    v_entry.campaign_id, v_entry.id, v_entry.part, v_entry.title,
    jsonb_build_object(
      'entry', to_jsonb(v_entry),
      'passages', (select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order), '[]') from public.canon_lore_passages p where p.entry_id = p_entry_id),
      'steps', (select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]') from public.canon_force_steps s where s.force_id = p_entry_id),
      'ticks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.canon_force_ticks t where t.force_id = p_entry_id),
      'clues', (select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]') from public.canon_clues c where c.secret_id = p_entry_id),
      'quests', (select coalesce(jsonb_agg(to_jsonb(q)), '[]') from public.canon_entry_quests q where q.entry_id = p_entry_id),
      'links', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from public.world_links l
                 where l.from_canon_entry_id = p_entry_id or l.to_canon_entry_id = p_entry_id),
      -- What other rows pointed at it, emptied by the delete and put back by a restore.
      'became_from', (select coalesce(jsonb_agg(e.id), '[]') from public.canon_entries e where e.became_entry_id = p_entry_id),
      'clue_passages', (select coalesce(jsonb_agg(jsonb_build_object('clue', c.id, 'passage', c.passage_id)), '[]')
                          from public.canon_clues c where c.passage_id = any (v_passage_ids) and c.secret_id <> p_entry_id),
      'beats', (select coalesce(jsonb_agg(b.id), '[]') from public.quest_beats b where b.canon_secret_id = p_entry_id),
      'clocks', (select coalesce(jsonb_agg(k.id), '[]') from public.quest_clocks k where k.moves_force_id = p_entry_id),
      -- Added with the second Canon review: an arc's theme, and a player's wonder taken up as this question.
      'arcs', (select coalesce(jsonb_agg(a.id), '[]') from public.canon_arcs a where a.theme_id = p_entry_id),
      'wonders', (select coalesce(jsonb_agg(w.id), '[]') from public.canon_wonders w where w.adopted_entry_id = p_entry_id)
    )
  )
  returning id into v_trash;
  delete from public.canon_entries where id = p_entry_id;
  return v_trash;
end;
$$;
revoke execute on function public.trash_canon_entry(uuid) from public, anon;
grant execute on function public.trash_canon_entry(uuid) to authenticated, service_role;

create or replace function public.restore_canon_entry(p_trash_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_trash public.canon_trash;
  v_user uuid := (select auth.uid());
  v_snap jsonb;
  v_entry_id uuid;
begin
  select * into v_trash from public.canon_trash t where t.id = p_trash_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'That deleted entry is gone, or it is not yours to restore.';
  end if;
  v_snap := v_trash.snapshot;
  v_entry_id := v_trash.entry_id;
  if v_snap #>> '{entry,party_member_id}' is not null and exists (
       select 1 from public.canon_entries e where e.party_member_id = (v_snap #>> '{entry,party_member_id}')::uuid) then
    raise exception using errcode = '23505', message = 'This character has a backstory again. Delete that one first to bring this one back.';
  end if;
  perform private.canon_restore_rows('canon_entries', jsonb_build_array(v_snap -> 'entry'), v_user, true);
  perform private.canon_restore_rows('canon_lore_passages', v_snap -> 'passages', v_user, false);
  perform private.canon_restore_rows('canon_force_steps', v_snap -> 'steps', v_user, false);
  perform private.canon_restore_rows('canon_force_ticks', v_snap -> 'ticks', v_user, false);
  perform private.canon_restore_rows('canon_clues', v_snap -> 'clues', v_user, false);
  perform private.canon_restore_rows('canon_entry_quests', v_snap -> 'quests', v_user, false);
  perform private.canon_restore_rows('world_links', v_snap -> 'links', v_user, false);
  -- The pointers the delete emptied, where the row is still there and has not been pointed elsewhere since.
  update public.canon_entries e set became_entry_id = v_entry_id
   where e.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_snap -> 'became_from') x) and e.became_entry_id is null;
  update public.canon_clues c set passage_id = (x ->> 'passage')::uuid
    from jsonb_array_elements(v_snap -> 'clue_passages') x
   where c.id = (x ->> 'clue')::uuid and c.passage_id is null
     and exists (select 1 from public.canon_lore_passages p where p.id = (x ->> 'passage')::uuid);
  update public.quest_beats b set canon_secret_id = v_entry_id
   where b.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_snap -> 'beats') x) and b.canon_secret_id is null;
  update public.quest_clocks k set moves_force_id = v_entry_id
   where k.id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_snap -> 'clocks') x) and k.moves_force_id is null;
  update public.canon_arcs a set theme_id = v_entry_id
   where a.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_snap -> 'arcs', '[]')) x) and a.theme_id is null;
  update public.canon_wonders w set adopted_entry_id = v_entry_id
   where w.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_snap -> 'wonders', '[]')) x)
     and w.adopted_entry_id is null and w.dismissed_at is null;
  delete from public.canon_trash where id = p_trash_id;
  return v_entry_id;
end;
$$;
revoke execute on function public.restore_canon_entry(uuid) from public, anon;
grant execute on function public.restore_canon_entry(uuid) to authenticated, service_role;

-- ── 2. A wonder is the author's own character's ────────────────────────────────
create function private.canon_wonders_own_character()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.party_member_id is not null and not exists (
       select 1 from public.campaign_members m
        where m.campaign_id = new.campaign_id and m.user_id = new.user_id and m.party_member_id = new.party_member_id) then
    raise exception using errcode = '42501', message = 'A wonder is filed under your own character';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_wonders_own_character() from public, anon, authenticated;
create trigger canon_wonders_own_character
  before insert or update of party_member_id on public.canon_wonders
  for each row execute procedure private.canon_wonders_own_character();

-- ── 3. Found clues say when they lay in a handout ──────────────────────────────
drop function public.get_player_found_clues(uuid);
create function public.get_player_found_clues(p_campaign_id uuid)
returns table (id uuid, title text, found_at timestamptz, found_session_id uuid, location_id uuid, npc_id uuid, item_id uuid, document_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.found_at, c.found_session_id, c.location_id, c.npc_id, c.item_id, c.document_id
    from public.canon_clues c
   where c.campaign_id = p_campaign_id
     and c.found_at is not null
     and private.is_campaign_member(p_campaign_id)
   order by c.found_at desc
$$;
revoke execute on function public.get_player_found_clues(uuid) from public, anon;
grant execute on function public.get_player_found_clues(uuid) to authenticated, service_role;

-- ── 4. Lore about a person, in Canon here ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_canon_here(p_kind text, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'clues', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'title', c.title, 'secret_id', c.secret_id, 'secret_title', e.title,
               'found_at', c.found_at, 'found_session_id', c.found_session_id) order by e.title, c.sort_order)
        from public.canon_clues c
        join public.canon_entries e on e.id = c.secret_id
       where (p_kind = 'location' and c.location_id = p_id)
          or (p_kind = 'npc' and c.npc_id = p_id)
          or (p_kind = 'quest_beat' and c.quest_beat_id = p_id)
          or (p_kind = 'item' and c.item_id = p_id)
          or (p_kind = 'document' and c.document_id = p_id)), '[]'::jsonb),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'title', p.title, 'entry_id', p.entry_id, 'entry_title', e.title) order by e.title, p.sort_order)
        from public.canon_lore_passages p
        join public.canon_entries e on e.id = p.entry_id
       where p.told_at is null
         -- Lore's first passage is told with the entry, so it is never offered here; another part (a backstory) has
         -- no free first passage. Written as part <> 'lore' so a later part is offered by default.
         and (e.part <> 'lore'
              or p.id <> (select f.id from public.canon_lore_passages f where f.entry_id = p.entry_id
                           order by f.sort_order, f.created_at limit 1))
         and ((p_kind = 'location' and p.location_id = p_id)
              or (p_kind = 'npc' and p.npc_id = p_id)
              or (p_kind = 'quest_beat' and p.quest_beat_id = p_id))), '[]'::jsonb),
    -- On a person: the lore told about them, with how many of its passages are told (the first is told with the
    -- entry). One read with the rest, so the NPC sheet's "Told of in" costs no request of its own (#1258 item 26).
    'lore', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'told', t.told, 'total', t.total) order by e.title)
        from public.canon_entries e
        join public.world_links l on l.from_canon_entry_id = e.id and l.type = 'about' and l.to_npc_id = p_id
        cross join lateral (
          select count(*)::int as total,
                 count(*) filter (where p.told_at is not null or p.id = (
                   select f.id from public.canon_lore_passages f where f.entry_id = e.id order by f.sort_order, f.created_at limit 1))::int as told
            from public.canon_lore_passages p where p.entry_id = e.id) t
       where p_kind = 'npc' and e.part = 'lore'), '[]'::jsonb))
$function$;
