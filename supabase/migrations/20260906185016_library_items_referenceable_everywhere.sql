-- Library content becomes referenceable everywhere. Story #819, after #815.
--
-- #815 gave `party_inventory` a `library_item_id` sibling so a party could carry
-- shared content without a per-account copy. Every other table that points at an
-- item kept a bare `uuid references items(id)`, so the same content still could
-- not be stocked in a shop, carried by an NPC, required or produced by a recipe,
-- or held by a faction.
--
-- The damage is not hypothetical. The starter recipe `Stitch Leather Armour`
-- outputs `Leather Armour`, which exists only as
-- `library_items.id = 'srd_grimoire_bundled_leather_armour'`. With a uuid column
-- there is no legal value to store, so the recipe imports cleanly and then
-- crafts nothing — `buildStarterRecipeChildRows` drops an output it cannot
-- resolve, silently.
--
-- Same shape as #815 throughout: a text sibling with a foreign key, and a
-- `num_nonnulls(...) <= 1` check so a row names one item or the other, never
-- both. Adding a column rather than widening the existing one keeps the FK to
-- `items` intact, which is what makes cascade-on-delete still mean something.
--
-- ── item_entries is deliberately NOT included ──────────────────────────────
--
-- The issue left this open ("may be custom-only by design"). It is. An entry is
-- writing appended to a *document* item, where `items.content` holds the
-- DM-authored base text — and `library_items` has no `content` column at all.
-- A library item therefore cannot be a document, so there is nothing for an
-- entry to be appended to. Checked rather than assumed, and recorded here so
-- the next reader does not have to check again.

alter table public.store_items
  add column if not exists library_item_id text references public.library_items(id) on delete cascade;
alter table public.store_items
  drop constraint if exists store_items_one_item_ref,
  add constraint store_items_one_item_ref check (num_nonnulls(item_id, library_item_id) <= 1);

alter table public.npc_inventory
  add column if not exists library_item_id text references public.library_items(id) on delete set null;
alter table public.npc_inventory
  drop constraint if exists npc_inventory_one_item_ref,
  add constraint npc_inventory_one_item_ref check (num_nonnulls(item_id, library_item_id) <= 1);

alter table public.crafting_recipe_ingredients
  add column if not exists library_item_id text references public.library_items(id) on delete cascade;
alter table public.crafting_recipe_ingredients
  drop constraint if exists crafting_recipe_ingredients_one_item_ref,
  add constraint crafting_recipe_ingredients_one_item_ref check (num_nonnulls(item_id, library_item_id) <= 1);

alter table public.crafting_recipe_outputs
  add column if not exists library_item_id text references public.library_items(id) on delete cascade;
alter table public.crafting_recipe_outputs
  drop constraint if exists crafting_recipe_outputs_one_item_ref,
  add constraint crafting_recipe_outputs_one_item_ref check (num_nonnulls(item_id, library_item_id) <= 1);

alter table public.faction_items
  add column if not exists library_item_id text references public.library_items(id) on delete cascade;
alter table public.faction_items
  drop constraint if exists faction_items_one_item_ref,
  add constraint faction_items_one_item_ref check (num_nonnulls(item_id, library_item_id) <= 1);

comment on column public.store_items.library_item_id is
  'Shared library content stocked without a per-account copy (#819). Exactly one of item_id / library_item_id is set.';
comment on column public.npc_inventory.library_item_id is
  'Shared library content carried without a per-account copy (#819). Exactly one of item_id / library_item_id is set.';
comment on column public.crafting_recipe_outputs.library_item_id is
  'A recipe may PRODUCE shared content (#819) — the case that made Stitch Leather Armour craft nothing.';

-- `item_id` must become nullable on the three tables where it was NOT NULL, or
-- the new column cannot be used on its own and the feature is decorative. Found
-- by the client executor trying to write a library-only row, not by me writing
-- the column — `num_nonnulls(...) <= 1` permits one-of-two, but a NOT NULL on
-- the uuid side still demands both.
--
-- `npc_inventory` and `crafting_recipe_ingredients` were already nullable.

alter table public.store_items            alter column item_id drop not null;
alter table public.faction_items          alter column item_id drop not null;
alter table public.crafting_recipe_outputs alter column item_id drop not null;

-- ── The chat drop stops casting a text id to uuid ───────────────────────────
--
-- `claim_item_drop` wrote `nullif(v_meta->>'item_id','')::uuid` into both
-- destinations and `grab_item_drop` matched on it, so dropping a library item
-- into chat failed the same way. The client sidestepped it by calling
-- `useEnsureOwnedItem` first, materialising exactly the vault copy this line of
-- work exists to retire.
--
-- Both now carry `library_item_id` alongside rather than instead: a drop names
-- one or the other, and `is not distinct from` matches on whichever is set
-- without a NULL turning the comparison into NULL.

CREATE OR REPLACE FUNCTION public.claim_item_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid, p_npc_id uuid)
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

CREATE OR REPLACE FUNCTION public.grab_item_drop(p_message_id uuid, p_qty integer, p_claimer_user_id uuid, p_claimer_name text, p_party_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta jsonb;
  v_campaign_id uuid;
  v_qty_orig int;
  v_qty_rem int;
  v_to_grab int;
  v_new_claim jsonb;
  v_new_meta jsonb;
  v_item_id uuid;
  v_library_item_id text;
  v_identified boolean;
  v_container boolean;
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Retained because deployed clients still send it. It is deliberately ignored:
  -- the authenticated JWT remains the only source of claimant identity.
  perform p_claimer_user_id;

  select metadata, campaign_id into v_meta, v_campaign_id
  from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_meta is null then raise exception 'message not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  if p_party_member_id is not null then
    if not exists (
      select 1 from public.party_members pm
      where pm.id = p_party_member_id
        and pm.campaign_id = v_campaign_id
        and (
          pm.owner_user_id = auth.uid()
          or exists (
            select 1 from public.campaign_members cm
            where cm.campaign_id = v_campaign_id
              and cm.user_id = auth.uid()
              and cm.party_member_id = p_party_member_id
          )
        )
    ) then
      raise exception 'Cannot grab an item to a member you do not control';
    end if;
  end if;

  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then raise exception 'stack exhausted'; end if;

  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id', auth.uid(),
    'name', p_claimer_name,
    'party_member_id', p_party_member_id,
    'qty', v_to_grab,
    'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
      'claims', coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
    );

  update public.campaign_messages set metadata = v_new_meta where id = p_message_id;

  v_item_id := nullif(v_meta->>'item_id', '')::uuid;
  v_library_item_id := nullif(v_meta->>'library_item_id', '');
  v_identified := coalesce((v_meta->>'item_rarity') = 'mundane', false);
  v_container := coalesce((v_meta->>'is_container')::boolean, false);

  if v_item_id is not null or v_library_item_id is not null then
    select id into v_existing from public.party_inventory
    where campaign_id = v_campaign_id
      and item_id is not distinct from v_item_id
      and library_item_id is not distinct from v_library_item_id
      and carried_by is not distinct from p_party_member_id
      and container_id is null
      and location in ('backpack', 'belt')
      and not is_ruined
      and not is_equipped
      and is_identified = v_identified
      and is_container = v_container
    limit 1;
  end if;

  if v_existing is not null then
    update public.party_inventory
    set quantity = quantity + v_to_grab
    where id = v_existing;
  else
    insert into public.party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_campaign_id, auth.uid(), v_item_id, v_library_item_id,
      v_meta->>'item_name', v_to_grab, p_party_member_id, 'backpack',
      v_container, v_identified
    );
  end if;

  return jsonb_build_object(
    'qty_grabbed', v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$function$;
