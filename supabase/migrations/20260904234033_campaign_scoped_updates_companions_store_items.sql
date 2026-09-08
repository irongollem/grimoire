-- Migration: campaign_scoped_updates_companions_store_items
-- Two UPDATE policies let a row be repointed into a campaign the writer has
-- nothing to do with. Same bug as 20260828210805, two tables that sweep missed.
--
-- 20260828210805 closed this for player_journal_entries and session_availability
-- and listed the tables it had checked and cleared. Neither of these was on
-- either list, and the reason is instructive: that sweep looked for a *bare*
-- `with check ((select auth.uid()) = user_id)`. `companions_update` has no
-- `with check` at all — and a policy with none uses its `USING` clause as the
-- check — so it never matched the pattern while being the more exposed of the
-- two. When auditing for this class, a missing clause is not the absence of the
-- bug; it is the bug wearing a different shape.
--
-- Found by the security-definer audit of the campaign_sync doorbell
-- (20260904230420), which reads campaign_id off these tables in a SECURITY
-- DEFINER trigger and so inherits whatever the invoker's own RLS failed to
-- constrain. Both paths were reproduced end to end against a local stack before
-- this was written; both predate the doorbell.

-- ── companions ───────────────────────────────────────────────────────────────
-- What was possible: insert a companion with `campaign_id: null` (allowed
-- outright), then PATCH it to a stranger's campaign_id. The row is then *live in
-- that campaign* — companions_select is is_campaign_member(campaign_id) for the
-- viewer, so the victim DM sees a companion they did not create in their own
-- roster. That is content injection into someone else's game, and it needs only
-- the campaign uuid, which every current and former player of that campaign has.
--
-- The three USING disjuncts are unchanged: the owner, the campaign's DM, and the
-- player whose party member owns the companion may all legitimately update one,
-- and the DM and party-member cases write rows they do not own by design. The
-- new part is the second conjunct of the check — whatever campaign the row ends
-- up in, the writer must belong to it. The DM and party-member branches already
-- imply membership, so this only ever bites the repoint.

drop policy if exists companions_update on companions;
create policy companions_update on companions
  for update
  using (
    ((select auth.uid()) = user_id)
    or ((campaign_id is not null) and private.is_campaign_dm(campaign_id))
    or ((campaign_id is not null)
        and (owner_party_member_id is not null)
        and (owner_party_member_id = private.my_party_member_id(campaign_id)))
  )
  with check (
    (
      ((select auth.uid()) = user_id)
      or ((campaign_id is not null) and private.is_campaign_dm(campaign_id))
      or ((campaign_id is not null)
          and (owner_party_member_id is not null)
          and (owner_party_member_id = private.my_party_member_id(campaign_id)))
    )
    and ((campaign_id is null) or private.is_campaign_member(campaign_id))
  );

-- ── store_items ──────────────────────────────────────────────────────────────
-- 20260612000003 hardened the INSERT policy to require that the target location
-- belong to the caller, for exactly this reason — its own header notes that "a
-- campaign member can read every location UUID in the campaign", and a removed
-- player keeps them. UPDATE was left checking only row ownership, so the same
-- row reaches the same forbidden location through the other verb.
--
-- Two consequences, both reproduced: the write rings the victim campaign's
-- doorbell on demand, and the squatting row occupies
-- (location_id, item_id) — so the victim DM stocking that item in their own shop
-- gets a duplicate-key error they cannot diagnose, because their own read of
-- store_items is filtered to user_id = auth.uid() and the row is invisible to
-- them. That is the denial of service 20260612000003 fixed, through the verb it
-- did not cover.

drop policy if exists store_items_update on store_items;
create policy store_items_update on store_items
  for update
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and exists (
      select 1 from locations l
       where l.id = location_id
         and l.user_id = (select auth.uid())
    )
  );
