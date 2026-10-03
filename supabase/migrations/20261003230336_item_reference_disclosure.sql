-- A player may only point at another member's private item once the campaign
-- has been shown it (#964).
--
-- get_player_visible_items() discloses every items row that a party_inventory
-- row in the caller's campaigns points at. #892 (20261003151455) made the
-- reference itself stay inside the campaign, but it has to admit a global item
-- owned by any member, because loot is exactly that: the DM's vault item in a
-- player's backpack. So a player who knew the uuid of the DM's unrevealed plot
-- item could insert a party_inventory row naming it and read its description,
-- image and content back through the projection. The same went for a chat
-- message: grab_item_drop and claim_item_drop are definers that copy the
-- message's item_id into party_inventory, and any member may post an
-- item_drop message naming whatever item they like.
--
-- The write-time check cannot tell "the DM dropped this" from "a player named
-- the DM's item" by looking at the row, so it asks a different question: has
-- this campaign already been shown the item? A reference written by a client
-- is allowed when the item:
--   * is the writer's own; or
--   * is already in this campaign's party inventory (splitting a stack,
--     dropping a carried item, a thrown javelin, a player offer); or
--   * is on sale in a shop of this campaign the writer can see; or
--   * is an output or ingredient of one of this campaign's crafting recipes;
--   * or is offered by an item-bearing message in this campaign that the
--     writer can read (a drop, a vendor offer, a loot chest): paying a vendor
--     and opening a chest insert the row from the client.
-- "Belongs to this campaign" is deliberately not on the list, unlike #892's
-- rule: only the DM can write a campaign-scoped item and only its owner can
-- read one, so a campaign item is exactly the DM's unrevealed one (found in
-- the pre-push audit).
-- Item-bearing messages are held to the same rule when they are posted, which
-- is what makes the last clause sound rather than circular: a message can only
-- offer what the campaign was already shown, and the DM's own items always
-- pass because they are the DM's.
--
-- Only direct client writes are judged (current_user authenticated or anon).
-- craft_apply is SECURITY INVOKER and takes its rows from the client, so it is
-- judged too; the definer RPCs (the drop claims, assume_character,
-- claim_player_offer, transfer_campaign_ownership) write what they read from
-- rows this rule already guarded, and are trusted the way #892's trigger
-- trusts them. The reverse direction needs no guard: the NPC and monster
-- projections read discovered_monsters, pinned_forms and npcs, which only the
-- DM can write, and store_items lives on locations only a DM can own.
--
-- Rows written before this existed are not re-judged. Nothing distinguishes a
-- planted row from loot after the fact; the check closes the door, it cannot
-- audit what came through it.

-- The item uuids a chat message's metadata names: a drop's or an offer's
-- item_id, and every rolled atom of a loot chest. Every string Postgres will
-- read as a uuid counts, in whatever spelling: the claim RPCs cast with
-- ::uuid, which takes braces, no hyphens and odd groupings, so a guard that
-- only recognised the canonical form let `{<uuid>}` through to them (found in
-- the pre-push audit). A string that is no uuid at all (free text, a library
-- id) names no items row and is skipped; the RPCs' own cast refuses it.
create or replace function private.message_item_ids(p_metadata jsonb)
returns setof uuid
language plpgsql
immutable
set search_path = public, private
as $$
declare
  v text;
begin
  for v in
    select jsonb_path_query(p_metadata, '$.item_id') #>> '{}'
    union
    select jsonb_path_query(p_metadata, '$.rolled_atoms[*].item_id') #>> '{}'
  loop
    begin
      return next v::uuid;
    exception when invalid_text_representation then
      null;
    end;
  end loop;
end;
$$;

revoke execute on function private.message_item_ids(jsonb) from public, anon;
grant execute on function private.message_item_ids(jsonb) to authenticated, service_role;

-- Whether the caller may name p_item in p_campaign: see the header. Definer so
-- it can see rows the caller's RLS hides (the DM's party inventory rows are
-- visible to members, but shops and recipes are not all readable). Total: every
-- branch is an EXISTS, and a null campaign or caller, or a caller who is not
-- a member of the campaign, answers false.
create or replace function private.item_shown_to_campaign(p_item uuid, p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(p_item is not null and p_campaign is not null and (select auth.uid()) is not null and (
    private.is_campaign_member(p_campaign)
  ) and (
    exists (select 1 from public.items i where i.id = p_item and i.user_id = (select auth.uid()))
    or exists (
      select 1 from public.party_inventory pi
      where pi.campaign_id = p_campaign and pi.item_id = p_item
    )
    or exists (
      select 1
      from public.store_items si
      join public.locations l on l.id = si.location_id
      join public.campaign_members cm on cm.campaign_id = l.campaign_id
      where si.item_id = p_item
        and si.visible
        and l.is_inventory_shared
        and l.campaign_id = p_campaign
        and cm.user_id = (select auth.uid())
        and cm.party_member_id = any (l.player_visible_to)
    )
    or exists (
      select 1 from public.crafting_recipes r
      where r.campaign_id = p_campaign
        and (
          exists (select 1 from public.crafting_recipe_outputs o where o.recipe_id = r.id and o.item_id = p_item)
          or exists (select 1 from public.crafting_recipe_ingredients g where g.recipe_id = r.id and g.item_id = p_item)
        )
    )
    or exists (
      select 1 from public.campaign_messages m
      where m.campaign_id = p_campaign
        and m.type in ('item_drop', 'vendor_offer', 'player_offer', 'loot_chest')
        and (m.recipient_user_id is null
             or m.recipient_user_id = (select auth.uid())
             or m.user_id = (select auth.uid()))
        and p_item in (select private.message_item_ids(m.metadata))
    )
  ), false);
$$;

revoke execute on function private.item_shown_to_campaign(uuid, uuid) from public, anon;
grant execute on function private.item_shown_to_campaign(uuid, uuid) to authenticated, service_role;

-- SECURITY INVOKER on purpose, like private.enforce_same_campaign_refs:
-- current_user must say whether this is a client write or a definer RPC's.
create or replace function private.guard_inventory_item_shown()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if current_user not in ('authenticated', 'anon') or new.item_id is null then
    return new;
  end if;
  -- An edit that keeps its reference is not re-judged: a stack moving between
  -- characters, or a whole-record save (#946), resends an unchanged item_id.
  if tg_op = 'UPDATE'
     and new.item_id is not distinct from old.item_id
     and new.campaign_id is not distinct from old.campaign_id then
    return new;
  end if;
  if not private.item_shown_to_campaign(new.item_id, new.campaign_id) then
    raise exception using
      errcode = '42501',
      message = 'party_inventory.item_id must name an item this campaign has been shown',
      hint = 'Another member''s private item reaches a player through a drop, a shop, a recipe or the DM''s own write.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_inventory_item_shown() from public, anon, authenticated;

-- zzz_: same-event BEFORE triggers fire in name order, so this runs after
-- zz_same_campaign_refs. A reference into another campaign or a stranger's
-- vault is #892's to refuse, with its own message; this one judges only what
-- that check lets through.

drop trigger if exists zzz_item_shown on public.party_inventory;
create trigger zzz_item_shown
  before insert or update of item_id, campaign_id on public.party_inventory
  for each row execute procedure private.guard_inventory_item_shown();

-- A message is judged once, when it is posted: clients have no UPDATE policy on
-- campaign_messages, and the claim RPCs that rewrite its metadata only add
-- claims to it.
create or replace function private.guard_message_items_shown()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_item uuid;
begin
  if current_user not in ('authenticated', 'anon') or new.metadata is null
     or new.type not in ('item_drop', 'vendor_offer', 'player_offer', 'loot_chest') then
    return new;
  end if;
  for v_item in select private.message_item_ids(new.metadata) loop
    if not private.item_shown_to_campaign(v_item, new.campaign_id) then
      raise exception using
        errcode = '42501',
        message = 'a chat message may only offer an item this campaign has been shown',
        hint = 'Drop or offer an item you own, or one the party already holds.';
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function private.guard_message_items_shown() from public, anon, authenticated;

drop trigger if exists zzz_items_shown on public.campaign_messages;
create trigger zzz_items_shown
  before insert on public.campaign_messages
  for each row execute procedure private.guard_message_items_shown();

-- craft_apply now creates before it consumes. A ruined attempt copies the
-- consumed ingredient's item_id; when that used up the last of a stack of the
-- DM's item, consuming first left the campaign holding no row that showed it,
-- and the guard above would refuse the wreckage. Body otherwise unchanged from
-- the live definition.
create or replace function public.craft_apply(
  p_ingredients  jsonb,
  p_outcome      text,
  p_success_rows jsonb default '[]'::jsonb,
  p_ruined_row   jsonb default null
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ing record;
begin
  if p_outcome = 'success' then
    insert into party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location, is_ruined)
    select
      x.campaign_id, v_uid, x.item_id, x.library_item_id, x.name, x.quantity, x.carried_by, 'backpack', false
    from jsonb_to_recordset(coalesce(p_success_rows, '[]'::jsonb))
      as x(campaign_id uuid, item_id uuid, library_item_id text, name text, quantity integer, carried_by uuid);

  elsif p_outcome = 'ruin' and p_ruined_row is not null then
    insert into party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location, notes, is_ruined)
    values (
      (p_ruined_row->>'campaign_id')::uuid, v_uid,
      nullif(p_ruined_row->>'item_id', '')::uuid,
      nullif(p_ruined_row->>'library_item_id', ''),
      p_ruined_row->>'name', 1,
      nullif(p_ruined_row->>'carried_by', '')::uuid,
      'backpack', 'Ruined during a failed crafting attempt.', true
    );
  end if;

  -- Consume each ingredient by its required quantity; delete the row only when
  -- the stack is fully used up.
  if p_ingredients is not null then
    for v_ing in
      select (x->>'id')::uuid as id, (x->>'qty')::int as qty
      from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) as x
    loop
      if v_ing.id is null or v_ing.qty is null or v_ing.qty <= 0 then
        continue;
      end if;
      update party_inventory
        set quantity = quantity - v_ing.qty
        where id = v_ing.id;
      delete from party_inventory
        where id = v_ing.id and quantity <= 0;
    end loop;
  end if;
end;
$$;

-- claim_item_drop's NPC branch, unchanged but for the DM check. Body from the
-- live definition.
create or replace function public.claim_item_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid, p_npc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id,
    'npc_id',                  p_npc_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  if p_npc_id is not null then
    -- Giving a drop to an NPC is the DM's move: NPC inventory is the DM's to
    -- write (npc_inventory_insert), and a player who could do it here could
    -- also take a drop away from the party (found in #964's pre-push audit).
    if not private.is_campaign_dm(v_msg.campaign_id) then
      raise exception 'Only the DM can give a drop to an NPC';
    end if;
    insert into public.npc_inventory (campaign_id, user_id, npc_id, item_id, library_item_id, name, quantity, notes)
    values (
      v_msg.campaign_id, auth.uid(), p_npc_id,
      nullif(v_meta->>'item_id', '')::uuid,
      nullif(v_meta->>'library_item_id', ''),
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      null
    );
  else
    -- Only deliver to the caller's OWN character (owned or linked); a null member
    -- is a stash claim (any campaign member may stash).
    if p_party_member_id is not null then
      if not exists (
        select 1 from public.party_members pm
        where pm.id = p_party_member_id
          and pm.campaign_id = v_msg.campaign_id
          and (
            pm.owner_user_id = auth.uid()
            or exists (
              select 1 from public.campaign_members cm
              where cm.campaign_id = v_msg.campaign_id
                and cm.user_id = auth.uid()
                and cm.party_member_id = p_party_member_id
            )
          )
      ) then
        raise exception 'Cannot claim an item to a member you do not control';
      end if;
    end if;

    insert into public.party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_msg.campaign_id, auth.uid(),
      nullif(v_meta->>'item_id', '')::uuid,
      nullif(v_meta->>'library_item_id', ''),
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      p_party_member_id, 'backpack',
      coalesce((v_meta->>'is_container')::boolean, false),
      coalesce((v_meta->>'item_rarity') = 'mundane', false)
    );
  end if;

  return v_meta;
end;
$function$;
