-- World Web (#1084): the campaign-wide reads. `get_connections` (20261026212025) answers one thing's sheet; these
-- answer the web, which wants every tie of a campaign at once, and the players, who see only what their character
-- knows.
--
-- A tie here is (from, to, type) whatever its home: a link, a kin link, a membership, an NPC's home, a seat, a pack.
-- One shape for both readers, so the web and the player pages describe a tie with the same catalogue words.

-- ── 1. The DM's web: every tie of a campaign ──────────────────────────────────
-- Invoker: each table's own RLS decides, so this hands a DM exactly what the sheets already show them, the DM's own note
-- on a link or kin link included (the web edits it). Kin is included here (the web draws it at rest) though
-- `get_connections` leaves it to the Family block.
create function public.get_world_ties(p_campaign_id uuid)
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
    select 'membership', m.id, 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null, null, null, m.role, m.status
      from public.faction_npcs m join public.factions f on f.id = m.faction_id where f.campaign_id = p_campaign_id
    union all
    select 'membership', m.id, 'member_of', 'party_member', m.party_member_id, 'faction', m.faction_id, null, null, null,
           m.role, m.status
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
  )
  select t.source, t.row_id, t.type, t.from_kind, t.from_id, a.name, a.image, t.to_kind, t.to_id, b.name, b.image,
         t.note, t.told, t.player_visible_to, t.role, t.status
    from ties t
    join names a on a.kind = t.from_kind and a.id = t.from_id
    join names b on b.kind = t.to_kind and b.id = t.to_id
$$;

revoke execute on function public.get_world_ties(uuid) from public, anon;
grant execute on function public.get_world_ties(uuid) to authenticated, service_role;

-- ── 2. What one character knows ───────────────────────────────────────────────
-- The players' web and their "Connections you know of". A tie is known when both ends are visible to the character,
-- and, for a link, when the DM has revealed that link to them. Names come from the players' own projections, so a
-- disguised NPC appears under the name the party knows. A link's DM note is never returned; its `told` line is.
--
-- Records follow the rule each already has, restated with both ends visible: an NPC's membership shows unless its role
-- is covert (private.is_covert_role) or the NPC is still under a disguise, and a PC's only to that PC; an NPC's home only where the
-- projection shares the NPC's location; a seat only where the factions projection shares it; a pack's contents only
-- for a PC (an NPC's inventory is the DM's); a store's stock only where the place shares its inventory.
--
-- Internal: runs inside the definer wrappers below, which authorize and pick the character. No client role may call it.
-- A covert role is one whose being known is the secret: a secret member, an infiltrator, an unwitting pawn. Roles are
-- free text, so the comparison ignores case and surrounding space. Total: a null role is not covert.
create function private.is_covert_role(p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(btrim(p_role)) in ('secret member', 'infiltrator', 'unwitting pawn'), false);
$$;

create function private.player_world_ties(p_campaign_id uuid, p_member uuid, p_preview uuid)
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
  told text,
  role text,
  status text
)
language sql
stable
set search_path = ''
as $$
  with seen_npcs as (
    select v.id, v.name, v.portrait_url, v.location_id
      from public.get_player_visible_npcs(p_campaign_id, null, p_preview) v
     where v.name is not null
  ),
  seen_factions as (
    select v.id, v.name, v.emblem_url, v.seat_location_id
      from public.get_player_visible_factions(p_campaign_id, p_preview) v
  ),
  seen_locations as (
    select lo.id, lo.name, lo.image_url, lo.is_inventory_shared
      from public.locations lo
     where lo.campaign_id = p_campaign_id and p_member = any (lo.player_visible_to)
  ),
  seen_items as (
    select i.id, i.name, i.image_url from public.items i
     where exists (select 1 from public.party_inventory pi
                    where pi.campaign_id = p_campaign_id and pi.item_id = i.id)
        or exists (select 1 from public.store_items s join seen_locations sl on sl.id = s.location_id
                    where s.item_id = i.id and s.visible and sl.is_inventory_shared)
  ),
  seen (kind, id, name, image) as (
    select 'npc', n.id, n.name, n.portrait_url from seen_npcs n
    union all
    select 'party_member', pm.id, pm.name, pm.portrait_url from public.party_members pm
     where pm.campaign_id = p_campaign_id
    union all
    select 'faction', f.id, f.name, f.emblem_url from seen_factions f
    union all
    select 'location', lo.id, lo.name, lo.image_url from seen_locations lo
    union all
    select 'deity', d.id, d.name, coalesce(d.portrait_url, d.symbol_image_url) from public.deities d
     where d.campaign_id = p_campaign_id and p_member = any (d.player_visible_to)
    union all
    select 'item', i.id, i.name, i.image_url from seen_items i
    union all
    select 'quest', q.id, q.title, null from public.quests q
     where q.campaign_id = p_campaign_id and p_member = any (q.player_visible_to)
  ),
  ties (source, row_id, type, from_kind, from_id, to_kind, to_id, told, role, status) as (
    select 'link', l.id, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, ''), null, null
      from public.world_links l where l.campaign_id = p_campaign_id and p_member = any (l.player_visible_to)
    union all
    select 'membership', m.id, 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null, m.role, m.status
      from public.faction_npcs m join seen_factions f on f.id = m.faction_id
     where not private.is_covert_role(m.role)
       -- A disguised NPC is seen under the cover; the true one's allegiances stay the DM's until the cover falls.
       and not exists (select 1 from public.npcs n
                        where n.id = m.npc_id and not n.is_revealed
                          and (n.disguise_name is not null or n.disguise_portrait_url is not null))
    union all
    select 'membership', m.id, 'member_of', 'party_member', m.party_member_id, 'faction', m.faction_id, null, m.role,
           m.status
      from public.faction_party_members m join seen_factions f on f.id = m.faction_id
     -- A character's own allegiances only: another PC's membership is theirs to tell, as the RLS on
     -- faction_party_members has always had it.
     where m.party_member_id = p_member
    union all
    select 'npc_home', n.id, 'lives_in', 'npc', n.id, 'location', n.location_id, null, null, null
      from seen_npcs n where n.location_id is not null
    union all
    select 'pc_place', pm.id, 'is_at', 'party_member', pm.id, 'location', pm.current_location_id, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.current_location_id is not null
    union all
    select 'keeper', lo.id, 'keeps', 'npc', lo.npc_owner_id, 'location', lo.id, null, null, null
      from public.locations lo where lo.campaign_id = p_campaign_id and lo.npc_owner_id is not null
    union all
    select 'seat', f.id, 'seat', 'faction', f.id, 'location', f.seat_location_id, null, null, null
      from seen_factions f where f.seat_location_id is not null
    union all
    select 'patron_deity', pm.id, 'patron_deity', 'party_member', pm.id, 'deity', pm.deity_id, null, null, null
      from public.party_members pm where pm.campaign_id = p_campaign_id and pm.deity_id is not null
    union all
    select 'inventory', i.id, 'carries', 'party_member', i.carried_by, 'item', i.item_id, null, null, null
      from public.party_inventory i
     where i.campaign_id = p_campaign_id and i.item_id is not null and i.carried_by is not null
    union all
    select 'store', s.id, 'sold_at', 'item', s.item_id, 'location', s.location_id, null, null, null
      from public.store_items s join seen_locations sl on sl.id = s.location_id
     where s.item_id is not null and s.visible and sl.is_inventory_shared
    union all
    select 'quest', q.id, 'quest_giver', 'quest', q.id, 'npc', q.giver_npc_id, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.giver_npc_id is not null
    union all
    select 'quest', q.id, 'quest_place', 'quest', q.id, 'location', q.location_id, null, null, q.status::text
      from public.quests q where q.campaign_id = p_campaign_id and q.location_id is not null
    union all
    select 'quest', r.id, 'quest_ref', 'quest', q.id, r.ref_type, case when r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then r.ref_id::uuid end, null, null, q.status::text
      from public.quest_refs r join public.quests q on q.id = r.quest_id
     where q.campaign_id = p_campaign_id and r.is_player_visible and r.ref_type in ('npc', 'location', 'faction', 'item')
       and r.ref_id is distinct from q.giver_npc_id::text and r.ref_id is distinct from q.location_id::text
       -- A shared-library ref holds a text slug, not a row of this campaign: it names nothing a tie can reach.
       and r.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  -- Both ends must be seen; the joins are the rule.
  select t.source, t.row_id, t.type, t.from_kind, t.from_id, a.name, a.image, t.to_kind, t.to_id, b.name, b.image,
         t.told, t.role, t.status
    from ties t
    join seen a on a.kind = t.from_kind and a.id = t.from_id
    join seen b on b.kind = t.to_kind and b.id = t.to_id
$$;

revoke execute on function private.player_world_ties(uuid, uuid, uuid) from public, anon, authenticated;

-- Which character a caller reads as: a player their own; a DM the member they are previewing (none: nothing, since a
-- reveal is per character). Raises for anyone outside the campaign.
create function private.world_ties_reader(p_campaign_id uuid, p_preview_member_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dm boolean := coalesce(private.is_campaign_dm(p_campaign_id), false);
begin
  if not v_dm and not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not a member of this campaign' using errcode = '42501';
  end if;
  if v_dm then
    -- A DM previews one of this campaign's characters, never a character from elsewhere.
    if p_preview_member_id is not null and not exists (
      select 1 from public.party_members pm where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id
    ) then
      raise exception 'Not a character of this campaign' using errcode = '22023';
    end if;
    return p_preview_member_id;
  end if;
  return (select cm.party_member_id from public.campaign_members cm
           where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()));
end;
$$;
revoke execute on function private.world_ties_reader(uuid, uuid) from public, anon, authenticated;

create function public.get_player_world_ties(p_campaign_id uuid, p_preview_member_id uuid default null)
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
  told text,
  role text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member uuid := private.world_ties_reader(p_campaign_id, p_preview_member_id);
  v_preview uuid := case when coalesce(private.is_campaign_dm(p_campaign_id), false) then p_preview_member_id end;
begin
  if v_member is null then
    return;
  end if;
  return query select * from private.player_world_ties(p_campaign_id, v_member, v_preview);
end;
$$;

revoke execute on function public.get_player_world_ties(uuid, uuid) from public, anon;
grant execute on function public.get_player_world_ties(uuid, uuid) to authenticated, service_role;

-- One thing's ties from its own side, in the same shape as `get_connections` (note always null: the DM's).
create function public.get_player_connections(p_campaign_id uuid, p_kind text, p_id uuid,
                                              p_preview_member_id uuid default null)
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member uuid := private.world_ties_reader(p_campaign_id, p_preview_member_id);
  v_preview uuid := case when coalesce(private.is_campaign_dm(p_campaign_id), false) then p_preview_member_id end;
begin
  if v_member is null then
    return;
  end if;
  return query
    select t.source, t.row_id, t.type, true, t.to_kind, t.to_id, t.to_name, t.to_image, null::text, t.told,
           null::uuid[], t.role, t.status, null::jsonb
      from private.player_world_ties(p_campaign_id, v_member, v_preview) t
     where t.from_kind = p_kind and t.from_id = p_id
    union all
    select t.source, t.row_id, t.type, false, t.from_kind, t.from_id, t.from_name, t.from_image, null::text, t.told,
           null::uuid[], t.role, t.status, null::jsonb
      from private.player_world_ties(p_campaign_id, v_member, v_preview) t
     where t.to_kind = p_kind and t.to_id = p_id;
end;
$$;

revoke execute on function public.get_player_connections(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.get_player_connections(uuid, text, uuid, uuid) to authenticated, service_role;
