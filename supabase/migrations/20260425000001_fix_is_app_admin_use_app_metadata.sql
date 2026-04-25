-- Migration: fix_is_app_admin_use_app_metadata
-- Replace hardcoded email check with app_metadata role check so any service-role-assigned admin works

create or replace function public.is_app_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;
