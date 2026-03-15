-- ── App-level invites (DM / "try me" signups) ────────────────────────────────
-- These are not campaign-scoped. A valid token lets someone sign up as a DM
-- and create their own campaign.
--
-- The app admin (jeffrey@crocode.nl) can generate links from the admin UI or
-- via SQL: INSERT INTO public.app_invites (label) VALUES ('For John') RETURNING token;
-- Then share: https://dungeongrimoire.com/signup?token={token}

-- ── Admin helper ──────────────────────────────────────────────────────────────

create or replace function public.is_app_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and email = 'jeffrey@crocode.nl'
  );
$$;


-- ── app_invites table ─────────────────────────────────────────────────────────

create table if not exists public.app_invites (
  id          uuid primary key default gen_random_uuid(),
  token       uuid not null unique default gen_random_uuid(),
  label       text,          -- who this is for, e.g. "For John Smith"
  expires_at  timestamptz,   -- null = never expires
  max_uses    int,           -- null = single use by default
  use_count   int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists app_invites_token_idx on public.app_invites(token);

alter table public.app_invites enable row level security;

-- Anyone (including unauthenticated) can read — needed to validate token before signup
create policy "app_invites_public_read" on public.app_invites
  for select using (true);

-- Only the app admin can create/delete invites
create policy "app_invites_admin_write" on public.app_invites
  for all using (is_app_admin())
  with check (is_app_admin());


-- ── Validate + consume function ───────────────────────────────────────────────
-- Called client-side after successful signup to atomically mark token as used.

create or replace function public.consume_app_invite(p_token uuid)
returns boolean language plpgsql security definer as $$
declare
  v_invite public.app_invites;
begin
  select * into v_invite
  from public.app_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  update public.app_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return true;
end;
$$;
