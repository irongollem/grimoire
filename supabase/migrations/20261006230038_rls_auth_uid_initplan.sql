-- #999 story 3.1: evaluate auth.uid() once per statement, not once per row.
--
-- A bare `auth.uid()` in a policy is re-evaluated for every row the policy
-- inspects; `(select auth.uid())` is planned as an InitPlan and evaluated once
-- (Supabase advisor lint `auth_rls_initplan`). The value cannot change within a
-- statement, so the two forms are equivalent in meaning: every policy below
-- keeps its exact expression, with only that call wrapped. That includes the
-- calls inside EXISTS subqueries (quest_consequences, tile_pack_generation_jobs,
-- user_tile_packs, campaign_tile_packs), which the advisor does not count but
-- which run per outer row just the same.
--
-- Generated from pg_policies, not from the migration files: the 36 definitions
-- were hashed on production and on a fresh replay and matched (7 Oct 2026)
-- before this was written. Roles, commands and permissiveness are untouched;
-- ALTER POLICY changes only the expressions given.

alter policy ai_acknowledgements_delete on public.ai_acknowledgements
  using (((select auth.uid()) = user_id));
alter policy ai_acknowledgements_insert on public.ai_acknowledgements
  with check (((select auth.uid()) = user_id));
alter policy ai_acknowledgements_select on public.ai_acknowledgements
  using (((select auth.uid()) = user_id));
alter policy ai_acknowledgements_update on public.ai_acknowledgements
  using (((select auth.uid()) = user_id));
alter policy announcement_dismissals_delete on public.announcement_dismissals
  using (((select auth.uid()) = user_id));
alter policy announcement_dismissals_insert on public.announcement_dismissals
  with check (((select auth.uid()) = user_id));
alter policy announcement_dismissals_select on public.announcement_dismissals
  using (((select auth.uid()) = user_id));
alter policy bug_reports_select on public.bug_reports
  using ((((select auth.uid()) = user_id) OR private.is_app_admin()));
alter policy campaign_tile_packs_delete on public.campaign_tile_packs
  using ((((select auth.uid()) = user_id) AND private.is_campaign_dm(campaign_id)));
alter policy campaign_tile_packs_insert on public.campaign_tile_packs
  with check ((((select auth.uid()) = user_id) AND private.is_campaign_dm(campaign_id) AND private.can_manage_custom_tile_packs() AND (EXISTS ( SELECT 1
   FROM user_tile_packs p
  WHERE ((p.id = campaign_tile_packs.tile_pack_id) AND (p.user_id = (select auth.uid())))))));
-- campaign_tile_packs_select is deliberately NOT wrapped. It and
-- user_tile_packs_select reference each other (an insert into campaign_tile_packs
-- checks user_tile_packs, whose read policy checks campaign_tile_packs), and
-- Postgres only runs its policy-recursion check on a policy that contains a
-- sublink. `(select auth.uid())` is a sublink, so wrapping this one turned that
-- harmless re-entry into "infinite recursion detected in policy for relation
-- campaign_tile_packs" (cartographer_tile_packs.test.sql caught it). Both tables
-- are tiny; the per-row call costs nothing measurable here.
alter policy campaign_tile_packs_update on public.campaign_tile_packs
  using ((((select auth.uid()) = user_id) AND private.is_campaign_dm(campaign_id)))
  with check ((((select auth.uid()) = user_id) AND private.is_campaign_dm(campaign_id) AND private.can_manage_custom_tile_packs()));
alter policy dashboard_layouts_delete on public.dashboard_layouts
  using (((select auth.uid()) = user_id));
alter policy dashboard_layouts_insert on public.dashboard_layouts
  with check (((select auth.uid()) = user_id));
alter policy dashboard_layouts_select on public.dashboard_layouts
  using (((select auth.uid()) = user_id));
alter policy dashboard_layouts_update on public.dashboard_layouts
  using (((select auth.uid()) = user_id));
alter policy document_imports_delete on public.document_imports
  using (((select auth.uid()) = user_id));
alter policy document_imports_insert on public.document_imports
  with check ((((select auth.uid()) = user_id) AND private.is_campaign_dm(campaign_id) AND (private.paths_under_caller_prefix(source_paths) OR ((source_kind = 'text'::text) AND (cardinality(source_paths) = 0)))));
alter policy document_imports_select on public.document_imports
  using (((select auth.uid()) = user_id));
alter policy document_imports_update on public.document_imports
  using (((select auth.uid()) = user_id))
  with check ((((select auth.uid()) = user_id) AND private.is_campaign_dm(campaign_id) AND (private.paths_under_caller_prefix(source_paths) OR ((source_kind = 'text'::text) AND (cardinality(source_paths) = 0)))));
alter policy memorial_mourners_insert on public.memorial_mourners
  with check (((user_id = (select auth.uid())) AND private.can_see_memorial(memorial_id)));
alter policy memorial_mourners_update on public.memorial_mourners
  using ((user_id = (select auth.uid())))
  with check (((user_id = (select auth.uid())) AND private.can_see_memorial(memorial_id)));
alter policy notification_preferences_delete on public.notification_preferences
  using (((select auth.uid()) = user_id));
alter policy notification_preferences_insert on public.notification_preferences
  with check (((select auth.uid()) = user_id));
alter policy notification_preferences_select on public.notification_preferences
  using (((select auth.uid()) = user_id));
alter policy notification_preferences_update on public.notification_preferences
  using (((select auth.uid()) = user_id));
alter policy quest_consequences_delete on public.quest_consequences
  using ((EXISTS ( SELECT 1
   FROM quests q
  WHERE ((q.id = quest_consequences.quest_id) AND (q.user_id = (select auth.uid()))))));
alter policy quest_consequences_insert on public.quest_consequences
  with check ((EXISTS ( SELECT 1
   FROM quests q
  WHERE ((q.id = quest_consequences.quest_id) AND (q.user_id = (select auth.uid()))))));
alter policy quest_consequences_select on public.quest_consequences
  using ((EXISTS ( SELECT 1
   FROM quests q
  WHERE ((q.id = quest_consequences.quest_id) AND (q.user_id = (select auth.uid()))))));
alter policy quest_consequences_update on public.quest_consequences
  using ((EXISTS ( SELECT 1
   FROM quests q
  WHERE ((q.id = quest_consequences.quest_id) AND (q.user_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM quests q
  WHERE ((q.id = quest_consequences.quest_id) AND (q.user_id = (select auth.uid()))))));
alter policy tile_pack_generation_jobs_select on public.tile_pack_generation_jobs
  using ((EXISTS ( SELECT 1
   FROM tile_pack_generation_runs r
  WHERE ((r.id = tile_pack_generation_jobs.run_id) AND ((r.user_id = (select auth.uid())) OR ((r.library_tile_pack_id IS NOT NULL) AND private.is_app_admin()))))));
alter policy tile_pack_generation_runs_select on public.tile_pack_generation_runs
  using ((((select auth.uid()) = user_id) OR ((library_tile_pack_id IS NOT NULL) AND private.is_app_admin())));
alter policy user_tile_packs_delete on public.user_tile_packs
  using (((select auth.uid()) = user_id));
alter policy user_tile_packs_insert on public.user_tile_packs
  with check ((((select auth.uid()) = user_id) AND private.can_manage_custom_tile_packs()));
alter policy user_tile_packs_select on public.user_tile_packs
  using ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM campaign_tile_packs ctp
  WHERE ((ctp.tile_pack_id = user_tile_packs.id) AND private.is_campaign_member(ctp.campaign_id))))));
alter policy user_tile_packs_update on public.user_tile_packs
  using ((((select auth.uid()) = user_id) AND private.can_manage_custom_tile_packs()))
  with check ((((select auth.uid()) = user_id) AND private.can_manage_custom_tile_packs()));
