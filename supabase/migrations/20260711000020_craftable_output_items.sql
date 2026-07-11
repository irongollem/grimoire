-- Migration: craftable_output_items
-- A crafting recipe's output points at a vault item the DM owns. A player who's
-- been shared the recipe can read the recipe + its output rows (item_id) but NOT
-- the item itself under RLS — so the recipe card showed "→ Unknown item" and the
-- first successful craft inserted a party_inventory row with an empty name. The
-- output item's NAME is not secret (the shared recipe is meant to advertise what
-- it makes), so expose just id+name for outputs of recipes the caller can access.
-- (#521)

create or replace function public.get_craftable_output_items(p_campaign_id uuid)
  returns table (id uuid, name text)
  language sql
  security definer
  set search_path to 'public'
as $$
  select distinct i.id, i.name
  from crafting_recipe_outputs o
  join crafting_recipes r on r.id = o.recipe_id
  join items i on i.id = o.item_id
  where r.campaign_id = p_campaign_id
    and (
      -- the recipe owner (DM) — already sees items, but keep the branch so the
      -- function is correct for any caller
      r.user_id = (select auth.uid())
      -- a player the recipe was explicitly shared with
      or (
        private.is_campaign_member(r.campaign_id)
        and exists (
          select 1 from campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = r.campaign_id
            and cm.party_member_id = any(r.player_visible_to)
        )
      )
    );
$$;

-- Supabase grants anon a direct EXECUTE on new public functions by default, so a
-- plain `revoke ... from public` isn't enough to keep it off the anon RPC surface.
revoke execute on function public.get_craftable_output_items(uuid) from public, anon;
grant execute on function public.get_craftable_output_items(uuid) to authenticated, service_role;
