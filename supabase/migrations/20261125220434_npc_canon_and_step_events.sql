-- Two follow-ups of #1279 wave 2.
--
-- 1. An NPC's place in the canon (item 13). The NPC sheet's "In the canon" block shows what the person knows, what is
--    about them, and the clues and passages lying on them. The last two were already here; `knows` and `about` join
--    them so the block stays one read. The signature, the grants and invoker security are unchanged.
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
       where p_kind = 'npc' and e.part = 'lore'), '[]'::jsonb),
    -- On a person (#1279 item 13): what they know, the entries tied to them as a knower (`known_to`), and what is
    -- about them, every other part tied `about` them (a force whose who they are is one). Each carries what the sheet
    -- needs to offer "Tell the party" on a truth. Read here with the rest, so "In the canon" costs no request of its
    -- own; the function is invoker, so RLS still decides what the reader may see.
    'knows', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'part', e.part, 'knowledge', e.knowledge,
                                          'revealed_at', e.revealed_at) order by e.title)
        from public.canon_entries e
        join public.world_links l on l.from_canon_entry_id = e.id and l.type = 'known_to' and l.to_npc_id = p_id
       where p_kind = 'npc'), '[]'::jsonb),
    'about', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'part', e.part, 'knowledge', e.knowledge,
                                          'revealed_at', e.revealed_at) order by e.part, e.title)
        from public.canon_entries e
        join public.world_links l on l.from_canon_entry_id = e.id and l.type = 'about' and l.to_npc_id = p_id
       where p_kind = 'npc' and e.part not in ('lore', 'backstory')), '[]'::jsonb))
$function$;

-- 2. A force step on the Calendar (item 32). "Put this step on the Calendar" makes an ordinary world event; the step
--    now remembers which one, so the Calendar's copy is found however either is renamed or moved, and the Calendar
--    draws the event instead of the step's derived "A step due" line. Deleting the event on the Calendar lets go of it.
alter table public.canon_force_steps
  add column calendar_event_id uuid references public.calendar_events (id) on delete set null;
create index canon_force_steps_calendar_event_idx on public.canon_force_steps (calendar_event_id)
  where calendar_event_id is not null;
drop trigger zz_same_campaign_refs on public.canon_force_steps;
create trigger zz_same_campaign_refs
  before insert or update of force_id, reached_session_id, calendar_event_id, campaign_id on public.canon_force_steps
  for each row execute procedure private.enforce_same_campaign_refs(
    'force_id', 'canon_entries', 'owned',
    'reached_session_id', 'campaign_sessions', 'owned',
    'calendar_event_id', 'calendar_events', 'owned');
