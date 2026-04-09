-- Security fix: app_invites rows were publicly readable (using true), exposing
-- all invite labels and tokens to any authenticated user. Restrict SELECT to
-- the app admin only. The signup flow previously queried the table directly to
-- validate a token — replace that with a SECURITY DEFINER function so the
-- client never needs raw table access.

-- Drop the overly-broad public read policy
drop policy if exists "app_invites_public_read" on public.app_invites;

-- Admin-only read (for the admin UI)
create policy "app_invites_admin_read" on public.app_invites
  for select using (is_app_admin());

-- SECURITY DEFINER function: lets the signup page check if a token is valid
-- without exposing the full table to the caller.
create or replace function public.validate_app_invite(p_token uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.app_invites
    where token = p_token
      and (expires_at is null or expires_at > now())
      and (max_uses is null or use_count < max_uses)
  );
$$;
