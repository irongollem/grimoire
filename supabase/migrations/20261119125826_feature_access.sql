-- A feature that is released to chosen accounts only (#1021).
--
-- The maintainer, 19 Nov 2026: "lets release the table with a flag, so only users that are flagged can see it? i
-- dont want to release it to the public fully yet". So the AI table and what hangs off it (its voices, a sitting told
-- as a story, Prep campaign, notes read aloud, characters played for absent players) is open in a campaign only when
-- the campaign's OWNER has been given it. A row here is that grant. No row, no feature: the page hides it and every
-- function refuses it (`_shared/featureAccess.ts`).
--
-- One row per account and feature. Only an app admin grants or takes away. An account reads its own grants, and so
-- does everyone in a campaign it owns: a player has to know whether their Dungeon Master's table is open to be
-- shown the switch that lets the AI speak for their character.

create table public.feature_access (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('ai_table')),
  -- Who granted it; kept when that admin's account goes.
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

create index feature_access_granted_by_idx on public.feature_access (granted_by) where granted_by is not null;

create trigger feature_access_updated_at
  before update on public.feature_access
  for each row execute procedure update_updated_at();

alter table public.feature_access enable row level security;

-- One policy per command. Reading: your own, an admin's view of all, and the grants of the owner of a campaign you
-- are a member of. Writing: an app admin only (the helper is total: false for anyone without the claim).
create policy "feature_access_select" on public.feature_access
  for select using (
    (select auth.uid()) = user_id
    or private.is_app_admin()
    or exists (
      select 1 from public.campaigns c
       where c.user_id = feature_access.user_id
         and private.is_campaign_member(c.id)
    )
  );
create policy "feature_access_insert" on public.feature_access
  for insert with check (private.is_app_admin());
create policy "feature_access_update" on public.feature_access
  for update using (private.is_app_admin()) with check (private.is_app_admin());
create policy "feature_access_delete" on public.feature_access
  for delete using (private.is_app_admin());

grant select, insert, update, delete on public.feature_access to authenticated, service_role;
