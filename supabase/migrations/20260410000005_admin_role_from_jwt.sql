-- ── Switch is_app_admin() from email check to JWT app_metadata role ───────────
-- Replaces the email-hardcoded check with a JWT claim so any user with
-- app_metadata.role = 'admin' is treated as admin.

create or replace function public.is_app_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

-- ── Update hall_of_heroes write policies to use is_app_admin() ────────────────
-- Drop the email-hardcoded policies and replace with the shared helper.

drop policy if exists "hall_of_heroes_insert" on hall_of_heroes;
drop policy if exists "hall_of_heroes_update" on hall_of_heroes;
drop policy if exists "hall_of_heroes_delete" on hall_of_heroes;

create policy "hall_of_heroes_insert" on hall_of_heroes
  for insert with check (is_app_admin());

create policy "hall_of_heroes_update" on hall_of_heroes
  for update using (is_app_admin());

create policy "hall_of_heroes_delete" on hall_of_heroes
  for delete using (is_app_admin());
