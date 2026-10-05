-- When each player first met each NPC, so the player's People list can sort by
-- "Recently revealed".
--
-- Nothing recorded this before. An NPC reaches a party member two ways, both
-- read by get_player_visible_npcs: shared with them directly
-- (npcs.player_visible_to), or through its own location when that location
-- shares its linked NPCs with them (locations.is_npcs_shared +
-- locations.player_visible_to). Either can happen on an NPC write or on a
-- location write, so a trigger on each side records the first moment a member
-- is in the set. `on conflict do nothing` keeps the first moment: unsharing
-- never deletes a row, and sharing again does not move it.
--
-- The table is append-only (no row is ever updated), so it carries no
-- updated_at and no updated_at trigger. Clients never write it: the triggers
-- below are its only writers, and it has no insert, update or delete policy.
--
-- Live sync: no channel of its own. Every row is written in the same
-- transaction as the npcs or locations write that caused it, and those already
-- ring `npcs_player` / `locations_player`, which refresh the player-npcs cache
-- the reveals are read into (useSharedNpcs).

create table public.npc_reveals (
  npc_id          uuid not null references public.npcs (id) on delete cascade,
  party_member_id uuid not null references public.party_members (id) on delete cascade,
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  revealed_at     timestamptz not null default now(),
  primary key (npc_id, party_member_id)
);

create index npc_reveals_campaign_id_idx on public.npc_reveals (campaign_id);
create index npc_reveals_party_member_id_idx on public.npc_reveals (party_member_id);

alter table public.npc_reveals enable row level security;

-- A player reads the rows for their own party member; the DM reads the whole
-- campaign's (DM preview renders any member's view).
create policy "npc_reveals_select" on public.npc_reveals for select using (
  private.is_campaign_dm(campaign_id)
  or exists (
    select 1 from public.campaign_members cm
     where cm.user_id = (select auth.uid())
       and cm.campaign_id = npc_reveals.campaign_id
       and cm.party_member_id = npc_reveals.party_member_id
  )
);

-- ── Writers ─────────────────────────────────────────────────────────────────
-- Members are joined to party_members of the NPC's own campaign: a
-- player_visible_to array can hold an id whose member has since been deleted,
-- or (in a copied campaign) one from another campaign, and neither may become
-- a row.

create function public.record_npc_reveals_from_npc()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Shared with nobody and living nowhere: the common case for a new NPC,
  -- and every NPC of a campaign copy, which inserts them one row at a time.
  if new.campaign_id is null
     or (cardinality(new.player_visible_to) = 0 and new.location_id is null) then
    return null;
  end if;
  insert into npc_reveals (npc_id, party_member_id, campaign_id)
  select new.id, pm.id, new.campaign_id
    from party_members pm
   where pm.campaign_id = new.campaign_id
     and (
       pm.id = any (new.player_visible_to)
       or exists (
         select 1 from locations l
          where l.id = new.location_id
            and l.is_npcs_shared
            and pm.id = any (l.player_visible_to)
       )
     )
  on conflict do nothing;
  return null;
end;
$$;

create function public.record_npc_reveals_from_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not new.is_npcs_shared or new.campaign_id is null then
    return null;
  end if;
  insert into npc_reveals (npc_id, party_member_id, campaign_id)
  select n.id, pm.id, n.campaign_id
    from npcs n
    join party_members pm
      on pm.campaign_id = n.campaign_id
     and pm.id = any (new.player_visible_to)
   where n.location_id = new.id
     and n.campaign_id = new.campaign_id
  on conflict do nothing;
  return null;
end;
$$;

create trigger npcs_record_reveals
  after insert or update of player_visible_to, location_id on public.npcs
  for each row execute procedure public.record_npc_reveals_from_npc();

create trigger locations_record_npc_reveals
  after update of is_npcs_shared, player_visible_to on public.locations
  for each row execute procedure public.record_npc_reveals_from_location();

-- Trigger functions need no EXECUTE grant; keep them off the RPC surface.
revoke execute on function public.record_npc_reveals_from_npc() from public, anon, authenticated;
revoke execute on function public.record_npc_reveals_from_location() from public, anon, authenticated;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- What is already shared has no recorded moment. The NPC's created_at is the
-- best evidence left: it cannot be later than the reveal, and a DM tends to
-- make people in the order the party meets them. From here on the time is exact.

insert into public.npc_reveals (npc_id, party_member_id, campaign_id, revealed_at)
select n.id, pm.id, n.campaign_id, n.created_at
  from public.npcs n
  join public.party_members pm on pm.campaign_id = n.campaign_id
 where n.campaign_id is not null
   and (
     pm.id = any (n.player_visible_to)
     or exists (
       select 1 from public.locations l
        where l.id = n.location_id
          and l.is_npcs_shared
          and pm.id = any (l.player_visible_to)
     )
   )
on conflict do nothing;
