-- Migration: transfer_campaign_scoped_monsters_traps
-- Resolve #630 without duplicating the ~370-line ownership-transfer body.
--
-- The existing three-argument function already clones every personal-library
-- monster/trap reachable from campaign content and repoints those references.
-- This transactional wrapper fills its one blind spot first: scoped rows that
-- are not referenced yet. After the established transfer completes, it applies
-- the outgoing owner's explicit choice to their originals. The wrapper and the
-- delegated function execute in the same statement transaction.

create or replace function public.transfer_campaign_ownership(
  p_campaign_id uuid,
  p_new_owner_id uuid,
  p_leave_campaign boolean,
  p_scoped_copy_disposition text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  UUID_RE constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_uid   uuid := auth.uid();
  v_owner uuid;
  r       record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_scoped_copy_disposition not in ('promote', 'delete') then
    raise exception 'Invalid scoped-copy disposition: %, expected ''promote'' or ''delete''',
      p_scoped_copy_disposition;
  end if;

  select user_id into v_owner
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Only the campaign owner can transfer it';
  end if;

  -- These inserts are part of a transfer, not user-created quota consumption.
  -- The delegated function sets the same transaction-local flag, but these
  -- copies happen first.
  perform set_config('grimoire.bypass_quota', 'on', true);

  -- The established function clones the reachable set below. Copy only scoped
  -- rows outside that set here, avoiding duplicate clones while ensuring newly
  -- authored, not-yet-used campaign creatures travel with the campaign.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.campaign_id = p_campaign_id
      and not exists (
        select 1
        from (
          select n.linked_monster_id as monster_id
            from public.npcs n
           where n.campaign_id = p_campaign_id and n.linked_monster_id is not null
          union
          select dm.monster_id
            from public.discovered_monsters dm
           where dm.campaign_id = p_campaign_id and dm.monster_id is not null
          union
          select pf.monster_id
            from public.pinned_forms pf
           where pf.campaign_id = p_campaign_id and pf.monster_id is not null
          union
          select c.source_monster_id::uuid
            from public.companions c
           where c.campaign_id = p_campaign_id and c.source_monster_id ~* UUID_RE
          union
          select (comb->>'monster_id')::uuid
            from public.encounters e,
                 lateral jsonb_array_elements(coalesce(e.combatants, '[]'::jsonb)) comb
           where e.campaign_id = p_campaign_id and comb->>'monster_id' ~* UUID_RE
          union
          select (spawn->>'monster_id')::uuid
            from public.encounters e,
                 lateral jsonb_array_elements(coalesce(e.events, '[]'::jsonb)) ev,
                 lateral jsonb_array_elements(coalesce(ev->'actions', '[]'::jsonb)) act,
                 lateral jsonb_array_elements(coalesce(act->'spawns', '[]'::jsonb)) spawn
           where e.campaign_id = p_campaign_id and spawn->>'monster_id' ~* UUID_RE
          union
          select (pm.wildshape_state->>'monster_id')::uuid
            from public.party_members pm
           where pm.campaign_id = p_campaign_id
             and pm.wildshape_state->>'monster_id' ~* UUID_RE
          union
          select x.mid
            from public.campaigns c,
                 lateral unnest(c.excluded_monster_ids) x(mid)
           where c.id = p_campaign_id
        ) referenced
        where referenced.monster_id = m.id
      )
  loop
    insert into public.monsters
    select (jsonb_populate_record(
      null::public.monsters,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', p_new_owner_id
      )
    )).*;
  end loop;

  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.campaign_id = p_campaign_id
      and not exists (
        select 1
        from public.encounters e,
             lateral unnest(e.trap_ids) x(trap_id)
        where e.campaign_id = p_campaign_id and x.trap_id = t.id
      )
  loop
    insert into public.traps
    select (jsonb_populate_record(
      null::public.traps,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', p_new_owner_id
      )
    )).*;
  end loop;

  -- Performs authorization of the recipient, clones reachable library rows,
  -- repoints every reference, moves campaign-owned content and swaps roles.
  perform public.transfer_campaign_ownership(
    p_campaign_id,
    p_new_owner_id,
    p_leave_campaign
  );

  -- References from the transferred campaign now target the recipient's
  -- clones. Only the old owner's originals are resolved here; the fresh copies
  -- stay scoped to the transferred campaign.
  if p_scoped_copy_disposition = 'promote' then
    update public.monsters
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.traps
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
  else
    delete from public.monsters
     where user_id = v_owner and campaign_id = p_campaign_id;
    delete from public.traps
     where user_id = v_owner and campaign_id = p_campaign_id;
  end if;
end;
$$;

-- The legacy overload cannot express the required retention choice. Keep it
-- as an implementation detail for the wrapper, but remove it from API roles so
-- clients cannot silently recreate #630.
revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

revoke execute on function public.transfer_campaign_ownership(uuid, uuid, boolean, text)
  from public, anon;
grant execute on function public.transfer_campaign_ownership(uuid, uuid, boolean, text)
  to authenticated, service_role;

comment on function public.transfer_campaign_ownership(uuid, uuid, boolean, text) is
  'Hands a campaign to another member, copies scoped and referenced personal-library monsters/traps, and explicitly promotes or deletes the outgoing owner''s scoped originals.';
