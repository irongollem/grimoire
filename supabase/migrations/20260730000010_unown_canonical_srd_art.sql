-- Migration: unown_canonical_srd_art
-- Fixes #584: canonical SRD art was owned by whichever account uploaded it,
-- and the three FKs disagreed on what should happen if that account is
-- deleted:
--   * srd_spell_art.user_id   -> auth.users  ON DELETE CASCADE   (96 rows, all canonical)
--   * srd_monster_art.user_id -> auth.users  NO ACTION           (613 rows: 612 canonical, 1 override)
--   * srd_art_defaults.contributed_by (not null) NO ACTION       (364 rows, all canonical)
-- CASCADE silently destroys canonical art shared by every user; NO ACTION
-- blocks account deletion outright. Per CLAUDE.md: "Never store canonical
-- art under a user UUID — if that account changes, every canonical URL in
-- the DB breaks."
--
-- Fix: split canonical rows out entirely so they are structurally unowned.
--
--   * srd_monster_art / srd_spell_art mixed a DM's PRIVATE override
--     (is_canonical = false, scoped to user_id) with ADMIN-authored
--     canonical rows (is_canonical = true) in the *same* table, keyed on
--     unique(user_id, srd_id). Canonical rows move to new, dedicated
--     srd_monster_art_canonical / srd_spell_art_canonical tables keyed
--     solely on srd_id (no user_id column at all). The old tables keep
--     ONLY personal overrides going forward, so their existing CASCADE
--     (spell) / now-CASCADE (monster, aligned here) FK is finally correct:
--     deleting an account only ever removes that account's own private
--     rows, never shared canonical art.
--
--   * srd_art_defaults never had a per-user override story to begin with —
--     its unique constraint is (content_type, srd_slug) with no user_id
--     component, so every row is inherently global/canonical and
--     contributed_by was pure (broken) provenance metadata. Dropped
--     outright rather than split, since there is nothing to split from.
--
-- Row-count conservation is asserted at each step below (612 + 96 + 364 =
-- 1072 canonical rows must all survive the move; the 1 private monster
-- override must survive untouched).

-- ── 1. Dedicated, unowned canonical art tables ─────────────────────────────

create table public.srd_monster_art_canonical (
  srd_id                text primary key,
  image_url             text,
  portrait_focal_point  jsonb,
  updated_at            timestamptz not null default now()
);

create table public.srd_spell_art_canonical (
  srd_id                text primary key,
  image_url             text,
  portrait_focal_point  jsonb,
  updated_at            timestamptz not null default now()
);

alter table public.srd_monster_art_canonical enable row level security;
alter table public.srd_spell_art_canonical enable row level security;

-- Read: any signed-in user (matches the *_canonical_select policies being
-- replaced — canonical art was never anon-readable). Write: admin only.
create policy "srd_monster_art_canonical_select" on public.srd_monster_art_canonical
  for select using ((select auth.uid()) is not null);
create policy "srd_monster_art_canonical_insert" on public.srd_monster_art_canonical
  for insert with check (private.is_app_admin());
create policy "srd_monster_art_canonical_update" on public.srd_monster_art_canonical
  for update using (private.is_app_admin());
create policy "srd_monster_art_canonical_delete" on public.srd_monster_art_canonical
  for delete using (private.is_app_admin());

create policy "srd_spell_art_canonical_select" on public.srd_spell_art_canonical
  for select using ((select auth.uid()) is not null);
create policy "srd_spell_art_canonical_insert" on public.srd_spell_art_canonical
  for insert with check (private.is_app_admin());
create policy "srd_spell_art_canonical_update" on public.srd_spell_art_canonical
  for update using (private.is_app_admin());
create policy "srd_spell_art_canonical_delete" on public.srd_spell_art_canonical
  for delete using (private.is_app_admin());

create trigger srd_monster_art_canonical_updated_at
  before update on public.srd_monster_art_canonical
  for each row execute procedure update_updated_at();

create trigger srd_spell_art_canonical_updated_at
  before update on public.srd_spell_art_canonical
  for each row execute procedure update_updated_at();

-- ── 2. Move canonical rows: srd_monster_art -> srd_monster_art_canonical ──
do $move_monster_art$
declare
  v_before_total     int;
  v_before_canonical int;
  v_before_own       int;
  v_after_canonical  int;
  v_after_own        int;
begin
  select count(*),
         count(*) filter (where is_canonical),
         count(*) filter (where not is_canonical)
    into v_before_total, v_before_canonical, v_before_own
    from public.srd_monster_art;

  insert into public.srd_monster_art_canonical (srd_id, image_url, portrait_focal_point, updated_at)
  select srd_id, image_url, portrait_focal_point, updated_at
  from public.srd_monster_art
  where is_canonical;

  delete from public.srd_monster_art where is_canonical;

  select count(*) into v_after_canonical from public.srd_monster_art_canonical;
  select count(*) into v_after_own from public.srd_monster_art;

  if v_after_canonical <> v_before_canonical then
    raise exception 'srd_monster_art_canonical row count mismatch: expected %, got %',
      v_before_canonical, v_after_canonical;
  end if;
  if v_after_own <> v_before_own then
    raise exception 'srd_monster_art (post-split, private overrides only) row count mismatch: expected %, got %',
      v_before_own, v_after_own;
  end if;
  if v_after_canonical + v_after_own <> v_before_total then
    raise exception 'srd_monster_art total row count changed during split: expected %, got %',
      v_before_total, v_after_canonical + v_after_own;
  end if;
end;
$move_monster_art$;

-- ── 3. Move canonical rows: srd_spell_art -> srd_spell_art_canonical ──────
do $move_spell_art$
declare
  v_before_total     int;
  v_before_canonical int;
  v_before_own       int;
  v_after_canonical  int;
  v_after_own        int;
begin
  select count(*),
         count(*) filter (where is_canonical),
         count(*) filter (where not is_canonical)
    into v_before_total, v_before_canonical, v_before_own
    from public.srd_spell_art;

  insert into public.srd_spell_art_canonical (srd_id, image_url, portrait_focal_point, updated_at)
  select srd_id, image_url, portrait_focal_point, updated_at
  from public.srd_spell_art
  where is_canonical;

  delete from public.srd_spell_art where is_canonical;

  select count(*) into v_after_canonical from public.srd_spell_art_canonical;
  select count(*) into v_after_own from public.srd_spell_art;

  if v_after_canonical <> v_before_canonical then
    raise exception 'srd_spell_art_canonical row count mismatch: expected %, got %',
      v_before_canonical, v_after_canonical;
  end if;
  if v_after_own <> v_before_own then
    raise exception 'srd_spell_art (post-split, private overrides only) row count mismatch: expected %, got %',
      v_before_own, v_after_own;
  end if;
  if v_after_canonical + v_after_own <> v_before_total then
    raise exception 'srd_spell_art total row count changed during split: expected %, got %',
      v_before_total, v_after_canonical + v_after_own;
  end if;
end;
$move_spell_art$;

-- ── 4. srd_monster_art / srd_spell_art now hold ONLY private overrides ───
-- Drop is_canonical (meaningless now — every remaining row is private) and
-- simplify the write policies that used to special-case it.

alter table public.srd_monster_art drop column is_canonical;
alter table public.srd_spell_art drop column is_canonical;

-- These tables now hold strictly-private, per-user content only — align the
-- monster FK with the CASCADE the spell FK (and 60+ other private-content
-- tables) already use. It was left NO ACTION originally only because the
-- table also held canonical rows that must NOT cascade-delete; that's no
-- longer true.
alter table public.srd_monster_art
  drop constraint srd_monster_art_user_id_fkey,
  add constraint srd_monster_art_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

drop policy "srd_monster_art_canonical_select" on public.srd_monster_art;
drop policy "srd_monster_art_insert" on public.srd_monster_art;
drop policy "srd_monster_art_update" on public.srd_monster_art;

create policy "srd_monster_art_insert" on public.srd_monster_art
  for insert with check ((select auth.uid()) = user_id);

create policy "srd_monster_art_update" on public.srd_monster_art
  for update using ((select auth.uid()) = user_id);

drop policy "srd_spell_art_canonical_select" on public.srd_spell_art;
drop policy "srd_spell_art_insert" on public.srd_spell_art;
drop policy "srd_spell_art_update" on public.srd_spell_art;

create policy "srd_spell_art_insert" on public.srd_spell_art
  for insert with check ((select auth.uid()) = user_id);

create policy "srd_spell_art_update" on public.srd_spell_art
  for update using ((select auth.uid()) = user_id);

-- srd_monster_art_select / srd_spell_art_select (own rows) and the
-- *_campaign_member_select policies (a DM's private override visible to
-- their own players) are untouched — that precedence is orthogonal to the
-- canonical split and still lives entirely on these two tables.

-- ── 5. srd_art_defaults: drop contributed_by — nothing to split from ─────
-- Every row here is already global (unique(content_type, srd_slug), no
-- user_id component), so contributed_by never carried override semantics.
-- Capture the row count in a temp table so the drop is verified lossless.
create temporary table _srd_art_defaults_precheck as
select count(*) as before_count from public.srd_art_defaults;

alter table public.srd_art_defaults drop constraint srd_art_defaults_contributed_by_fkey;
alter table public.srd_art_defaults drop column contributed_by;

do $check_defaults$
declare
  v_before int;
  v_after  int;
begin
  select before_count into v_before from _srd_art_defaults_precheck;
  select count(*) into v_after from public.srd_art_defaults;
  if v_after <> v_before then
    raise exception 'srd_art_defaults row count changed while dropping contributed_by: % -> %', v_before, v_after;
  end if;
end;
$check_defaults$;

drop table _srd_art_defaults_precheck;

drop policy "srd_art_defaults_insert" on public.srd_art_defaults;
drop policy "srd_art_defaults_update" on public.srd_art_defaults;
drop policy "srd_art_defaults_delete" on public.srd_art_defaults;

create policy "srd_art_defaults_insert" on public.srd_art_defaults
  for insert with check (private.is_app_admin());
create policy "srd_art_defaults_update" on public.srd_art_defaults
  for update using (private.is_app_admin());
create policy "srd_art_defaults_delete" on public.srd_art_defaults
  for delete using (private.is_app_admin());

-- srd_art_defaults_select (any authenticated user) is untouched.

-- ── 6. Sync RPCs: read canonical art from its new, unowned home ──────────
-- The old bodies re-checked "is the row's author currently an admin" via
-- is_user_app_admin(uuid) as defense in depth, because a canonical row's
-- authorship (user_id / contributed_by) could theoretically outlive that
-- user losing admin status. That row-level authorship no longer exists —
-- RLS on the *_canonical tables (and srd_art_defaults) already guarantees
-- only an admin could ever have written the row — so the check is dropped
-- along with the column it inspected.

create or replace function public.sync_srd_monster_art_to_shared_table()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  update srd_monsters sm
  set image_url            = smac.image_url,
      portrait_focal_point = smac.portrait_focal_point,
      updated_at           = now()
  from srd_monster_art_canonical smac
  where smac.srd_id     = sm.id
    and smac.image_url is not null;

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
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  -- Legacy path: art published to srd_art_defaults (admin-write-only).
  update srd_spells ss
  set image_url         = sad.image_url,
      image_focal_point = sad.image_focal_point,
      updated_at        = now()
  from srd_art_defaults sad
  where sad.content_type = 'spell'
    and sad.srd_slug     = lower(ss.name)
    and sad.image_url   is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  -- New path: dedicated canonical table (admin-write-only via RLS).
  update srd_spells ss
  set image_url         = ssac.image_url,
      image_focal_point = ssac.portrait_focal_point,
      updated_at        = now()
  from srd_spell_art_canonical ssac
  where ssac.srd_id     = ss.id
    and ssac.image_url is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  return updated_count;
end;
$$;

-- sync_srd_item_art_to_shared_table only ever read srd_art_defaults (never
-- contributed_by, never is_canonical) — no change needed.

-- is_user_app_admin(uuid) was only ever called from the two sync RPCs above
-- to re-check a canonical row's author; both call sites are gone, so the
-- function is now dead. Drop it rather than leave an unused SECURITY
-- DEFINER function (that takes an arbitrary uuid) on the surface.
drop function if exists public.is_user_app_admin(uuid);
