-- Migration: add_character_ownership_to_party_members
-- Add owner_user_id + is_dm_managed to party_members; backfill from campaign_members; update RLS

-- ── 1. New columns ────────────────────────────────────────────────────────────

alter table public.party_members
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_dm_managed boolean not null default false;

-- ── 2. Backfill: mark player-linked characters with their owner ───────────────
-- Characters already linked to a player (role='player') via campaign_members get
-- owner_user_id set. Everything else stays null (DM-created / unassigned).

update public.party_members pm
set owner_user_id = cm.user_id
from public.campaign_members cm
where cm.party_member_id = pm.id
  and cm.role = 'player';

-- ── 3. Updated RLS ────────────────────────────────────────────────────────────
-- SELECT: DM sees all in campaign; owner sees all their chars (bench + active);
--         other campaign members see only characters that are actively linked.

drop policy if exists "party_members_select" on public.party_members;

create policy "party_members_select" on public.party_members for select using (
  -- DM sees everything in their campaign (incl. bench chars and unassigned)
  (campaign_id is not null and is_campaign_dm(campaign_id))
  -- Owner sees all their own characters regardless of active status
  or auth.uid() = owner_user_id
  -- Other campaign members only see characters that are actively assigned
  or (
    campaign_id is not null
    and is_campaign_member(campaign_id)
    and exists (
      select 1 from public.campaign_members cm
      where cm.party_member_id = party_members.id
    )
  )
);

-- UPDATE: simplify player update to use owner_user_id instead of the campaign_members join.
-- DM retains update access to all chars in their campaign (for HP tracking etc.).

drop policy if exists "party_members_player_update" on public.party_members;

create policy "party_members_player_update" on public.party_members
  for update using (
    auth.uid() = owner_user_id
    or (campaign_id is not null and is_campaign_dm(campaign_id))
  );

-- INSERT: players can create new characters owned by themselves;
-- DM can create characters in their campaign (is_dm_managed ones).

create policy "party_members_player_insert" on public.party_members
  for insert with check (
    auth.uid() = owner_user_id
    or (campaign_id is not null and is_campaign_dm(campaign_id))
  );

-- DELETE: owner or DM only.

create policy "party_members_player_delete" on public.party_members
  for delete using (
    auth.uid() = owner_user_id
    or (campaign_id is not null and is_campaign_dm(campaign_id))
  );
