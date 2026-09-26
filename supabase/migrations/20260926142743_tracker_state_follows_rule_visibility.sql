-- Tracker values follow their rule's visibility.
--
-- A custom rule can be DM-only (`rules.is_player_visible = false`), and the
-- rules table enforces that for players (`rules_player_select`). The
-- per-character values of that rule's tracker did not: any campaign member
-- could select every row of `party_member_tracker_state`, and a player could
-- insert or update their own character's row, for DM-only rules too. The app
-- hid those trackers from players' screens, so nothing showed, but the data
-- layer did not agree with the screen. It matters for a rule like the demo
-- campaign's Lucidity, a number the DM keeps and the table must never see.
--
-- Players (a campaign member who is not the DM) now reach a row only when it
-- belongs to a built-in optional rule (`rule_id is null`, keyed by
-- `rule_key`) or to a custom rule players may see. The DM keeps full access.
-- `private.is_campaign_dm` is used affirmatively (OR), where a NULL denies,
-- so it needs no coalesce here.

alter policy "party_member_tracker_state_select" on public.party_member_tracker_state
  using (
    private.is_campaign_dm(campaign_id)
    or exists (
      select 1 from public.campaigns
      where campaigns.id = party_member_tracker_state.campaign_id
        and campaigns.user_id = (select auth.uid())
    )
    or (
      exists (
        select 1 from public.campaign_members
        where campaign_members.campaign_id = party_member_tracker_state.campaign_id
          and campaign_members.user_id = (select auth.uid())
      )
      and (
        party_member_tracker_state.rule_id is null
        or exists (
          select 1 from public.rules
          where rules.id = party_member_tracker_state.rule_id
            and rules.is_player_visible
        )
      )
    )
  );

alter policy "party_member_tracker_state_insert" on public.party_member_tracker_state
  with check (
    private.is_campaign_dm(campaign_id)
    or (
      exists (
        select 1 from public.campaign_members
        where campaign_members.campaign_id = party_member_tracker_state.campaign_id
          and campaign_members.user_id = (select auth.uid())
          and campaign_members.party_member_id = party_member_tracker_state.party_member_id
      )
      and (
        party_member_tracker_state.rule_id is null
        or exists (
          select 1 from public.rules
          where rules.id = party_member_tracker_state.rule_id
            and rules.is_player_visible
        )
      )
    )
  );

alter policy "party_member_tracker_state_update" on public.party_member_tracker_state
  using (
    private.is_campaign_dm(campaign_id)
    or (
      exists (
        select 1 from public.campaign_members
        where campaign_members.campaign_id = party_member_tracker_state.campaign_id
          and campaign_members.user_id = (select auth.uid())
          and campaign_members.party_member_id = party_member_tracker_state.party_member_id
      )
      and (
        party_member_tracker_state.rule_id is null
        or exists (
          select 1 from public.rules
          where rules.id = party_member_tracker_state.rule_id
            and rules.is_player_visible
        )
      )
    )
  )
  with check (
    private.is_campaign_dm(campaign_id)
    or (
      exists (
        select 1 from public.campaign_members
        where campaign_members.campaign_id = party_member_tracker_state.campaign_id
          and campaign_members.user_id = (select auth.uid())
          and campaign_members.party_member_id = party_member_tracker_state.party_member_id
      )
      and (
        party_member_tracker_state.rule_id is null
        or exists (
          select 1 from public.rules
          where rules.id = party_member_tracker_state.rule_id
            and rules.is_player_visible
        )
      )
    )
  );
