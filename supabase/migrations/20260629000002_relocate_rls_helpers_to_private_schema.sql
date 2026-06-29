-- Migration: relocate_rls_helpers_to_private_schema
-- Move RLS-helper SECURITY DEFINER functions into a non-exposed `private` schema,
-- fix grab_item_drop's missing membership/auth check, and drop anon EXECUTE on login-only RPCs.


-- 1. Non-exposed schema for RLS helpers (PostgREST only exposes public + graphql_public)
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- 2. Copy the 8 helper functions verbatim into `private` (mechanical: only the
--    CREATE header's schema is rewritten; bodies are byte-identical copies).
do $relocate$
declare
  r record;
  d text;
begin
  for r in
    select pr.oid
    from pg_proc pr
    join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public'
      and pr.prokind = 'f'
      and pr.proname in (
        'is_app_admin','is_campaign_dm','is_campaign_member','is_dm_of_my_campaigns',
        'is_faction_pc_member','can_see_shared_store','item_in_visible_shared_store','owns_crafting_recipe'
      )
  loop
    d := pg_get_functiondef(r.oid);
    d := regexp_replace(d, 'CREATE OR REPLACE FUNCTION public\.', 'CREATE OR REPLACE FUNCTION private.', '');
    execute d;
  end loop;
end
$relocate$;

-- Lock down execute on the private copies: drop the default PUBLIC grant,
-- grant only the roles that evaluate RLS / call them.
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;

-- 3. Repoint every public RLS policy from the bare/public helper name to private.<helper>.
do $repoint_policies$
declare
  r record;
  nq text;
  nc text;
  h text;
  helpers text[] := array[
    'is_app_admin','is_campaign_dm','is_campaign_member','is_dm_of_my_campaigns',
    'is_faction_pc_member','can_see_shared_store','item_in_visible_shared_store','owns_crafting_recipe'
  ];
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
  loop
    nq := r.qual;
    nc := r.with_check;
    foreach h in array helpers loop
      if nq is not null then
        nq := regexp_replace(nq, '(public\.)?\m' || h || '\M', 'private.' || h, 'g');
      end if;
      if nc is not null then
        nc := regexp_replace(nc, '(public\.)?\m' || h || '\M', 'private.' || h, 'g');
      end if;
    end loop;
    if nq is distinct from r.qual or nc is distinct from r.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        r.policyname, r.schemaname, r.tablename,
        case when nq is not null then ' using (' || nq || ')' else '' end,
        case when nc is not null then ' with check (' || nc || ')' else '' end
      );
    end if;
  end loop;
end
$repoint_policies$;

-- 4. Repoint the 12 dependent functions: rewrite every helper reference
--    (qualified or bare) to explicit private.<helper>, mechanically.
do $repoint_funcs$
declare
  r record;
  d text;
  h text;
  helpers text[] := array[
    'is_app_admin','is_campaign_dm','is_campaign_member','is_dm_of_my_campaigns',
    'is_faction_pc_member','can_see_shared_store','item_in_visible_shared_store','owns_crafting_recipe'
  ];
begin
  for r in
    select pr.oid
    from pg_proc pr
    join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public'
      and pr.prokind = 'f'
      and pr.proname in (
        'claim_currency_drop','claim_item_drop','claim_loot_chest_atom','claim_vendor_offer',
        'consume_app_invite','enforce_byok_pro_only','get_user_ledger','guard_campaign_member_self_update',
        'sync_srd_monster_art_to_shared_table','sync_srd_spell_art_to_shared_table',
        'update_companion_party_notes','update_npc_party_notes'
      )
  loop
    d := pg_get_functiondef(r.oid);
    foreach h in array helpers loop
      d := regexp_replace(d, '(public\.)?\m' || h || '\M', 'private.' || h, 'g');
    end loop;
    execute d;
  end loop;
end
$repoint_funcs$;

-- 5. Drop the now-unreferenced public helper copies.
drop function public.is_app_admin();
drop function public.is_campaign_dm(uuid);
drop function public.is_campaign_member(uuid);
drop function public.is_dm_of_my_campaigns(uuid);
drop function public.is_faction_pc_member(uuid, uuid);
drop function public.can_see_shared_store(uuid);
drop function public.item_in_visible_shared_store(uuid);
drop function public.owns_crafting_recipe(uuid);

-- 6. Fix grab_item_drop: it never verified campaign membership and trusted a
--    client-supplied claimer id. Add the membership gate (matching claim_item_drop)
--    and record auth.uid() as the claimer instead of the spoofable parameter.
create or replace function public.grab_item_drop(
  p_message_id uuid, p_qty integer, p_claimer_user_id uuid, p_claimer_name text, p_party_member_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $grab$
declare
  v_meta        jsonb;
  v_campaign_id uuid;
  v_qty_orig    int;
  v_qty_rem     int;
  v_to_grab     int;
  v_new_claim   jsonb;
  v_new_meta    jsonb;
begin
  -- Lock the row to serialise concurrent grabs
  select metadata, campaign_id into v_meta, v_campaign_id
  from public.campaign_messages
  where id = p_message_id
  for update;

  if v_meta is null then
    raise exception 'message not found';
  end if;

  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem  := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then
    raise exception 'stack exhausted';
  end if;

  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  -- Record the authenticated caller as the claimer, not the client-supplied id.
  v_new_claim := jsonb_build_object(
    'user_id',          auth.uid(),
    'name',             p_claimer_name,
    'party_member_id',  p_party_member_id,
    'qty',              v_to_grab,
    'at',               to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
         'claims',
         coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
       );

  update public.campaign_messages
  set metadata = v_new_meta
  where id = p_message_id;

  return jsonb_build_object(
    'qty_grabbed',        v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$grab$;

-- 7. Drop anon EXECUTE on RPCs that require a signed-in user (auth.uid()).
--    These hold EXECUTE via the PUBLIC grant, so revoke PUBLIC (which also covers
--    anon) and re-grant explicitly to authenticated + service_role.
--    Kept for anon: validate_app_invite, get_srd_monster_sources, get_srd_spell_sources
--    (invite preview + public SRD data).
do $drop_anon$
declare
  fn text;
  fns text[] := array[
    'public.assume_character(uuid)',
    'public.check_quota(text)',
    'public.claim_currency_drop(uuid, text, uuid)',
    'public.claim_item_drop(uuid, text, uuid, uuid)',
    'public.claim_loot_chest_atom(uuid, text, text)',
    'public.claim_vendor_offer(uuid, text, uuid)',
    'public.clear_shapeshifter_appearance(uuid)',
    'public.set_shapeshifter_appearance(uuid, uuid)',
    'public.get_admin_users()',
    'public.get_credit_calibration_hints()',
    'public.get_player_visible_npcs(uuid, uuid[])',
    'public.get_user_ledger(uuid)',
    'public.grab_item_drop(uuid, integer, uuid, text, uuid)',
    'public.update_combatant_position(uuid, text, jsonb)',
    'public.update_companion_party_notes(uuid, text)',
    'public.update_npc_party_notes(uuid, text)',
    'public.sync_srd_monster_art_to_shared_table()',
    'public.sync_srd_spell_art_to_shared_table()'
  ];
begin
  foreach fn in array fns loop
    execute 'revoke execute on function ' || fn || ' from public, anon';
    execute 'grant execute on function ' || fn || ' to authenticated, service_role';
  end loop;
end
$drop_anon$;

-- 8. rate_limit_events: RLS enabled with no policy. Add an admin-read policy so
--    the table has an explicit policy (writes happen via SECURITY DEFINER/service_role).
create policy "rate_limit_events_admin_read" on public.rate_limit_events
  for select using (private.is_app_admin());
