-- Widen SELECT policies on DM-owned character-option tables so players in the
-- DM's campaigns can read them during character creation and in the player
-- Reliquary / Codex tabs.
--
-- Today `species`, `backgrounds`, `custom_classes`, `custom_subclasses`, and
-- `class_features` all have `auth.uid() = user_id` SELECT policies, meaning
-- only the creator (the DM) can see them. Players sign in as separate auth
-- users, so the CharacterCreateWizard's pickers and the Codex tabs in the
-- player Reliquary render "No species in the campaign yet" even when the
-- DM has authored plenty. `system_classes` is already open to all
-- authenticated users, which is why the SRD class list worked but custom
-- classes / subclasses / species / backgrounds / abilities did not.
--
-- INSERT / UPDATE / DELETE remain restricted to the owner — only read access
-- is widened, and only to users who share a campaign with the DM.

-- ── Helper: is `owner_id` the DM of any campaign the current user is in? ─────
create or replace function public.is_dm_of_my_campaigns(owner_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1
    from public.campaign_members my
    join public.campaign_members dm
      on dm.campaign_id = my.campaign_id
     and dm.role = 'dm'
    where my.user_id = auth.uid()
      and dm.user_id = owner_id
  );
$$;

-- ── species ─────────────────────────────────────────────────────────────────
drop policy if exists "species_select" on species;
create policy "species_select" on species for select
  using (auth.uid() = user_id or public.is_dm_of_my_campaigns(user_id));

-- ── backgrounds ─────────────────────────────────────────────────────────────
drop policy if exists "backgrounds_select" on backgrounds;
create policy "backgrounds_select" on backgrounds for select
  using (auth.uid() = user_id or public.is_dm_of_my_campaigns(user_id));

-- ── custom_classes ──────────────────────────────────────────────────────────
drop policy if exists "custom_classes_select" on custom_classes;
create policy "custom_classes_select" on custom_classes for select
  using (auth.uid() = user_id or public.is_dm_of_my_campaigns(user_id));

-- ── custom_subclasses ───────────────────────────────────────────────────────
drop policy if exists "custom_subclasses_select" on custom_subclasses;
create policy "custom_subclasses_select" on custom_subclasses for select
  using (auth.uid() = user_id or public.is_dm_of_my_campaigns(user_id));

-- ── class_features ──────────────────────────────────────────────────────────
-- Was: owner OR user_id IS NULL (system-seeded rows). Widen to also include
-- shared-campaign DMs so players see the DM's custom abilities.
drop policy if exists "class_features_select" on class_features;
create policy "class_features_select" on class_features for select
  using (
    auth.uid() = user_id
    or user_id is null
    or public.is_dm_of_my_campaigns(user_id)
  );
