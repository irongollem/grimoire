-- Any signed-in user could rewrite the official class features.
--
-- class_features holds two kinds of row in one table: a user's own (user_id =
-- them) and the official ones every character sheet reads (user_id is null,
-- 190 rows: Sneak Attack, Martial Arts, Divine Smite and the rest). The update
-- policy had an arm for the second kind that asked only that the caller be
-- signed in:
--
--   using (auth.uid() = user_id or (user_id is null and auth.uid() is not null))
--
-- So any account could change the name or text of an official feature for
-- every table in the app, and, because WITH CHECK had the same arm, could set
-- user_id to null on one of its own rows and turn homebrew into an "official"
-- feature. 20260828201935 added the campaign gate to this policy and kept the
-- arm, on the reasoning that it "covers seeded rows that belong to no one".
-- Rows that belong to no one are exactly the ones nobody but an admin should
-- be writing.
--
-- Found on 2 Oct 2026 by the security audit of #943, whose approval gate
-- treats `user_id is null` as "official, nothing to approve". Nothing in the
-- client relies on the arm: the class feature sync (classFeatureSync.ts) reads
-- and writes only `.eq("user_id", user.id)`. The newest change to any official
-- row in production was a migration on 25 Jul 2026, so there is no sign it was
-- used.

drop policy class_features_update on public.class_features;

create policy class_features_update on public.class_features
  for update to public
  using (
    (select auth.uid()) = user_id
    or (user_id is null and private.is_app_admin())
  )
  with check (
    (
      (select auth.uid()) = user_id
      or (user_id is null and private.is_app_admin())
    )
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );
