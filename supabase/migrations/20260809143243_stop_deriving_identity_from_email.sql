-- Migration: stop_deriving_identity_from_email
-- Takes the email address out of the identity the app shows to other users
-- (#636, #635). Companion to 20260809000002, which took it out of what the app
-- publishes to the open internet (#633, #634).
--
-- Two defects, and they are the same defect at two depths:
--
--   #636  create_user_profile() defaulted `profiles.username` to
--         split_part(email, '@', 1), and profiles_select is
--         `USING (auth.uid() IS NOT NULL)` — every signed-in user can read every
--         profile row. 6 of 16 accounts carry a username that is their email
--         local-part. Minimization: a fragment of the address escaped the
--         purpose it was collected for.
--
--   #635  create_dm_membership() and join_campaign_via_invite() ended their
--         display_name fallback chain at `auth.users.email`, and 2 of 13
--         campaign_members rows hold a full address today, rendered to the rest
--         of the party by MembersTab.
--
-- ── Why these had to ship together, in this order ──────────────────────────
--
-- #635's stated fix is "fall back to profiles.username". Both affected rows
-- belong to accounts whose username IS their email local-part, so applying that
-- fix on its own rewrites `someone@example.com` to `someone` and calls it done —
-- the domain goes, the address does not. The username had to stop being derived
-- BEFORE anything started copying it into a party-visible field. Hence one
-- migration, and hence the backfills below run in this order and not the other.

-- ── 1. A username nobody has to be careful with ────────────────────────────
--
-- Two adjective-noun lists rather than `adventurer-<hex>`: the username is not
-- purely internal. Both membership functions below copy it into
-- campaign_members.display_name, which is exactly what the rest of the party
-- sees — so this string has to be something a person is willing to be called.
-- "Gilded Owlbear" is; "adventurer-3f9ab2c1" is a receipt number.
--
-- Lives in `private` because there is no reason for a client to call it, and
-- PostgREST does not expose that schema (see CLAUDE.md → SECURITY DEFINER
-- rules). Not SECURITY DEFINER: it reads nothing and needs no privileges.
create or replace function private.generate_display_handle()
returns text
language sql
volatile
set search_path = ''
as $$
  select adjective || ' ' || noun
  from (
    select (array[
      'Gilded', 'Wandering', 'Stalwart', 'Verdant', 'Hollow', 'Radiant',
      'Silent', 'Restless', 'Ashen', 'Emberlit', 'Storm-Touched', 'Wayward',
      'Copper', 'Moonlit', 'Grim', 'Kindly', 'Fabled', 'Errant',
      'Thundering', 'Frostbound', 'Amber', 'Cindered', 'Argent', 'Weathered'
    ])[1 + floor(random() * 24)] as adjective,
           (array[
      'Owlbear', 'Lantern', 'Wyvern', 'Tankard', 'Griffon', 'Compass',
      'Basilisk', 'Chalice', 'Wanderer', 'Sigil', 'Beacon', 'Warden',
      'Manticore', 'Cartographer', 'Bramble', 'Reliquary', 'Kobold', 'Ledger',
      'Direwolf', 'Astrolabe', 'Nightjar', 'Codex', 'Peryton', 'Hearth'
    ])[1 + floor(random() * 24)] as noun
  ) parts;
$$;

comment on function private.generate_display_handle() is
  'Non-derived default username (#636). 576 combinations; callers must still '
  'resolve collisions against the profiles_username_key unique index.';

-- ── 2. New accounts stop inheriting their address ──────────────────────────
-- Unchanged: a display_name supplied at signup still wins, and both signup
-- views collect one (SignupView, JoinCampaignView), so the generated handle is
-- the path for people who leave that field blank. Only the last resort moves.
--
-- The collision loop is the pre-existing one and still earns its place: the
-- generator has 576 outputs, so a second holder of "Gilded Owlbear" becomes
-- "Gilded Owlbear_2". It is now the *only* thing standing between two blank
-- signups and a unique-violation on profiles_username_key, where before the
-- email made a collision nearly impossible.
create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix int := 1;
begin
  v_base := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    private.generate_display_handle()
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

-- ── 3. Retire the existing derived usernames ───────────────────────────────
-- Silent, no in-app prompt, and that is a considered call rather than a corner
-- cut. #636 suggested prompting before renaming "since users may know their
-- current handle" — but in this codebase they cannot: `profiles.username` is
-- read in exactly one place on the client (loadUsername in stores/auth.ts), no
-- component renders it, and there is no UI anywhere to change it. Nobody has
-- ever been shown their own username, so nobody can be attached to it.
--
-- If a username editor ever ships, this reasoning expires with it — a rename
-- then becomes something a person notices, and needs consent.
--
-- Matched by equality with the local part rather than by a LIKE pattern: the
-- point is not "looks like an email fragment", it is "is exactly the string
-- create_user_profile would have derived from this account's address".
do $$
declare
  v_row record;
  v_base text;
  v_candidate text;
  v_suffix int;
begin
  for v_row in
    select p.user_id
    from public.profiles p
    join auth.users u on u.id = p.user_id
    where p.username = split_part(u.email, '@', 1)
  loop
    v_base := private.generate_display_handle();
    v_candidate := v_base;
    v_suffix := 1;

    -- Same shape as create_user_profile's loop above, deliberately: one base,
    -- then _2, _3. Re-rolling the generator on each collision would work too,
    -- but then two functions would resolve the same unique constraint by two
    -- different rules, and only one of them would be the one under test.
    while exists (select 1 from public.profiles where username = v_candidate) loop
      v_suffix := v_suffix + 1;
      v_candidate := v_base || '_' || v_suffix;
    end loop;

    update public.profiles set username = v_candidate where user_id = v_row.user_id;
  end loop;
end $$;

-- ── 4. Membership display names stop ending at the address ─────────────────
-- The chain loses its last link. `(unnamed player)` rather than falling through
-- to null: display_name is what MembersTab renders, and a blank row in a member
-- list reads as a broken app, where a visibly unset name reads as an invitation
-- to set one.
--
-- profiles.username is still first in the chain — and after §3 that is finally
-- safe, which is the whole reason these two changes are one migration.
create or replace function public.create_dm_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    new.id,
    new.user_id,
    'dm',
    coalesce(
      (select username from public.profiles where user_id = new.user_id),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = new.user_id)), ''),
      '(unnamed player)'
    )
  )
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.join_campaign_via_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.campaign_invites%rowtype;
  v_inserted integer;
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
      '(unnamed player)'
    )
  )
  on conflict (campaign_id, user_id) do nothing;

  -- Only count a use when a new membership row was actually created; a no-op
  -- re-join (existing member re-opening the link, or a page remount) must not
  -- decrement a capped invite's remaining uses.
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.campaign_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  return v_invite.campaign_id;
end;
$$;

-- ── 5. Scrub the addresses already sitting in member lists ─────────────────
-- Runs after §3, so `username` is a generated handle by now rather than the
-- local part it was when this migration started. Equality with the account's
-- own address, not a LIKE '%@%' guess: a display_name someone deliberately
-- typed that happens to contain an @ is theirs to keep.
update public.campaign_members cm
   set display_name = coalesce(
     (select p.username from public.profiles p where p.user_id = cm.user_id),
     '(unnamed player)'
   )
  from auth.users u
 where u.id = cm.user_id
   and cm.display_name = u.email;

-- ── 6. Assert it, rather than trusting five statements to have all fired ───
-- Each of the above is individually plausible-looking and silently
-- no-op-able — a typo'd join condition updates nothing and the migration still
-- "succeeds". These two facts are the entire point of the change, so they fail
-- the deploy instead.
do $$
declare
  v_derived int;
  v_emails int;
begin
  select count(*) into v_derived
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.username = split_part(u.email, '@', 1);

  select count(*) into v_emails
  from public.campaign_members cm
  join auth.users u on u.id = cm.user_id
  where cm.display_name = u.email;

  if v_derived > 0 or v_emails > 0 then
    raise exception
      'email still present in user-facing identity: % derived username(s), % member display name(s)',
      v_derived, v_emails;
  end if;
end $$;
