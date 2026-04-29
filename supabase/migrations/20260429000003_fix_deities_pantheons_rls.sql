-- Migration: fix_deities_pantheons_rls
-- Replaces the basic user_id select policies with DM + player-visible patterns matching factions

-- ── Deities ───────────────────────────────────────────────────────────────────

drop policy "deities_select" on deities;
drop policy "deities_insert" on deities;
drop policy "deities_update" on deities;
drop policy "deities_delete" on deities;

-- DM can do everything in their campaign
create policy "deities_select"  on deities for select using (public.is_campaign_dm(campaign_id));
create policy "deities_insert"  on deities for insert with check (public.is_campaign_dm(campaign_id));
create policy "deities_update"  on deities for update using (public.is_campaign_dm(campaign_id));
create policy "deities_delete"  on deities for delete using (public.is_campaign_dm(campaign_id));

-- Players can see deities the DM has revealed to them
create policy "deities_player_select" on deities for select using (
  public.is_campaign_member(campaign_id)
  and player_visible_to is not null
  and exists (
    select 1 from public.campaign_members cm
    where cm.user_id = auth.uid()
      and cm.role = 'player'
      and cm.party_member_id = any(deities.player_visible_to)
  )
);

-- ── Pantheons ─────────────────────────────────────────────────────────────────

drop policy "pantheons_select" on pantheons;
drop policy "pantheons_insert" on pantheons;
drop policy "pantheons_update" on pantheons;
drop policy "pantheons_delete" on pantheons;

-- DM can do everything in their campaign
create policy "pantheons_select"  on pantheons for select using (public.is_campaign_dm(campaign_id));
create policy "pantheons_insert"  on pantheons for insert with check (public.is_campaign_dm(campaign_id));
create policy "pantheons_update"  on pantheons for update using (public.is_campaign_dm(campaign_id));
create policy "pantheons_delete"  on pantheons for delete using (public.is_campaign_dm(campaign_id));

-- Players can see pantheons the DM has revealed to them
create policy "pantheons_player_select" on pantheons for select using (
  public.is_campaign_member(campaign_id)
  and player_visible_to is not null
  and exists (
    select 1 from public.campaign_members cm
    where cm.user_id = auth.uid()
      and cm.role = 'player'
      and cm.party_member_id = any(pantheons.player_visible_to)
  )
);
