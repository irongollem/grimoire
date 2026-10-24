-- Migration: craft_experiment_discoverable_recipes
-- A DM can mark a recipe discoverable; craft_experiment lets a player find one by laying out
-- exactly its ingredients on the experiment bench (#1103).
--
-- The reveal has to be a definer: a player can read a recipe only once their character is in
-- player_visible_to, and only a DM may write that column (crafting_recipes_update). So the
-- matching happens here, against recipes the caller cannot see, and the function answers only
-- "this recipe", "near miss" or "nothing", never a list.
--
-- The rules (the maintainer's, 24 Oct 2026):
--   * Only recipes the DM marked discoverable can be found. Off by default: a recipe stays
--     secret unless the DM says otherwise.
--   * The set must be EXACT: every ingredient covered by one laid-out item, and every laid-out
--     item used. Emptying a whole pack onto the bench therefore finds nothing.
--   * Only the caller's own character's items or the party stash count, and only spendable ones
--     (never ruined, equipped or a container), the same rule a craft spends by.
--   * Discovery needs no roll and spends nothing; amounts are the recipe's business when it is
--     attempted. A failed experiment costs only time, which is stated, not tracked.
--   * A near miss (one ingredient short, or one item too many, against a discoverable recipe
--     of that discipline) answers with which of the two, never naming the ingredient or the
--     recipe. Hints are the optional rule `crafting_near_miss_hints` (src/rules/optionalRules.ts,
--     defaultEnabled true): no campaign_rules row means on, exactly as the client reads it.

alter table public.crafting_recipes
  add column discoverable boolean not null default false;

comment on column public.crafting_recipes.discoverable is
  'When true, a player who has not been shown this recipe can find it on the experiment bench by laying out exactly its ingredients (craft_experiment, #1103). Off by default.';

-- Maximum matching between a recipe's ingredients and the laid-out rows (at most eight), as a
-- bitmask dynamic programme: p_masks[i] is the set of rows ingredient i could take; the result
-- is the most ingredients that can each get a different row. At most 256 states per step, all
-- integer arithmetic, so a recipe costs microseconds however broad its tags. Pure; in `private`
-- so PostgREST does not publish it.
create function private.craft_max_matching(p_masks int[], p_rows int)
returns int
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_full int := 1 << p_rows;
  v_reach boolean[] := array_fill(false, array[v_full]);
  v_next boolean[];
  v_best int := 0;
  v_count int;
  i int; m int; r int;
begin
  v_reach[1] := true; -- the empty set of used rows (mask 0, stored at index 1)
  for i in 1 .. coalesce(array_length(p_masks, 1), 0) loop
    v_next := v_reach;
    for m in 0 .. v_full - 1 loop
      continue when not v_reach[m + 1];
      for r in 0 .. p_rows - 1 loop
        if (p_masks[i] >> r) & 1 = 1 and (m >> r) & 1 = 0 then
          v_next[(m | (1 << r)) + 1] := true;
        end if;
      end loop;
    end loop;
    v_reach := v_next;
  end loop;
  for m in 0 .. v_full - 1 loop
    continue when not v_reach[m + 1];
    v_count := 0;
    for r in 0 .. p_rows - 1 loop
      v_count := v_count + ((m >> r) & 1);
    end loop;
    v_best := greatest(v_best, v_count);
  end loop;
  return v_best;
end;
$$;

-- Only ever called inside craft_experiment, which runs as its owner, so no client role needs it.
revoke execute on function private.craft_max_matching(int[], int) from public, anon, authenticated;

create function public.craft_experiment(p_party_member_id uuid, p_discipline text, p_row_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_campaign uuid;
  v_rows int;
  v_hide_hints boolean;
  v_result jsonb;
begin
  -- Identity from auth.uid() only: the caller must be the player seated as this character.
  select pm.campaign_id into v_campaign from party_members pm where pm.id = p_party_member_id;
  if v_uid is null or v_campaign is null or not exists (
    select 1 from campaign_members cm
    where cm.user_id = v_uid
      and cm.campaign_id = v_campaign
      and cm.party_member_id = p_party_member_id
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- A NULL element is refused outright: cardinality() counts it but every row check below
  -- ignores it, so `array[null]` would otherwise reach the matching with nothing laid out and
  -- probe for secret single-ingredient recipes (audit, 24 Oct 2026).
  if p_discipline is null or p_row_ids is null or cardinality(p_row_ids) = 0 or cardinality(p_row_ids) > 8
     or array_position(p_row_ids, null) is not null then
    raise exception 'Lay out between one and eight items' using errcode = '22023';
  end if;

  v_rows := (select count(distinct x) from unnest(p_row_ids) as x);

  -- Every laid-out row must be this character's or the party stash's, in this campaign, and
  -- spendable. Anything else is refused outright rather than silently dropped, so the answer
  -- can never depend on a row the caller does not hold.
  if v_rows <> (
    select count(*) from party_inventory pi
    where pi.id = any(p_row_ids)
      and pi.campaign_id = v_campaign
      and (pi.carried_by = p_party_member_id or pi.carried_by is null)
      and not pi.is_ruined and not pi.is_equipped and not pi.is_container
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- No row means the rule's default, which is on (defaultEnabled in the client registry).
  select not coalesce(
    (select cr.enabled from campaign_rules cr
      where cr.campaign_id = v_campaign and cr.rule_key = 'crafting_near_miss_hints'),
    true)
    into v_hide_hints;

  with
  placed as (
    -- A row is one item kind; its tags come from whichever catalogue it references. `idx` is
    -- its bit (0-7) in the masks below.
    select pi.id, pi.item_id, pi.library_item_id, coalesce(i.tags, li.tags) as tags,
           (row_number() over (order by pi.id) - 1)::int as idx
    from party_inventory pi
    left join items i on i.id = pi.item_id
    left join library_items li on li.id = pi.library_item_id
    where pi.id = any(p_row_ids)
  ),
  sized as (
    -- Only recipes within one ingredient of the laid-out count can match or be a near miss.
    -- A recipe with no ingredients cannot be found by materials at all.
    select r.id, r.name, r.created_at, count(g.id)::int as n_ing
    from crafting_recipes r
    join crafting_recipe_ingredients g on g.recipe_id = r.id
    where r.campaign_id = v_campaign
      and r.discipline = p_discipline
      and r.discoverable
      and not (p_party_member_id = any(r.player_visible_to))
    group by r.id
    having count(g.id) between greatest(v_rows - 1, 1) and v_rows + 1
  ),
  fits as (
    -- Per ingredient, the bitmask of laid-out rows that could fill it: the same item, or a row
    -- carrying all its tags. 0 means nothing laid out fits it.
    select g.recipe_id, g.position, g.id,
           coalesce(bit_or(1 << p.idx), 0) as mask
    from crafting_recipe_ingredients g
    join sized z on z.id = g.recipe_id
    left join placed p on
      (g.item_id is not null and p.item_id = g.item_id)
      or (g.library_item_id is not null and p.library_item_id = g.library_item_id)
      or (g.item_id is null and g.library_item_id is null
          and cardinality(g.tags) > 0 and p.tags @> g.tags)
    group by g.recipe_id, g.position, g.id
  ),
  scored as (
    -- One aggregated pass, then the matching on at most eight bits per recipe
    -- (private.craft_max_matching). An earlier recursive-CTE version scanned the unindexed edge
    -- list per search state and took seconds on a campaign of hundreds of broad-tag recipes
    -- (audit, 24 Oct 2026); this one is linear in the recipes and cheap per recipe.
    select z.id, z.name, z.created_at, z.n_ing,
           private.craft_max_matching(array_agg(f.mask order by f.position, f.id), v_rows) as m
    from sized z
    join fits f on f.recipe_id = z.id
    group by z.id, z.name, z.created_at, z.n_ing
  )
  select coalesce(
    (select jsonb_build_object('result', 'match', 'recipe_id', sc.id, 'name', sc.name)
       from scored sc
      where sc.n_ing = v_rows and sc.m = v_rows
      order by sc.created_at, sc.id
      limit 1),
    case
      when not v_hide_hints and exists (select 1 from scored sc where sc.n_ing = v_rows + 1 and sc.m = v_rows)
        then jsonb_build_object('result', 'near', 'hint', 'missing')
      when not v_hide_hints and exists (select 1 from scored sc where sc.n_ing = v_rows - 1 and sc.m = sc.n_ing)
        then jsonb_build_object('result', 'near', 'hint', 'extra')
      else jsonb_build_object('result', 'none')
    end
  ) into v_result;

  if v_result ->> 'result' = 'match' then
    -- The reveal: the character joins the recipe's audience, so RLS lets the player read it
    -- from now on. The row's ring triggers tell every open client.
    -- Guarded so two simultaneous matches append the character once, and pinned to the campaign.
    update crafting_recipes
       set player_visible_to = array_append(player_visible_to, p_party_member_id)
     where id = (v_result ->> 'recipe_id')::uuid
       and campaign_id = v_campaign
       and not (p_party_member_id = any(player_visible_to));
  end if;

  return v_result;
end;
$$;

comment on function public.craft_experiment(uuid, text, uuid[]) is
  'The experiment bench (#1103): reveals a discoverable recipe to the caller''s character when the laid-out rows are exactly its ingredients. Answers {result: match, recipe_id, name} | {result: near, hint: missing|extra} | {result: none}. Refuses a caller who does not play the character, or a row they do not hold.';

revoke execute on function public.craft_experiment(uuid, text, uuid[]) from public, anon;
grant execute on function public.craft_experiment(uuid, text, uuid[]) to authenticated, service_role;
