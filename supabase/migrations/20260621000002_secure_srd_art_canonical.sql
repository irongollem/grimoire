-- Migration: secure_srd_art_canonical
-- Prevent non-admins from publishing global canonical SRD art.
--
-- srd_monster_art / srd_spell_art legitimately hold a DM's PRIVATE override of an
-- SRD image (is_canonical = false, scoped to their user_id). The bug was that the
-- INSERT/UPDATE policies gated only on ownership, so any user could insert a row
-- with is_canonical = true — which the *_canonical_select policies then expose to
-- EVERY user, and the admin sync RPCs bake into the globally-read srd_*.image_url.
--
-- Fix: owners may still write their own rows, but may only set is_canonical = true
-- when they are an app admin. srd_art_defaults is a global canonical table (read by
-- all, no per-user override semantics) so its writes become admin-only outright.
-- The sync RPCs additionally filter on the row author being an admin (defense in
-- depth, so a pre-existing poisoned row can never be promoted).

-- Helper: is a SPECIFIC user an app admin? (is_app_admin() only knows the caller.)
create or replace function public.is_user_app_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (raw_app_meta_data ->> 'role') = 'admin'
     from auth.users where id = p_user_id),
    false
  );
$$;

grant execute on function public.is_user_app_admin(uuid) to authenticated;

-- ── srd_monster_art: owner writes, canonical only for admins ──────────────────
drop policy if exists "srd_monster_art_insert" on public.srd_monster_art;
drop policy if exists "srd_monster_art_update" on public.srd_monster_art;

create policy "srd_monster_art_insert" on public.srd_monster_art
  for insert with check (
    (select auth.uid()) = user_id
    and (is_canonical = false or is_app_admin())
  );

create policy "srd_monster_art_update" on public.srd_monster_art
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (is_canonical = false or is_app_admin())
  );

-- ── srd_spell_art: owner writes, canonical only for admins ────────────────────
drop policy if exists "srd_spell_art_insert" on public.srd_spell_art;
drop policy if exists "srd_spell_art_update" on public.srd_spell_art;

create policy "srd_spell_art_insert" on public.srd_spell_art
  for insert with check (
    (select auth.uid()) = user_id
    and (is_canonical = false or is_app_admin())
  );

create policy "srd_spell_art_update" on public.srd_spell_art
  for update using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (is_canonical = false or is_app_admin())
  );

-- ── srd_art_defaults: global canonical defaults — admin-only writes ───────────
drop policy if exists "srd_art_defaults_insert" on public.srd_art_defaults;
drop policy if exists "srd_art_defaults_update" on public.srd_art_defaults;

create policy "srd_art_defaults_insert" on public.srd_art_defaults
  for insert with check ((select auth.uid()) = contributed_by and is_app_admin());

create policy "srd_art_defaults_update" on public.srd_art_defaults
  for update using (is_app_admin())
  with check ((select auth.uid()) = contributed_by and is_app_admin());

-- ── Sync RPCs: only promote admin-authored canonical rows ─────────────────────
create or replace function public.sync_srd_monster_art_to_shared_table()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if not is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  update srd_monsters sm
  set image_url            = sma.image_url,
      portrait_focal_point = sma.portrait_focal_point,
      updated_at           = now()
  from srd_monster_art sma
  where sma.srd_id       = sm.id
    and sma.is_canonical = true
    and sma.image_url   is not null
    and is_user_app_admin(sma.user_id);

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.sync_srd_spell_art_to_shared_table()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
  batch_count   integer;
begin
  if not is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  -- Legacy path: art published to srd_art_defaults (now admin-write-only).
  update srd_spells ss
  set image_url         = sad.image_url,
      image_focal_point = sad.image_focal_point,
      updated_at        = now()
  from srd_art_defaults sad
  where sad.content_type = 'spell'
    and sad.srd_slug     = lower(ss.name)
    and sad.image_url   is not null
    and is_user_app_admin(sad.contributed_by);

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  -- New path: canonical rows in srd_spell_art (admin-authored only).
  update srd_spells ss
  set image_url         = ssa.image_url,
      image_focal_point = ssa.portrait_focal_point,
      updated_at        = now()
  from srd_spell_art ssa
  where ssa.srd_id       = ss.id
    and ssa.is_canonical = true
    and ssa.image_url   is not null
    and is_user_app_admin(ssa.user_id);

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  return updated_count;
end;
$$;
