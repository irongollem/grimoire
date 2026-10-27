-- #1112: a player changes their own pack and the stash, never another player's.
--
-- Until now every campaign member could update or delete every party_inventory
-- row (party_inventory_member_* tested only is_campaign_member), so a player's
-- client was the only thing keeping them out of a friend's pack. The player's
-- screen only ever offered their own pack and the stash; the database now says
-- the same:
--
--   * the DM writes any row;
--   * a player writes rows carried by the character they play (their seat, or a
--     character they own) and rows in the stash (carried_by null), and a row
--     must stay in one of those places after the write;
--   * handing something to another party member goes through
--     give_inventory_item, and coins through give_coins, both of which move
--     things only OUT of the caller's pack. Nobody takes from another pack: a
--     stolen dagger is the DM's ruling, carried out on the Party page.
--
-- craft_apply and reorder_party_inventory are SECURITY INVOKER and only ever
-- touch the crafter's own rows and the stash, so the narrower policies cover
-- them unchanged. The claim/grab/purchase RPCs are definers and authorize
-- themselves.

-- ── The rule, in one place ───────────────────────────────────────────────────
-- Total by construction: an absent seat, an absent row or a missing auth.uid()
-- answers false, never NULL (CLAUDE.md, migration rules item 3).
create or replace function private.can_write_pack(p_campaign_id uuid, p_carried_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.is_campaign_dm(p_campaign_id)
    or (
      private.is_campaign_member(p_campaign_id)
      and (
        p_carried_by is null
        or p_carried_by = private.my_party_member_id(p_campaign_id)
        -- Ownership mirrors party_members_update: a character the caller owns,
        -- or made and nobody else owns. This is what lets a player's character
        -- creation seed its starting equipment before the seat is taken.
        or exists (
          select 1
            from public.party_members pm
           where pm.id = p_carried_by
             and pm.campaign_id = p_campaign_id
             and (
               pm.owner_user_id = (select auth.uid())
               or (pm.user_id = (select auth.uid()) and pm.owner_user_id is null)
             )
        )
      )
    ),
    false
  );
$$;

comment on function private.can_write_pack(uuid, uuid) is
  'May the caller change a pack row carried by p_carried_by (null = the stash) in this campaign? The DM always; a player for the stash and the character they play or own (#1112).';

-- ── Policies ─────────────────────────────────────────────────────────────────
-- One permissive policy per command, as before; only the condition narrows.
-- USING judges the row as it is, WITH CHECK where it ends up, so a player can
-- neither reach into another pack nor push a row into one with a plain update.
drop policy party_inventory_member_insert on public.party_inventory;
create policy party_inventory_member_insert on public.party_inventory
  for insert
  with check (
    user_id = (select auth.uid())
    and private.can_write_pack(campaign_id, carried_by)
  );

alter policy party_inventory_member_update on public.party_inventory
  using (private.can_write_pack(campaign_id, carried_by))
  with check (private.can_write_pack(campaign_id, carried_by));

alter policy party_inventory_member_delete on public.party_inventory
  using (private.can_write_pack(campaign_id, carried_by));

-- A row keeps its campaign. WITH CHECK sees only the new row, so a member of two
-- campaigns could otherwise carry a stash row from one table to the other with a plain
-- update (zz_same_campaign_refs catches it only when carried_by or container_id is set).
-- Definers that move content between campaigns run as their owner and pass.
create or replace function private.guard_party_inventory_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and new.campaign_id is distinct from old.campaign_id then
    raise exception 'A pack row stays in its campaign' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_party_inventory_campaign() from public, anon, authenticated;

create trigger party_inventory_keeps_campaign
  before update of campaign_id on public.party_inventory
  for each row execute procedure private.guard_party_inventory_campaign();

-- ── Give an item ─────────────────────────────────────────────────────────────
-- Moves a row (or p_quantity of a stack) from where it is to p_to_member_id's
-- backpack, or to the stash when p_to_member_id is null. It lands unequipped
-- and unattuned: the new carrier has not attuned to it. A container takes
-- everything inside it along, at any depth. A definer because the destination
-- is a pack the caller may not write; it authorizes the SOURCE with the same
-- rule as the policies, so it never lets anyone take.
create or replace function public.give_inventory_item(
  p_item_id uuid,
  p_to_member_id uuid,
  p_quantity integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.party_inventory%rowtype;
  v_to_campaign uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Authorized before anything is locked, so a caller cannot hold a lock on a row they
  -- have no business with; then locked and judged again, since it may have moved since.
  select * into v_row from public.party_inventory where id = p_item_id;
  if not found or not private.can_write_pack(v_row.campaign_id, v_row.carried_by) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_row from public.party_inventory where id = p_item_id for update;
  if not found or not private.can_write_pack(v_row.campaign_id, v_row.carried_by) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_to_member_id is not null then
    select pm.campaign_id into v_to_campaign from public.party_members pm where pm.id = p_to_member_id;
    if v_to_campaign is distinct from v_row.campaign_id then
      raise exception 'That character is not in this campaign' using errcode = '22023';
    end if;
  end if;

  if p_quantity is not null and (p_quantity < 1 or p_quantity > v_row.quantity) then
    raise exception 'Give between 1 and % of these', v_row.quantity using errcode = '22023';
  end if;

  if v_row.carried_by is not distinct from p_to_member_id then
    return v_row.id;
  end if;

  -- Part of a stack: the rest stays put, a new row carries the given part.
  if p_quantity is not null and p_quantity < v_row.quantity then
    if v_row.is_container then
      raise exception 'A container is given whole' using errcode = '22023';
    end if;
    update public.party_inventory set quantity = quantity - p_quantity where id = v_row.id;
    insert into public.party_inventory (
      campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by,
      location, notes, current_charges, is_identified, curse_revealed, is_ruined, quality
    ) values (
      v_row.campaign_id, v_uid, v_row.item_id, v_row.library_item_id, v_row.name, p_quantity, p_to_member_id,
      'backpack', v_row.notes, v_row.current_charges, v_row.is_identified, v_row.curse_revealed, v_row.is_ruined, v_row.quality
    )
    returning id into v_new_id;
    return v_new_id;
  end if;

  update public.party_inventory
     set carried_by = p_to_member_id,
         location = 'backpack',
         container_id = null,
         slot = null,
         is_equipped = false,
         is_attuned = false
   where id = v_row.id;

  -- Only what is in the container AND in the same pack goes with it: a row someone else
  -- carries (pointed into this bag by its own carrier) stays theirs.
  if v_row.is_container then
    with recursive inside as (
      select pi.id from public.party_inventory pi
       where pi.container_id = v_row.id and pi.carried_by is not distinct from v_row.carried_by
      union
      select pi.id from public.party_inventory pi join inside on pi.container_id = inside.id
       where pi.carried_by is not distinct from v_row.carried_by
    )
    update public.party_inventory
       set carried_by = p_to_member_id,
           slot = null,
           is_equipped = false,
           is_attuned = false
     where id in (select id from inside);
  end if;

  return v_row.id;
end;
$$;

comment on function public.give_inventory_item(uuid, uuid, integer) is
  'Hand a pack row (or part of a stack) to another party member, or to the stash when the target is null. Only out of a pack the caller may write (#1112).';

revoke execute on function public.give_inventory_item(uuid, uuid, integer) from public, anon;
grant execute on function public.give_inventory_item(uuid, uuid, integer) to authenticated, service_role;

-- ── Give coins ───────────────────────────────────────────────────────────────
-- One step, so coin is never created or lost between two purse writes: out of
-- p_from_member_id's purse and into p_to_member_id's, or not at all. A definer
-- because a player cannot write another character's row; the source purse is
-- authorized with the pack rule (the purse belongs to the character).
create or replace function public.give_coins(
  p_from_member_id uuid,
  p_to_member_id uuid,
  p_pp integer default 0,
  p_gp integer default 0,
  p_ep integer default 0,
  p_sp integer default 0,
  p_cp integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.party_members%rowtype;
  v_to_campaign uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Authorized before anything is locked, so a caller cannot lock purses they may not touch.
  select * into v_from from public.party_members where id = p_from_member_id;
  if not found or v_from.campaign_id is null
     or not private.can_write_pack(v_from.campaign_id, v_from.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Both rows locked in id order, so two gives crossing each other cannot deadlock; the
  -- source is read again under the lock and judged again, as give_inventory_item does,
  -- since a seat or an owner may have changed in between.
  perform 1 from public.party_members
   where id in (p_from_member_id, p_to_member_id)
   order by id
     for update;
  select * into v_from from public.party_members where id = p_from_member_id;
  if not found or v_from.campaign_id is null
     or not private.can_write_pack(v_from.campaign_id, v_from.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_to_member_id = p_from_member_id then
    raise exception 'Give the coins to someone else' using errcode = '22023';
  end if;
  select pm.campaign_id into v_to_campaign from public.party_members pm where pm.id = p_to_member_id;
  if v_to_campaign is distinct from v_from.campaign_id then
    raise exception 'That character is not in this campaign' using errcode = '22023';
  end if;

  if p_pp is null or p_gp is null or p_ep is null or p_sp is null or p_cp is null
     or least(p_pp, p_gp, p_ep, p_sp, p_cp) < 0
     or p_pp + p_gp + p_ep + p_sp + p_cp = 0 then
    raise exception 'Give at least one coin' using errcode = '22023';
  end if;

  if v_from.pp < p_pp or v_from.gp < p_gp or v_from.ep < p_ep or v_from.sp < p_sp or v_from.cp < p_cp then
    raise exception 'Not that many coins in the purse' using errcode = '22023';
  end if;

  update public.party_members
     set pp = pp - p_pp, gp = gp - p_gp, ep = ep - p_ep, sp = sp - p_sp, cp = cp - p_cp
   where id = p_from_member_id;
  update public.party_members
     set pp = pp + p_pp, gp = gp + p_gp, ep = ep + p_ep, sp = sp + p_sp, cp = cp + p_cp
   where id = p_to_member_id;
end;
$$;

comment on function public.give_coins(uuid, uuid, integer, integer, integer, integer, integer) is
  'Move coins from a purse the caller may act for into another party member''s purse, atomically (#1112).';

revoke execute on function public.give_coins(uuid, uuid, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.give_coins(uuid, uuid, integer, integer, integer, integer, integer) to authenticated, service_role;
