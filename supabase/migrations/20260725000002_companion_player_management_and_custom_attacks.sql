-- Migration: companion_player_management_and_custom_attacks
-- #568 custom attacks (party_members.custom_attacks) + #569 player companion
-- management: combat_ready flag, and RLS letting the owning player and the
-- campaign DM write companions (not just the creator).

-- ─────────────────────────────────────────────────────────────────────────────
-- #568 — player-defined custom attacks (companion attacks, etc.)
-- Array of { id, name, attack_bonus, damage, damage_type } objects.
-- ─────────────────────────────────────────────────────────────────────────────
alter table party_members
  add column if not exists custom_attacks jsonb not null default '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- #569 — "available for combat" switch. false = companion is elsewhere
-- (another room, stabled mount, dismissed familiar) and skips new encounters.
-- Toggleable by both the DM and the owning player.
-- ─────────────────────────────────────────────────────────────────────────────
alter table companions
  add column if not exists combat_ready boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Companions RLS rework. Previously insert/update/delete were creator-only
-- (auth.uid() = user_id), which worked because only the DM ever created
-- companions. Players now manage their own companions, so:
--   insert — still self-owned rows only, but must be a member of the campaign
--            the companion is filed under (closes the "insert into any
--            campaign_id" hole).
--   update/delete — creator, campaign DM, or the player whose character is
--            the companion's owner. DM override is what lets End Combat sync
--            companion HP back, and lets the DM manage player companions.
-- Helpers live in the non-exposed `private` schema (see 20260629000002).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "companions_insert" on companions;
create policy "companions_insert" on companions for insert
  with check (
    auth.uid() = user_id
    and (campaign_id is null or private.is_campaign_member(campaign_id))
  );

drop policy if exists "companions_update" on companions;
create policy "companions_update" on companions for update
  using (
    auth.uid() = user_id
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (
      campaign_id is not null
      and owner_party_member_id is not null
      and owner_party_member_id = private.my_party_member_id(campaign_id)
    )
  );

drop policy if exists "companions_delete" on companions;
create policy "companions_delete" on companions for delete
  using (
    auth.uid() = user_id
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (
      campaign_id is not null
      and owner_party_member_id is not null
      and owner_party_member_id = private.my_party_member_id(campaign_id)
    )
  );
