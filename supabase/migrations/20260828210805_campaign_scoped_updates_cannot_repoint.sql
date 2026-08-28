-- A member-scoped row could be moved into a campaign the author does not belong to.
--
-- THE BUG, AND WHY THE INSERT GATE DID NOT CATCH IT
--
-- `player_journal_entries` and `session_availability` both gate INSERT correctly:
--
--     with check ((select auth.uid()) = user_id and private.is_campaign_member(campaign_id))
--
-- but their UPDATE `with check` was only `(select auth.uid()) = user_id`. Membership
-- was verified when the row was created and never again — so `campaign_id` was
-- writable afterwards, to any value.
--
-- Both are then read back by campaign:
--
--     player_journal_entries_select_shared  using (not is_private and private.is_campaign_member(campaign_id))
--     session_availability_select           using (private.is_campaign_member(campaign_id))
--
-- and `is_campaign_member` there is evaluated for the *viewer*. So the row lands in
-- the destination campaign's shared view even though its author is a stranger to it.
--
-- Demonstrated on a local replica before the fix, as a user who is a member of only
-- their own campaign: insert a non-private journal entry into their own campaign
-- (allowed), `update ... set campaign_id = <victim campaign>` (allowed — the bug),
-- and the victim DM then reads that row in their own campaign. Any account can do
-- this to any campaign whose uuid it knows; no membership, invite or share needed.
--
-- This is the UPDATE-repoint form of the injection that 20260828201935 closed for
-- INSERT. It was missed there because that sweep targeted tables whose `user_id`
-- means "the DM who authored this", and these two are per-user tables that were
-- deliberately excluded from it. The exclusion was right; what was wrong is that a
-- per-user row still carries a campaign_id that decides who else can see it.
--
-- THE FIX
--
-- Make each UPDATE `with check` re-assert what its own INSERT already requires, so
-- the post-image has to satisfy the same membership test as the original row. An
-- author may still edit their entry, and may still move it between campaigns they
-- actually belong to; they cannot push it into one they do not.
--
-- Not addressed here, deliberately: `entity_notes` has the same bare UPDATE check
-- but a differently shaped read path — `entity_notes_campaign_shared` admits on a
-- join between the *author's* membership and the viewer's, never on
-- `entity_notes.campaign_id` — so repointing that column does not change who can
-- read the row. Nothing to close.
--
-- `quest_objectives`, `quest_refs` and `user_tile_packs` were checked and are sound:
-- the first two derive both clauses from the parent quest's `user_id`, so a repoint
-- must land on a quest the caller already owns, and `user_tile_packs` has no
-- campaign_id at all (its campaign link lives in `campaign_tile_packs`, gated on
-- private.is_campaign_dm).

drop policy player_journal_entries_update on public.player_journal_entries;
create policy player_journal_entries_update on public.player_journal_entries
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
  );

drop policy session_availability_update on public.session_availability;
create policy session_availability_update on public.session_availability
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
  );
