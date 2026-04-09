-- Security fix: restrict campaign_invites SELECT to DMs only.
-- Previously, "campaign_invites_read_by_token" allowed any authenticated user
-- to read all invite rows for any campaign. Invite tokens should only be visible
-- to the DM who manages them. The join flow is unaffected because
-- join_campaign_via_invite() is SECURITY DEFINER and bypasses RLS.

drop policy if exists "campaign_invites_read_by_token" on public.campaign_invites;

-- The existing "campaign_invites_dm_all" policy (FOR ALL) already covers SELECT
-- for DMs via is_campaign_dm(campaign_id). No new policy is needed — dropping the
-- overly-broad read policy is sufficient to restrict access to DMs only.
