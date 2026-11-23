-- The player's canon carries what a secret became (#1258 item 13). A secret revealed and then made a truth used to show
-- the player the same words twice, under "Secrets revealed" and under "What we know". The client drops the secret when
-- the truth it became is one the player can read, so the function returns `became_entry_id`, and only when the player
-- can read that entry too: an id the player cannot open would say that something hidden exists.
-- The return type changes, so the function is dropped and made again with its grants.

drop function public.get_player_canon(uuid, uuid);

create function public.get_player_canon(p_campaign_id uuid, p_preview_member_id uuid default null)
returns table (
  id uuid, part text, premise_kind text, knowledge text, title text, body text, sort_order integer, image_url text,
  ai_provenance jsonb, created_at timestamptz, updated_at timestamptz, lore_kind text, world_year integer,
  world_month integer, world_day integer, party_member_id uuid, became_entry_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with me (member) as (
    select cm.party_member_id from public.campaign_members cm
     where cm.campaign_id = p_campaign_id and cm.user_id = (select auth.uid()) and cm.party_member_id is not null
       and p_preview_member_id is null
    union
    select p_preview_member_id
     where p_preview_member_id is not null and private.is_campaign_dm(p_campaign_id)
       and exists (select 1 from public.party_members pm
                    where pm.id = p_preview_member_id and pm.campaign_id = p_campaign_id)
  )
  select e.id, e.part, e.premise_kind, e.knowledge, e.title, private.withhold_secret_blocks(e.body), e.sort_order,
         e.image_url, e.ai_provenance, e.created_at, e.updated_at, e.lore_kind, e.world_year, e.world_month, e.world_day,
         e.party_member_id,
         case when e.became_entry_id is not null
                and exists (select 1 from me where private.canon_entry_seen(e.became_entry_id, me.member))
              then e.became_entry_id end
    from public.canon_entries e
   where e.campaign_id = p_campaign_id
     and exists (select 1 from me where private.canon_entry_seen(e.id, me.member))
   order by e.part, e.sort_order, e.created_at
$$;

revoke execute on function public.get_player_canon(uuid, uuid) from public, anon;
grant execute on function public.get_player_canon(uuid, uuid) to authenticated, service_role;
