-- Look after my character (#1059).
--
-- "I can't make it tonight, can someone play my character?" The character's
-- owner, or the table's DM, hands it to another member for a session. The
-- caretaker plays it at the table (hit points, conditions, slots, casting,
-- rests, Wild Shape, rolls, loot) and it stays the owner's: nothing about who
-- owns it changes, and it comes back when the session ends.
--
-- ── The model: minding is a seat ────────────────────────────────────────────
-- Everything a player does as their character keys on their seat,
-- `campaign_members.party_member_id`: the play RPCs, loot claims, the
-- `party_members` update policy, and every read of what a character has been
-- shown (`player_visible_to`, the reveal tables, the projection RPCs). The
-- client keys on it too (`auth.linkedPartyMemberId`). So a caretaker does not
-- get a parallel set of checks; their seat points at the character they are
-- minding, beside the owner's seat, which never moves. Switching between their
-- own character and the minded one is the ordinary "set active character"
-- write. The caretaker then reads what the character knows and nothing of the
-- owner's own: journal entries and entity notes key on the user, not the seat.
--
-- That makes "seated on a character another player owns" mean exactly "minding
-- it". Production had no such seat when this shipped (checked 14 Oct 2026),
-- and the seat guard below now refuses one, the DM's write included, unless a
-- hand-over is active. Two things follow:
--
--   * The seat used to mean "this is mine to build", and the build paths that
--     admit it must not admit a caretaker. Class rows, level up, retire and
--     detach already admit only the owner or the DM. What remained is the
--     `party_members` row itself (every column) and direct `character_spells`
--     writes; `private.guard_caretaker_*` below hold a caretaker to the play
--     columns and to spell uses.
--   * When a hand-over stops being active (taken back, its session ended, the
--     character or the caretaker left the table) the caretaker's seat goes back
--     to their own character: `private.settle_caretaker_seats`.
--
-- ── Lapse is derived, not stored ────────────────────────────────────────────
-- A hand-over is active while it is not revoked and its session has not ended.
-- One granted between sessions has no session yet and is active until the next
-- one ends: starting (or continuing) a session files it under that session, as
-- start files the moments shared during prep. Continuing an ended session
-- (#1058, which clears `ended_at`) makes its hand-overs active again with no
-- write of their own; the caretaker picks the character up in the switcher.

-- ── The table ───────────────────────────────────────────────────────────────

create table public.character_caretakers (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  party_member_id   uuid not null references public.party_members (id) on delete cascade,
  caretaker_user_id uuid not null references auth.users (id) on delete cascade,
  -- Who handed it over: the owner, or a DM of the table.
  granted_by        uuid default auth.uid() references auth.users (id) on delete set null,
  -- The session it is for; null until the next session starts.
  session_id        uuid references public.campaign_sessions (id) on delete cascade,
  -- The caretaker's own character, where their seat goes back to.
  return_member_id  uuid references public.party_members (id) on delete set null,
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One hand-over per character at a time: a new one ends the last.
create unique index character_caretakers_one_open
  on public.character_caretakers (party_member_id) where revoked_at is null;
create index character_caretakers_party_member_idx on public.character_caretakers (party_member_id);
create index character_caretakers_campaign_idx on public.character_caretakers (campaign_id);
create index character_caretakers_caretaker_idx on public.character_caretakers (caretaker_user_id);
create index character_caretakers_session_idx on public.character_caretakers (session_id);
create index character_caretakers_return_member_idx on public.character_caretakers (return_member_id);
create index character_caretakers_granted_by_idx on public.character_caretakers (granted_by);
create index character_caretakers_revoked_by_idx on public.character_caretakers (revoked_by);

comment on table public.character_caretakers is
  'A character handed to another member for a session (#1059). Active while not revoked and its session (if filed under one) has not ended.';

-- ── Predicates ──────────────────────────────────────────────────────────────

-- Whether p_user_id is minding the character now. Total: false, never NULL.
create function private.minds_character(p_party_member_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(p_party_member_id is not null and p_user_id is not null and exists (
    select 1
      from public.character_caretakers cc
      join public.party_members pm
        on pm.id = cc.party_member_id and pm.campaign_id = cc.campaign_id
      join public.campaign_members cm
        on cm.campaign_id = cc.campaign_id and cm.user_id = cc.caretaker_user_id
      left join public.campaign_sessions s on s.id = cc.session_id
     where cc.party_member_id = p_party_member_id
       and cc.caretaker_user_id = p_user_id
       and cc.revoked_at is null
       and (cc.session_id is null or s.ended_at is null)
  ), false);
$$;

revoke execute on function private.minds_character(uuid, uuid) from public, anon;
grant execute on function private.minds_character(uuid, uuid) to authenticated, service_role;

-- Whether the caller is changing a character another player owns while being
-- neither its owner nor its DM. Under RLS the one way to get there is a seat
-- minding it, so this is the "caretaker, not owner" test the column guards use.
-- Total: false, never NULL (a missing row, an unowned character and a signed-out
-- caller are all false).
create function private.plays_for_another(p_party_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select pm.owner_user_id is not null
       and (select auth.uid()) is not null
       and pm.owner_user_id <> (select auth.uid())
       and not (pm.campaign_id is not null and private.is_campaign_dm(pm.campaign_id))
      from public.party_members pm
     where pm.id = p_party_member_id
  ), false);
$$;

revoke execute on function private.plays_for_another(uuid) from public, anon;
grant execute on function private.plays_for_another(uuid) to authenticated, service_role;

-- ── Returning seats ─────────────────────────────────────────────────────────
-- Every seat in the campaign that sits on another player's character without
-- an active hand-over goes back to its member's own character: the one they
-- left for it, else the one they most recently played, else no character.
-- Never to a character still waiting for the DM's approval, which no seat may
-- take (CR001).

create function private.settle_caretaker_seats(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_prev   text := current_setting('grimoire.pm_campaign_transition', true);
  v_seat   record;
  v_return uuid;
begin
  if p_campaign_id is null then
    return;
  end if;

  for v_seat in
    select cm.id, cm.user_id, cm.party_member_id
      from public.campaign_members cm
      join public.party_members pm on pm.id = cm.party_member_id
     where cm.campaign_id = p_campaign_id
       and pm.owner_user_id is not null
       and pm.owner_user_id <> cm.user_id
       and not private.minds_character(cm.party_member_id, cm.user_id)
  loop
    select pm.id into v_return
      from public.character_caretakers cc
      join public.party_members pm on pm.id = cc.return_member_id
     where cc.party_member_id = v_seat.party_member_id
       and cc.caretaker_user_id = v_seat.user_id
       and pm.campaign_id = p_campaign_id
       and pm.owner_user_id = v_seat.user_id
       and not exists (select 1 from public.character_content_reviews r
                        where r.party_member_id = pm.id and r.status = 'pending')
     order by cc.created_at desc
     limit 1;

    if v_return is null then
      select pm.id into v_return
        from public.party_members pm
       where pm.campaign_id = p_campaign_id
         and pm.owner_user_id = v_seat.user_id
         and not exists (select 1 from public.character_content_reviews r
                          where r.party_member_id = pm.id and r.status = 'pending')
       order by pm.updated_at desc
       limit 1;
    end if;

    -- The seat guard's per-caller check would refuse this: whoever ended the
    -- session or took the character back does not own the caretaker's own.
    perform set_config('grimoire.pm_campaign_transition', 'on', true);
    update public.campaign_members set party_member_id = v_return where id = v_seat.id;
    perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  end loop;
end;
$$;

revoke execute on function private.settle_caretaker_seats(uuid) from public, anon, authenticated;

-- ── Writes to a hand-over ───────────────────────────────────────────────────

-- Insert: the server decides everything but who, for whom and at which table.
-- A new hand-over ends the character's last one.
create function private.prepare_character_caretaker()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pm public.party_members;
begin
  -- Authorize before saying anything about the character: the policy's own
  -- check runs after this trigger, and a stranger must learn nothing from
  -- which of the messages below they get. The policy repeats it.
  if not coalesce(
    private.is_campaign_dm(new.campaign_id)
    or exists (select 1 from public.party_members pm
                where pm.id = new.party_member_id and pm.owner_user_id = (select auth.uid())),
    false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_pm from public.party_members where id = new.party_member_id;
  if v_pm.id is null or v_pm.campaign_id is distinct from new.campaign_id then
    raise exception 'That character is not at this table';
  end if;
  if v_pm.owner_user_id is null then
    raise exception 'Only a player''s own character can be handed over';
  end if;
  if new.caretaker_user_id = v_pm.owner_user_id then
    raise exception 'A character cannot be handed to its own player';
  end if;
  if not exists (select 1 from public.campaign_members cm
                  where cm.campaign_id = new.campaign_id and cm.user_id = new.caretaker_user_id) then
    raise exception 'Only someone at this table can look after a character';
  end if;

  new.granted_by := (select auth.uid());
  new.return_member_id := null;
  new.revoked_at := null;
  new.revoked_by := null;
  select s.id into new.session_id
    from public.campaign_sessions s
   where s.campaign_id = new.campaign_id and s.started_at is not null and s.ended_at is null;

  update public.character_caretakers
     set revoked_at = now(), revoked_by = (select auth.uid())
   where party_member_id = new.party_member_id and revoked_at is null;

  return new;
end;
$$;

revoke execute on function private.prepare_character_caretaker() from public, anon, authenticated;

-- Update: a client may only end a hand-over, once, and the clock and the name
-- on it are the server's. Server code (the session filing, the return seat)
-- writes the rest.
create function private.guard_character_caretaker_update()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if old.revoked_at is not null then
    raise exception 'This hand-over has already ended';
  end if;
  if new.revoked_at is null then
    raise exception 'A hand-over can only be ended';
  end if;
  new.revoked_at := now();
  new.revoked_by := (select auth.uid());
  return new;
end;
$$;

revoke execute on function private.guard_character_caretaker_update() from public, anon, authenticated;

create function private.settle_caretaker_seats_on_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.settle_caretaker_seats(coalesce(new.campaign_id, old.campaign_id));
  if tg_op = 'UPDATE' and old.campaign_id is distinct from new.campaign_id then
    perform private.settle_caretaker_seats(old.campaign_id);
  end if;
  return null;
end;
$$;

revoke execute on function private.settle_caretaker_seats_on_change() from public, anon, authenticated;

create trigger character_caretakers_prepare
  before insert on public.character_caretakers
  for each row execute procedure private.prepare_character_caretaker();

create trigger character_caretakers_guard_update
  before update on public.character_caretakers
  for each row execute procedure private.guard_character_caretaker_update();

create trigger character_caretakers_updated_at
  before update on public.character_caretakers
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of party_member_id, session_id, return_member_id, campaign_id
  on public.character_caretakers
  for each row execute procedure private.enforce_same_campaign_refs(
    'party_member_id', 'party_members', 'owned',
    'session_id', 'campaign_sessions', 'owned',
    'return_member_id', 'party_members', 'owned');

create trigger character_caretakers_settle_seats
  after update or delete on public.character_caretakers
  for each row execute procedure private.settle_caretaker_seats_on_change();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The whole table reads who is minding whom: rolls and chat say "Tomas, for
-- Mira", and the party tracker shows it. The owner or a DM hands a character
-- over; the owner, a DM or the caretaker ends it. Deleting one is the DM's
-- (a hand-over is the record the owner's "while you were away" reads).

alter table public.character_caretakers enable row level security;

create policy "character_caretakers_select" on public.character_caretakers for select
  using (private.is_campaign_member(campaign_id));

create policy "character_caretakers_insert" on public.character_caretakers for insert
  with check (
    granted_by = (select auth.uid())
    and (
      private.is_campaign_dm(campaign_id)
      or exists (
        select 1 from public.party_members pm
         where pm.id = character_caretakers.party_member_id
           and pm.campaign_id = character_caretakers.campaign_id
           and pm.owner_user_id = (select auth.uid())
      )
    )
  );

create policy "character_caretakers_update" on public.character_caretakers for update
  using (
    private.is_campaign_dm(campaign_id)
    or caretaker_user_id = (select auth.uid())
    or exists (
      select 1 from public.party_members pm
       where pm.id = character_caretakers.party_member_id
         and pm.owner_user_id = (select auth.uid())
    )
  )
  with check (
    private.is_campaign_dm(campaign_id)
    or caretaker_user_id = (select auth.uid())
    or exists (
      select 1 from public.party_members pm
       where pm.id = character_caretakers.party_member_id
         and pm.owner_user_id = (select auth.uid())
    )
  );

create policy "character_caretakers_delete" on public.character_caretakers for delete
  using (private.is_campaign_dm(campaign_id));

-- Ending is the only update a client makes.
revoke update on public.character_caretakers from anon, authenticated;
grant update (revoked_at) on public.character_caretakers to authenticated;

-- ── Live sync: the campaign doorbell ────────────────────────────────────────

create trigger character_caretakers_signal_insert after insert on public.character_caretakers
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger character_caretakers_signal_update after update on public.character_caretakers
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger character_caretakers_signal_delete after delete on public.character_caretakers
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- ── Sessions: file, and lapse ───────────────────────────────────────────────

-- A session opening (start, or continue) files the hand-overs granted while
-- none was open under it.
create function private.file_caretakers_under_session()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.character_caretakers
     set session_id = new.id
   where campaign_id = new.campaign_id
     and session_id is null
     and revoked_at is null;
  return null;
end;
$$;

revoke execute on function private.file_caretakers_under_session() from public, anon, authenticated;

create trigger campaign_sessions_file_caretakers
  after insert or update of started_at, ended_at on public.campaign_sessions
  for each row when (new.started_at is not null and new.ended_at is null)
  execute procedure private.file_caretakers_under_session();

-- A session ending ends its hand-overs (derived), so the seats go back.
create trigger campaign_sessions_settle_caretakers
  after update of ended_at on public.campaign_sessions
  for each row when (old.ended_at is null and new.ended_at is not null)
  execute procedure private.settle_caretaker_seats_on_change();

-- A character leaving the table ends its hand-overs (derived) too.
create trigger party_members_settle_caretakers
  after update of campaign_id on public.party_members
  for each row when (old.campaign_id is distinct from new.campaign_id)
  execute procedure private.settle_caretaker_seats_on_change();

-- ── The seat ────────────────────────────────────────────────────────────────
-- Remember where a caretaker came from when they take up the minded character,
-- so the seat goes back there when the hand-over ends.
create function private.note_caretaker_return()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_return uuid;
begin
  if old.party_member_id is null or not private.minds_character(new.party_member_id, new.user_id) then
    return null;
  end if;
  -- Straight from one minded character to another: the way home is the one
  -- the first hand-over already knew.
  if private.minds_character(old.party_member_id, new.user_id) then
    select cc.return_member_id into v_return
      from public.character_caretakers cc
     where cc.party_member_id = old.party_member_id
       and cc.caretaker_user_id = new.user_id
       and cc.revoked_at is null;
  else
    v_return := old.party_member_id;
  end if;
  if v_return is not null then
    update public.character_caretakers
       set return_member_id = v_return
     where party_member_id = new.party_member_id
       and caretaker_user_id = new.user_id
       and revoked_at is null;
  end if;
  return null;
end;
$$;

revoke execute on function private.note_caretaker_return() from public, anon, authenticated;

create trigger campaign_members_note_caretaker_return
  after update of party_member_id on public.campaign_members
  for each row when (new.party_member_id is not null and new.party_member_id is distinct from old.party_member_id)
  execute procedure private.note_caretaker_return();

-- ── A caretaker plays, never rebuilds ───────────────────────────────────────
-- The `party_members` update policy admits the seat, so it admits a caretaker.
-- What they may change is the character in play. An allow-list, so a column
-- added later is the owner's until someone decides otherwise. Weapon masteries
-- and Artificer infusions are left off on purpose: both are chosen on a long
-- rest by the character's player, which makes them build, not play. `class_choices`
-- holds both build picks (feats, invocations) and feature toggles
-- (`<key>_active`, written by `useFeatureUses`), so a caretaker may switch the
-- toggles and nothing else in it. Server code (the definer RPCs, which do their
-- own checks) is not held to this.

create function private.guard_caretaker_party_member_update()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_new     jsonb;
  v_old     jsonb;
  v_changed text[];
begin
  if current_user not in ('authenticated', 'anon') or not private.plays_for_another(old.id) then
    return new;
  end if;

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
   where v_new -> k is distinct from v_old -> k
     and k <> all (array[
       'current_hp', 'temp_hp', 'current_initiative', 'conditions', 'inspiration',
       'death_save_successes', 'death_save_failures', 'cp', 'sp', 'ep', 'gp', 'pp',
       'spell_slots', 'class_resources', 'class_choices', 'hit_dice_remaining',
       'concentration', 'wildshape_state', 'wildshapes_used', 'wildshape_reset',
       'disguise_species_id', 'disguise_race', 'disguise_subrace', 'updated_at'
     ]);
  if v_changed is not null then
    raise exception 'A character you are looking after stays as its player built it (%)',
      array_to_string(v_changed, ', ')
      using errcode = '42501';
  end if;

  if new.class_choices is distinct from old.class_choices and exists (
    select 1
      from (select jsonb_object_keys(coalesce(new.class_choices, '{}'::jsonb)) as k
            union
            select jsonb_object_keys(coalesce(old.class_choices, '{}'::jsonb))) keys
     where new.class_choices -> keys.k is distinct from old.class_choices -> keys.k
       and keys.k !~ '_active$'
       and keys.k <> 'innate_sorcery_expires_at'
  ) then
    raise exception 'A character you are looking after keeps the choices its player made'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_caretaker_party_member_update() from public, anon, authenticated;

create trigger party_members_guard_caretaker
  before update on public.party_members
  for each row execute procedure private.guard_caretaker_party_member_update();

-- The same for a character's spells: a caretaker spends an innate spell's uses
-- (`uses_remaining`) and learns, forgets and re-files nothing. Casting, resting
-- and preparing go through definer RPCs.
create function private.guard_caretaker_character_spells()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if private.plays_for_another(new.party_member_id) then
      raise exception 'A character you are looking after keeps the spells its player chose'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if not private.plays_for_another(old.party_member_id) then
    if tg_op = 'UPDATE' and private.plays_for_another(new.party_member_id) then
      raise exception 'A character you are looking after keeps the spells its player chose'
        using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'uses_remaining' - 'updated_at') = (to_jsonb(old) - 'uses_remaining' - 'updated_at') then
    return new;
  end if;
  raise exception 'A character you are looking after keeps the spells its player chose'
    using errcode = '42501';
end;
$$;

revoke execute on function private.guard_caretaker_character_spells() from public, anon, authenticated;

create trigger character_spells_guard_caretaker
  before insert or update or delete on public.character_spells
  for each row execute procedure private.guard_caretaker_character_spells();

-- ── The other places the seat writes ────────────────────────────────────────
-- A security review of this migration (14 Oct 2026) found three more places
-- the seat reaches that are its player's rather than the table's.

-- A character's companions: the update and delete policies admit the seat
-- (`private.my_party_member_id`). A caretaker plays the familiar or mount (hit
-- points, conditions, whether it is in the fight) and leaves the rest, unless
-- they brought the companion themselves.
create function private.guard_caretaker_companions()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon')
     or old.user_id = (select auth.uid())
     or not private.plays_for_another(old.owner_party_member_id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'current_hp' - 'conditions' - 'combat_ready' - 'updated_at')
       = (to_jsonb(old) - 'current_hp' - 'conditions' - 'combat_ready' - 'updated_at') then
    return new;
  end if;
  raise exception 'A companion you are looking after stays as its player made it'
    using errcode = '42501';
end;
$$;

revoke execute on function private.guard_caretaker_companions() from public, anon, authenticated;

create trigger companions_guard_caretaker
  before update or delete on public.companions
  for each row execute procedure private.guard_caretaker_companions();

-- Re-declared from production's body with the level-up refusal added.
create or replace function public.open_spell_change_windows(p_party_member_id uuid, p_timing text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_timing not in ('level_up', 'long_rest') then raise exception 'Invalid spell change timing'; end if;
  -- Mirrors take_spellcasting_rest's check, including campaign_members
  -- collaborators, since the rest RPC delegates window opening here.
  if not exists (select 1 from party_members pm where pm.id = p_party_member_id and
    (pm.owner_user_id = auth.uid() or (pm.owner_user_id is null and pm.user_id = auth.uid()) or private.is_campaign_dm(pm.campaign_id)
      or exists (select 1 from public.campaign_members cm
        where cm.user_id = auth.uid() and cm.party_member_id = pm.id))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- A caretaker (#1059) rests the character, which opens its long-rest
  -- windows. A level-up window is its player's: refilling one would hand back
  -- a swap the player already made.
  if p_timing = 'level_up' and private.plays_for_another(p_party_member_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
  select p_party_member_id, cc.id, p_timing, policy.change_count, now()
  from character_classes cc
  join class_spellcasting_policies policy on policy.ruleset = private.party_member_ruleset(p_party_member_id)
    and policy.class_name = cc.class_name and policy.change_timing = p_timing
  where cc.party_member_id = p_party_member_id
    and cc.class_definition_kind = 'system'
  on conflict (party_member_id, source_class_id, change_timing) do update set
    remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
end;
$function$;

-- Re-declared from production's body with the caretaker refusal added.
create or replace function public.spend_downtime_draw(p_campaign_id uuid, p_activity_key text)
 RETURNS downtime_draws
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member uuid;
  v_balance integer;
  v_draw downtime_draws;
begin
  -- Authorize first. my_party_member_id() returns null for non-members.
  v_member := private.my_party_member_id(p_campaign_id);
  if v_member is null then
    raise exception 'You do not play a character in this campaign'
      using errcode = 'insufficient_privilege';
  end if;
  -- Downtime is the character's own between sessions; a caretaker (#1059)
  -- has it for one session's play and does not spend its player's credits.
  if private.plays_for_another(v_member) then
    raise exception 'Downtime is spent by the character''s own player'
      using errcode = 'insufficient_privilege';
  end if;

  if length(trim(coalesce(p_activity_key, ''))) = 0 then
    raise exception 'activity_key is required' using errcode = 'check_violation';
  end if;

  -- Serialize concurrent spends for this character.
  perform pg_advisory_xact_lock(hashtextextended(v_member::text, 0));

  select
    coalesce((select sum(amount) from downtime_grants
              where party_member_id = v_member and campaign_id = p_campaign_id), 0)
    - (select count(*) from downtime_draws
       where party_member_id = v_member and campaign_id = p_campaign_id
         and status <> 'cancelled')
  into v_balance;

  if v_balance < 1 then
    raise exception 'No downtime credits remaining'
      using errcode = 'check_violation';
  end if;

  insert into downtime_draws (campaign_id, party_member_id, activity_key)
  values (p_campaign_id, v_member, p_activity_key)
  returning * into v_draw;

  return v_draw;
end;
$function$;

-- ── The seat guard ──────────────────────────────────────────────────────────
-- Re-declared from production's body with the two minding clauses added.

create or replace function public.guard_campaign_member_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := (select auth.uid());
  v_owner  uuid;
begin
  -- A membership row belongs to one person at one table, for everyone, the DM
  -- included: moving it is how a seat would be granted without an invite or a
  -- parent's yes (#927).
  if new.user_id is distinct from old.user_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'A membership cannot be moved to another person or campaign';
  end if;

  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null
     and exists (
       select 1 from public.character_content_reviews r
        where r.party_member_id = new.party_member_id and r.status = 'pending'
     ) then
    raise exception 'This character is waiting for the DM''s approval'
      using errcode = 'CR001';
  end if;

  -- Who sits in the DM chair is the owner's call (#590). A campaign seats its
  -- owner and any co-DM they appoint, all as role 'dm', so "is a DM here" can
  -- no longer license a role change: a co-DM would promote whoever they liked
  -- and demote the owner. The owner may set any row's role (their own too:
  -- transfer_campaign_ownership demotes them, as them, before it hands the
  -- campaign over). Anyone else may only hand their own chair back.
  if new.role is distinct from old.role then
    select c.user_id into v_owner from public.campaigns c where c.id = old.campaign_id;
    if v_caller is distinct from v_owner
       and not coalesce(old.user_id = v_caller and old.role = 'dm' and new.role = 'player', false) then
      if private.is_campaign_dm(old.campaign_id) then
        raise exception 'Only the campaign''s owner can change who is a DM'
          using errcode = '42501';
      end if;
      raise exception 'Not allowed to change role or campaign assignment';
    end if;
  end if;

  -- DMs of this campaign may change the rest (name, character).
  if private.is_campaign_dm(old.campaign_id) then
    if new.party_member_id is distinct from old.party_member_id
       and new.party_member_id is not null
       and not exists (
         select 1 from public.party_members pm
         where pm.id = new.party_member_id
           and pm.campaign_id = new.campaign_id
       ) then
      raise exception 'Cannot link a character from another campaign';
    end if;
    -- Another player's character is theirs to hand over (#1059): a DM seats
    -- someone on it only while that someone is minding it.
    if new.party_member_id is distinct from old.party_member_id
       and new.party_member_id is not null
       and exists (
         select 1 from public.party_members pm
          where pm.id = new.party_member_id
            and pm.owner_user_id is not null
            and pm.owner_user_id <> new.user_id
       )
       and not private.minds_character(new.party_member_id, new.user_id) then
      raise exception 'That character belongs to another player';
    end if;
    return new;
  end if;

  -- Admission (private.admit_campaign_member) links the character the joiner
  -- chose, and has checked it is theirs. It runs as whoever gave the last yes,
  -- usually a parent, who owns no character here, so the per-caller check
  -- below would refuse every approval that brings one.
  if current_setting('grimoire.pm_campaign_transition', true) = 'on' then
    return new;
  end if;

  -- party_member_id may change (claim / self-create / assume), but only to a
  -- character the player is allowed to take: same campaign, not owned by someone
  -- else, and not already claimed by another member. Clearing it is always allowed.
  -- A character handed to this player (#1059) is theirs to take up for as long
  -- as they are minding it, beside its owner's seat; and a caretaker's seat on
  -- someone's character does not count as claiming it.
  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null
     and not private.minds_character(new.party_member_id, v_caller) then

    if not exists (
      select 1 from public.party_members pm
      where pm.id = new.party_member_id
        and pm.campaign_id = new.campaign_id
        and (pm.owner_user_id is null or pm.owner_user_id = (select auth.uid()))
    ) then
      raise exception 'Cannot link a character from another campaign or owned by another player';
    end if;

    if exists (
      select 1 from public.campaign_members cm
      where cm.party_member_id = new.party_member_id
        and cm.id is distinct from new.id
        and not private.minds_character(new.party_member_id, cm.user_id)
    ) then
      raise exception 'That character is already claimed by another player';
    end if;
  end if;

  return new;
end;
$function$;

-- ── Preparing spells is play ────────────────────────────────────────────────
-- Re-declared from production's body. Choosing the day's prepared spells after
-- a long rest is something the player at the table does, so it admits the seat
-- like its siblings (cast, rest), and with it a caretaker.

create or replace function public.set_character_spell_prepared(p_character_spell_id uuid, p_is_prepared boolean)
 RETURNS character_spells
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_spell public.character_spells%rowtype;
  v_member public.party_members%rowtype;
  v_class public.character_classes%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
begin
  select * into strict v_spell from public.character_spells where id = p_character_spell_id for update;
  select * into strict v_member from public.party_members where id = v_spell.party_member_id for update;
  if not coalesce((v_member.owner_user_id = auth.uid() or (v_member.owner_user_id is null and v_member.user_id = auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = auth.uid() and cm.party_member_id = v_member.id)), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_spell.source_type <> 'class' or v_spell.source_class_id is null then
    raise exception 'Only class spells can be prepared';
  end if;
  if v_spell.always_prepared then raise exception 'Always-prepared spells cannot be changed'; end if;
  if public.character_spell_level(v_spell.spell_id) = 0 then raise exception 'Cantrips are always available'; end if;

  select * into strict v_class from public.character_classes
  where id = v_spell.source_class_id and party_member_id = v_member.id;
  if v_class.class_definition_kind = 'system' then
    select policy.* into v_policy
    from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id)
      and policy.class_name = v_class.class_name;
  end if;

  if v_policy.ruleset is not null then
    if v_policy.caster_type <> 'spellbook' then
      raise exception 'This class changes prepared spells by replacement';
    end if;
    if not exists (
      -- "window" is a reserved SQL keyword and cannot be used as an unquoted
      -- alias (causes a syntax error at "where").
      select 1 from public.spell_change_windows scw
      where scw.party_member_id = v_member.id
        and scw.source_class_id = v_spell.source_class_id
        and scw.change_timing = v_policy.change_timing
    ) then
      raise exception 'No active % preparation window for this class', v_policy.change_timing;
    end if;
  end if;

  perform set_config('app.preparation_change_spell_id', v_spell.id::text, true);
  update public.character_spells set is_prepared = p_is_prepared
  where id = v_spell.id returning * into v_spell;
  return v_spell;
end;
$function$;

-- ── The session log's links ─────────────────────────────────────────────────
-- A new foreign key into campaign_sessions moves with a merge
-- (merge_campaign_sessions.test.sql holds the list equal to pg_constraint).

create or replace function public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
returns public.campaign_sessions
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_keep   public.campaign_sessions;
  v_absorb public.campaign_sessions;
begin
  -- Authorize before locking anything: a caller who may not merge these rows
  -- must not be able to hold locks on them either, even for a moment.
  -- One message for missing and foreign alike: a caller learns nothing about
  -- sessions in a campaign they do not run.
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if auth.uid() is null
     or v_keep.id is null
     or v_absorb.id is null
     or v_keep.campaign_id <> v_absorb.campaign_id
     or not coalesce(private.is_campaign_dm(v_keep.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Both rows locked in one statement, in id order: two merges naming the same
  -- pair the other way round would otherwise each hold one row and wait on
  -- the other. Then read again, since a concurrent merge may have changed or
  -- removed either while this one waited.
  perform 1 from public.campaign_sessions where id in (p_keep, p_absorb) order by id for update;
  select * into v_keep from public.campaign_sessions where id = p_keep;
  select * into v_absorb from public.campaign_sessions where id = p_absorb;
  if v_keep.id is null or v_absorb.id is null then
    raise exception 'That session was merged or deleted in the meantime';
  end if;

  if v_keep.id = v_absorb.id then
    raise exception 'A session cannot be merged into itself';
  end if;
  if (v_keep.started_at is not null and v_keep.ended_at is null)
     or (v_absorb.started_at is not null and v_absorb.ended_at is null) then
    raise exception 'End the running session before merging it';
  end if;

  update public.notes                  set session_id = p_keep where session_id = p_absorb;
  update public.session_proposals      set session_id = p_keep where session_id = p_absorb;
  update public.encounter_state        set session_id = p_keep where session_id = p_absorb;
  update public.npc_reveals            set session_id = p_keep where session_id = p_absorb;
  update public.location_reveals       set session_id = p_keep where session_id = p_absorb;
  update public.handout_reveals        set session_id = p_keep where session_id = p_absorb;
  update public.discovered_monsters    set session_id = p_keep where session_id = p_absorb;
  update public.quest_beat_transitions set session_id = p_keep where session_id = p_absorb;
  update public.npc_memories           set session_id = p_keep where session_id = p_absorb;
  update public.character_caretakers   set session_id = p_keep where session_id = p_absorb;

  delete from public.campaign_sessions where id = p_absorb;

  update public.campaign_sessions
     set number     = coalesce(v_keep.number, v_absorb.number),
         title      = coalesce(nullif(btrim(v_keep.title), ''), nullif(btrim(v_absorb.title), '')),
         played_on  = coalesce(v_keep.played_on, v_absorb.played_on),
         started_at = case
                        when v_keep.started_at is null then v_absorb.started_at
                        when v_absorb.started_at is null then v_keep.started_at
                        else least(v_keep.started_at, v_absorb.started_at)
                      end,
         ended_at   = case
                        when v_keep.started_at is null then v_absorb.ended_at
                        when v_absorb.started_at is null then v_keep.ended_at
                        else greatest(v_keep.ended_at, v_absorb.ended_at)
                      end
   where id = p_keep
  returning * into v_keep;

  return v_keep;
end;
$$;

-- ── Registries ──────────────────────────────────────────────────────────────

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('character_caretakers', 1, false, 'play state: who minds whose character tonight; a demo starts with every character with its own player');
