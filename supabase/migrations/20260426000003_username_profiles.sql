-- Migration: username_profiles
-- Create profiles table to enforce unique, non-nullable usernames; backfill from auth.users.

create table public.profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure update_updated_at();

alter table public.profiles enable row level security;

-- Any authenticated user can read (needed for uniqueness checks during profile edits)
create policy "profiles_select" on profiles for select using (auth.uid() is not null);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update" on profiles for update using (auth.uid() = user_id);
create policy "profiles_delete" on profiles for delete using (auth.uid() = user_id);

-- Backfill from existing auth.users:
-- prefer display_name from metadata, fall back to email prefix.
-- handle collisions by appending _2, _3, etc. ordered by created_at.
with base as (
  select
    id,
    coalesce(
      nullif(trim(raw_user_meta_data->>'display_name'), ''),
      split_part(email, '@', 1)
    ) as base_name,
    row_number() over (
      partition by coalesce(
        nullif(trim(raw_user_meta_data->>'display_name'), ''),
        split_part(email, '@', 1)
      )
      order by created_at
    ) as rn
  from auth.users
),
named as (
  select
    id,
    case when rn = 1 then base_name else base_name || '_' || rn end as username
  from base
)
insert into public.profiles (user_id, username)
select id, username from named
on conflict (user_id) do nothing;

-- Trigger: auto-create profile on new user signup.
-- Prefers display_name from auth metadata, falls back to email prefix.
-- Appends _2, _3, … to resolve uniqueness conflicts.
create function public.create_user_profile()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 1;
begin
  v_base := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_candidate := v_base;

  while exists (select 1 from public.profiles where username = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '_' || v_suffix;
  end loop;

  insert into public.profiles (user_id, username)
  values (new.id, v_candidate)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_user_profile();

-- Update join_campaign_via_invite to prefer profiles.username over raw metadata / email
create or replace function public.join_campaign_via_invite(p_token uuid)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_invite public.campaign_invites%rowtype;
begin
  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  if v_invite.role = 'player' and exists (
    select 1 from public.campaigns
    where id = v_invite.campaign_id and user_id = auth.uid()
  ) then
    raise exception 'Campaign owner cannot join as player';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    v_invite.campaign_id,
    auth.uid(),
    v_invite.role,
    coalesce(
      (select username from public.profiles where user_id = auth.uid()),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid())), ''),
      (select email from auth.users where id = auth.uid())
    )
  )
  on conflict (campaign_id, user_id) do nothing;

  update public.campaign_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return v_invite.campaign_id;
end;
$$;

-- Update create_dm_membership to prefer profiles.username
create or replace function public.create_dm_membership()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    new.id,
    new.user_id,
    'dm',
    coalesce(
      (select username from public.profiles where user_id = new.user_id),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = new.user_id)), ''),
      (select email from auth.users where id = new.user_id)
    )
  )
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;
