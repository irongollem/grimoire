-- Migration: npc_backstory_connection_labels
-- Name PC backstory ties from their owner and use the owner's portrait when the entry has no image.

-- The NPC generator needs to supply the speech cue too. Keep this a narrow
-- update so an administrator's other prompt edits remain intact.
update public.ai_system_prompts
   set content = replace(
     content,
     '  "backstory": "3–4 paragraphs of history, origin, and formative events.',
     '  "voice": "A concise direction for pace, vocabulary, verbal habits, plus one or two short example lines. Plain text only.",
  "backstory": "3–4 paragraphs of history, origin, and formative events.'
   )
 where generator_type = 'npc'
   and content like '%  "backstory": "3–4 paragraphs of history, origin, and formative events.%'
   and content not like '%  "voice":%';

create or replace function public.get_connections(p_kind text, p_id uuid, p_campaign_id uuid default null)
returns table (
  source text,
  row_id uuid,
  type text,
  outward boolean,
  other_kind text,
  other_id uuid,
  other_name text,
  other_image text,
  note text,
  told text,
  player_visible_to uuid[],
  role text,
  status text,
  ai_provenance jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ties (source, row_id, type, outward, other_kind, other_id, note, told, player_visible_to, role, status,
             ai_provenance, campaign_id) as (
    -- Links, either end.
    select 'link', l.id, l.type, true, l.to_kind, l.to_id, l.note, l.told, l.player_visible_to, null, null,
           l.ai_provenance, l.campaign_id
      from public.world_links l where l.from_kind = p_kind and l.from_id = p_id
    union all
    select 'link', l.id, l.type, false, l.from_kind, l.from_id, l.note, l.told, l.player_visible_to, null, null,
           l.ai_provenance, l.campaign_id
      from public.world_links l where l.to_kind = p_kind and l.to_id = p_id
    -- Membership.
    union all
    select 'membership', m.id, 'member_of', true, 'faction', m.faction_id, null, null, m.player_visible_to, m.role,
           m.status, null, null
      from public.faction_npcs m where p_kind = 'npc' and m.npc_id = p_id
    union all
    select 'membership', m.id, 'member_of', true, 'faction', m.faction_id, null, null, m.player_visible_to, m.role,
           m.status, null, null
      from public.faction_party_members m where p_kind = 'party_member' and m.party_member_id = p_id
    union all
    select 'membership', m.id, 'member_of', false, 'npc', m.npc_id, null, null, m.player_visible_to, m.role, m.status,
           null, null
      from public.faction_npcs m where p_kind = 'faction' and m.faction_id = p_id
    union all
    select 'membership', m.id, 'member_of', false, 'party_member', m.party_member_id, null, null, m.player_visible_to,
           m.role, m.status, null, null
      from public.faction_party_members m where p_kind = 'faction' and m.faction_id = p_id
    -- An NPC's home.
    union all
    select 'npc_home', n.id, 'lives_in', true, 'location', n.location_id, null, null, null, null, null, null, null
      from public.npcs n where p_kind = 'npc' and n.id = p_id and n.location_id is not null
    union all
    select 'npc_home', n.id, 'lives_in', false, 'npc', n.id, null, null, null, null, null, null, n.campaign_id
      from public.npcs n where p_kind = 'location' and n.location_id = p_id
    -- A PC's place.
    union all
    select 'pc_place', pm.id, 'is_at', true, 'location', pm.current_location_id, null, null, null, null, null, null,
           null
      from public.party_members pm
     where p_kind = 'party_member' and pm.id = p_id and pm.current_location_id is not null
    union all
    select 'pc_place', pm.id, 'is_at', false, 'party_member', pm.id, null, null, null, null, null, null,
           pm.campaign_id
      from public.party_members pm where p_kind = 'location' and pm.current_location_id = p_id
    -- A venue's keeper.
    union all
    select 'keeper', lo.id, 'keeps', true, 'location', lo.id, null, null, null, null, null, null, null
      from public.locations lo where p_kind = 'npc' and lo.npc_owner_id = p_id
    union all
    select 'keeper', lo.id, 'keeps', false, 'npc', lo.npc_owner_id, null, null, null, null, null, null, null
      from public.locations lo where p_kind = 'location' and lo.id = p_id and lo.npc_owner_id is not null
    -- A house's seat.
    union all
    select 'seat', f.id, 'seat', true, 'location', f.seat_location_id, null, null, null, null, null, null, null
      from public.factions f where p_kind = 'faction' and f.id = p_id and f.seat_location_id is not null
    union all
    select 'seat', f.id, 'seat', false, 'faction', f.id, null, null, null, null, null, null, null
      from public.factions f where p_kind = 'location' and f.seat_location_id = p_id
    -- A PC's patron deity.
    union all
    select 'patron_deity', pm.id, 'patron_deity', true, 'deity', pm.deity_id, null, null, null, null, null, null, null
      from public.party_members pm where p_kind = 'party_member' and pm.id = p_id and pm.deity_id is not null
    union all
    select 'patron_deity', pm.id, 'patron_deity', false, 'party_member', pm.id, null, null, null, null, null, null,
           null
      from public.party_members pm where p_kind = 'deity' and pm.deity_id = p_id
    -- What someone carries. A row with no item of the campaign's own (a library or a hand-typed one) has no sheet to
    -- point at, so it is not a tie.
    union all
    select 'inventory', i.id, 'carries', true, 'item', i.item_id, null, null, null, null, null, null, i.campaign_id
      from public.npc_inventory i where p_kind = 'npc' and i.npc_id = p_id and i.item_id is not null
    union all
    select 'inventory', i.id, 'carries', true, 'item', i.item_id, null, null, null, null, null, null, i.campaign_id
      from public.party_inventory i where p_kind = 'party_member' and i.carried_by = p_id and i.item_id is not null
    union all
    select 'inventory', i.id, 'carries', false, 'npc', i.npc_id, null, null, null, null, null, null, i.campaign_id
      from public.npc_inventory i where p_kind = 'item' and i.item_id = p_id
    union all
    select 'inventory', i.id, 'carries', false, 'party_member', i.carried_by, null, null, null, null, null, null,
           i.campaign_id
      from public.party_inventory i where p_kind = 'item' and i.item_id = p_id and i.carried_by is not null
    -- What a store sells.
    union all
    select 'store', s.id, 'sold_at', true, 'location', s.location_id, null, null, null, null, null, null,
           (select lo.campaign_id from public.locations lo where lo.id = s.location_id)
      from public.store_items s where p_kind = 'item' and s.item_id = p_id
    union all
    select 'store', s.id, 'sold_at', false, 'item', s.item_id, null, null, null, null, null, null,
           (select lo.campaign_id from public.locations lo where lo.id = s.location_id)
      from public.store_items s where p_kind = 'location' and s.location_id = p_id and s.item_id is not null
    -- A quest's own records, read from the thing's side (the quest is always the `from`).
    union all
    select 'quest', q.id, 'quest_giver', false, 'quest', q.id, null, null, null, null, q.status::text, null,
           q.campaign_id
      from public.quests q where p_kind = 'npc' and q.giver_npc_id = p_id
    union all
    select 'quest', q.id, 'quest_place', false, 'quest', q.id, null, null, null, null, q.status::text, null,
           q.campaign_id
      from public.quests q where p_kind = 'location' and q.location_id = p_id
    union all
    select 'quest', r.id, 'quest_ref', false, 'quest', r.quest_id, null, null, null, null, q.status::text, null,
           q.campaign_id
      from public.quest_refs r
      join public.quests q on q.id = r.quest_id
     where r.ref_type = p_kind and r.ref_id = p_id::text
       -- Already said by the giver or the place.
       and q.giver_npc_id is distinct from p_id and q.location_id is distinct from p_id
  )
  select t.source, t.row_id, t.type, t.outward, t.other_kind, t.other_id,
         coalesce(n.name, pm.name, f.name, lo.name, d.name, i.name, q.title, nullif(btrim(ce.title), ''), nullif(cpm.name, '') || '''s backstory', 'Canon entry'),
         coalesce(n.portrait_url, pm.portrait_url, f.emblem_url, lo.image_url, d.portrait_url, d.symbol_image_url,
                  i.image_url, ce.image_url, cpm.portrait_url),
         t.note, t.told, t.player_visible_to, t.role, t.status, t.ai_provenance
    from ties t
    left join public.npcs n on t.other_kind = 'npc' and n.id = t.other_id
    left join public.party_members pm on t.other_kind = 'party_member' and pm.id = t.other_id
    left join public.factions f on t.other_kind = 'faction' and f.id = t.other_id
    left join public.locations lo on t.other_kind = 'location' and lo.id = t.other_id
    left join public.deities d on t.other_kind = 'deity' and d.id = t.other_id
    left join public.items i on t.other_kind = 'item' and i.id = t.other_id
    left join public.quests q on t.other_kind = 'quest' and q.id = t.other_id
    left join public.canon_entries ce on t.other_kind = 'canon' and ce.id = t.other_id
    left join public.party_members cpm on t.other_kind = 'canon' and ce.part = 'backstory' and cpm.id = ce.party_member_id
   where coalesce(n.id, pm.id, f.id, lo.id, d.id, i.id, q.id, ce.id) is not null
     and (p_campaign_id is null or t.campaign_id is null or t.campaign_id = p_campaign_id)
$$;

create or replace function public.get_world_ties(p_campaign_id uuid)
returns table (
  source text,
  row_id uuid,
  type text,
  from_kind text,
  from_id uuid,
  from_name text,
  from_image text,
  to_kind text,
  to_id uuid,
  to_name text,
  to_image text,
  note text,
  told text,
  player_visible_to uuid[],
  role text,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ties (source, row_id, type, from_kind, from_id, to_kind, to_id, note, told, player_visible_to, role, status) as (
    select 'link', l.id, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, l.note, l.told, l.player_visible_to, null, null
      from public.world_links l where l.campaign_id = p_campaign_id
    union all
    select 'kin', k.id, k.kind || '_of',
           case when k.from_npc_id is not null then 'npc' else 'party_member' end,
           coalesce(k.from_npc_id, k.from_party_member_id),
           case when k.to_npc_id is not null then 'npc' else 'party_member' end,
           coalesce(k.to_npc_id, k.to_party_member_id), nullif(k.note, ''), null, null, k.parent_role, null
      from public.kin_links k where k.campaign_id = p_campaign_id
    union all
    select 'membership', m.id, 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null, null, m.player_visible_to,
           m.role, m.status
      from public.faction_npcs m join public.factions f on f.id = m.faction_id where f.campaign_id = p_campaign_id
    union all
    select 'membership', m.id, 'member_of', 'party_member', m.party_member_id, 'faction', m.faction_id, null, null,
           m.player_visible_to, m.role, m.status
      from public.faction_party_members m join public.factions f on f.id = m.faction_id
     where f.campaign_id = p_campaign_id
    union all
    select 'npc_home', n.id, 'lives_in', 'npc', n.id, 'location', n.location_id, null, null, null, null, null
      from public.npcs n where n.campaign_id = p_campaign_id and n.location_id is not null
    union all
    select 'pc_place', pm.id, 'is_at', 'party_member', pm.id, 'location', pm.current_location_id, null, null, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.current_location_id is not null
    union all
    select 'keeper', lo.id, 'keeps', 'npc', lo.npc_owner_id, 'location', lo.id, null, null, null, null, null
      from public.locations lo where lo.campaign_id = p_campaign_id and lo.npc_owner_id is not null
    union all
    select 'seat', f.id, 'seat', 'faction', f.id, 'location', f.seat_location_id, null, null, null, null, null
      from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
    union all
    select 'patron_deity', pm.id, 'patron_deity', 'party_member', pm.id, 'deity', pm.deity_id, null, null, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.deity_id is not null
    union all
    select 'inventory', i.id, 'carries', 'npc', i.npc_id, 'item', i.item_id, null, null, null, null, null
      from public.npc_inventory i where i.campaign_id = p_campaign_id and i.item_id is not null
    union all
    select 'inventory', i.id, 'carries', 'party_member', i.carried_by, 'item', i.item_id, null, null, null, null, null
      from public.party_inventory i
     where i.campaign_id = p_campaign_id and i.item_id is not null and i.carried_by is not null
    union all
    select 'store', s.id, 'sold_at', 'item', s.item_id, 'location', s.location_id, null, null, null, null, null
      from public.store_items s join public.locations lo on lo.id = s.location_id
     where lo.campaign_id = p_campaign_id and s.item_id is not null
    union all
    select 'quest', q.id, 'quest_giver', 'quest', q.id, 'npc', q.giver_npc_id, null, null, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.giver_npc_id is not null
    union all
    select 'quest', q.id, 'quest_place', 'quest', q.id, 'location', q.location_id, null, null, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.location_id is not null
    union all
    select 'quest', r.id, 'quest_ref', 'quest', q.id, r.ref_type, case when r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then r.ref_id::uuid end, null, null, null, null, q.status::text
      from public.quest_refs r join public.quests q on q.id = r.quest_id
     where q.campaign_id = p_campaign_id and r.ref_type in ('npc', 'location', 'faction', 'item')
       and r.ref_id is distinct from q.giver_npc_id::text and r.ref_id is distinct from q.location_id::text
       -- A shared-library ref holds a text slug, not a row of this campaign: it names nothing a tie can reach.
       and r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  names (kind, id, name, image) as (
    select 'npc', n.id, n.name, n.portrait_url from public.npcs n where n.campaign_id = p_campaign_id
    union all
    select 'party_member', pm.id, pm.name, pm.portrait_url from public.party_members pm
     where pm.campaign_id = p_campaign_id
    union all
    select 'faction', f.id, f.name, f.emblem_url from public.factions f where f.campaign_id = p_campaign_id
    union all
    select 'location', lo.id, lo.name, lo.image_url from public.locations lo where lo.campaign_id = p_campaign_id
    union all
    select 'deity', d.id, d.name, coalesce(d.portrait_url, d.symbol_image_url) from public.deities d
     where d.campaign_id = p_campaign_id
    union all
    -- The campaign's own items and the DM's vault (campaign_id null), which a campaign's packs may hold.
    select 'item', i.id, i.name, i.image_url from public.items i
     where i.campaign_id = p_campaign_id or i.campaign_id is null
    union all
    select 'quest', q.id, q.title, null from public.quests q where q.campaign_id = p_campaign_id
    union all
    select 'canon', ce.id, coalesce(nullif(btrim(ce.title), ''), nullif(pm.name, '') || '''s backstory', 'Canon entry'),
           coalesce(ce.image_url, pm.portrait_url)
      from public.canon_entries ce
      left join public.party_members pm on ce.part = 'backstory' and pm.id = ce.party_member_id
     where ce.campaign_id = p_campaign_id
  )
  select t.source, t.row_id, t.type, t.from_kind, t.from_id, a.name, a.image, t.to_kind, t.to_id, b.name, b.image,
         t.note, t.told, t.player_visible_to, t.role, t.status
    from ties t
    join names a on a.kind = t.from_kind and a.id = t.from_id
    join names b on b.kind = t.to_kind and b.id = t.to_id
$$;
