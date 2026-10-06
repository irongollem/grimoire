-- #982 Hall of the Fallen: a memorial wall for every champion who fell or retired.
--
-- Design: https://claude.ai/artifact/2Vizcxj57abayVXeCus9yG (frames 01-12), decisions on #982.
--
-- Why a table of its own rather than columns on party_members:
--   * Three people write one memorial, each a different part. The DM marks a
--     fall and writes the account; the owning player writes the last words and
--     may retire their own character; everyone who was there may light a
--     candle. A row policy on party_members cannot tell those apart (the owner
--     may already update every column of their own row), so the writes go
--     through the four definer RPCs below, each authorizing first.
--   * A memorial outlives a membership. The wall shows companions from
--     campaigns a player has since left, and a player who left cannot read the
--     party_members row any more. So the memorial SNAPSHOTS what its card shows
--     (name, portrait, lineage, campaign, the player tag) at the moment of the
--     fall, and memorial_mourners records who was there. Both are frozen on
--     purpose: the issue's answer for the player tag is "if the player picks a
--     different username they stay desynched".
--   * A death is a deliberate act, never inferred from death saves (revivify,
--     resurrection and DM fiat exist), and it can be undone. Undo sets
--     restored_at and keeps every word, so a misclick or a raise-dead loses
--     nothing and a second fall starts from what was written.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.character_memorials (
  id                   uuid primary key default gen_random_uuid(),
  -- One memorial per character, ever: an undo keeps the row (and its words).
  party_member_id      uuid not null unique references public.party_members (id) on delete cascade,
  campaign_id          uuid not null references public.campaigns (id) on delete cascade,
  -- The character's owner at the moment of the event: they keep the card on
  -- their wall after leaving, and only they write the last words.
  owner_user_id        uuid references auth.users (id) on delete set null,
  marked_by            uuid references auth.users (id) on delete set null,
  kind                 text not null check (kind in ('fallen', 'retired')),
  -- Set by restore_character; NULL while the character is on the wall.
  restored_at          timestamptz,
  -- In-game date as the campaign's calendar spelled it ("14 Mirtul 1492 DR"),
  -- prefilled from the calendar and editable, so plain text.
  game_date            text,
  real_date            date not null default current_date,
  account              text,
  last_words           text,
  last_blow            text,
  survived_by          text[] not null default '{}',
  -- Snapshot for the card (see header).
  player_name          text,
  character_name       text not null,
  portrait_url         text,
  portrait_focal_point jsonb,
  species_name         text,
  class_name           text,
  level                integer,
  campaign_name        text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Both tables are published, so every row travels to the whole table.
  constraint character_memorials_lengths check (
    char_length(game_date) <= 120 and char_length(last_blow) <= 200
    and char_length(account) <= 20000 and char_length(last_words) <= 10000)
);

create index character_memorials_campaign_idx on public.character_memorials (campaign_id);
create index character_memorials_owner_idx on public.character_memorials (owner_user_id);

create trigger character_memorials_updated_at
  before update on public.character_memorials
  for each row execute procedure update_updated_at();

-- One row per person who was at the table when the character fell (seeded by
-- set_character_down) or who later lit a candle. It is what lets a player who
-- has since left still see the companions they fought beside, and it carries
-- that person's own gestures: a candle, having seen the death notice, and the
-- keep / let-go answer when they are no longer in the campaign.
create table public.memorial_mourners (
  memorial_id     uuid not null references public.character_memorials (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  candle_lit_at   timestamptz,
  tolled_at       timestamptz,
  kept_at         timestamptz,
  let_go_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (memorial_id, user_id)
);

create index memorial_mourners_user_idx on public.memorial_mourners (user_id);
create index memorial_mourners_campaign_idx on public.memorial_mourners (campaign_id);

create trigger memorial_mourners_updated_at
  before update on public.memorial_mourners
  for each row execute procedure update_updated_at();

-- Both references stay inside the campaign, like every campaign-scoped key.
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, campaign_id on public.character_memorials
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned');

create trigger zz_same_campaign_refs
  before insert or update of memorial_id, campaign_id on public.memorial_mourners
  for each row execute procedure private.enforce_same_campaign_refs('memorial_id', 'character_memorials', 'unowned');

-- ── Who may see a memorial ──────────────────────────────────────────────────
-- In private: it is an RLS predicate. Total by construction (coalesce): a
-- memorial that does not exist, or a caller with no claim, answers false.

create or replace function private.can_see_memorial(p_memorial_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select private.is_campaign_dm(m.campaign_id)
        or private.is_campaign_member(m.campaign_id)
        or m.owner_user_id = auth.uid()
        or exists (
             select 1 from public.memorial_mourners mm
              where mm.memorial_id = m.id
                and mm.user_id = auth.uid())
      from public.character_memorials m
     where m.id = p_memorial_id
  ), false);
$$;

alter table public.character_memorials enable row level security;
alter table public.memorial_mourners enable row level security;

-- Memorials are read by everyone who may see them and written only by the
-- definer RPCs below, which is why there is no insert/update/delete policy:
-- a policy would let the owner rewrite the DM's account.
create policy "character_memorials_select" on public.character_memorials
  for select using (private.can_see_memorial(id));

create policy "memorial_mourners_select" on public.memorial_mourners
  for select using (private.can_see_memorial(memorial_id));
create policy "memorial_mourners_insert" on public.memorial_mourners
  for insert with check (user_id = auth.uid() and private.can_see_memorial(memorial_id));
create policy "memorial_mourners_update" on public.memorial_mourners
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and private.can_see_memorial(memorial_id));

-- ── A character on the wall cannot be deleted ─────────────────────────────
-- A memorial is shared: deleting the character would cascade its memorial off
-- every companion's wall, and the lifecycle keeps a fallen character's row for
-- a raise-dead. So the two user-facing delete policies refuse a character
-- whose memorial is in effect ("Restore them first"). RLS governs only the
-- caller's own DELETE: the cascades from erasing an account or deleting a
-- campaign, and service-role work, are untouched. Recreated from the live
-- pg_policies text (prod and local agreed on 6 Oct 2026) plus the one clause.

create or replace function private.has_memorial_in_effect(p_party_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  -- exists() is never NULL, so the negated use below is total.
  select exists (
    select 1 from public.character_memorials m
     where m.party_member_id = p_party_member_id and m.restored_at is null);
$$;

drop policy if exists "party_members_creator_delete" on public.party_members;
create policy "party_members_creator_delete" on public.party_members
  for delete using (
    ((select auth.uid()) = user_id)
    and ((owner_user_id is null) or (owner_user_id = (select auth.uid())))
    and not private.has_memorial_in_effect(id));

drop policy if exists "party_members_player_delete" on public.party_members;
create policy "party_members_player_delete" on public.party_members
  for delete using (
    (((select auth.uid()) = owner_user_id)
      or ((campaign_id is not null) and private.is_campaign_dm(campaign_id) and (owner_user_id is null)))
    and not private.has_memorial_in_effect(id));

-- ── RPCs ────────────────────────────────────────────────────────────────────

-- Mark a character fallen (the DM) or retired (the DM or the owner). A field
-- left NULL is not written; a field the caller may not write is refused.
create or replace function public.set_character_down(
  p_party_member_id uuid,
  p_kind            text,
  p_game_date       text,
  p_real_date       date,
  p_account         text,
  p_last_blow       text,
  p_last_words      text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_pm       public.party_members%rowtype;
  v_is_dm    boolean;
  v_is_owner boolean;
  v_prior    public.character_memorials%rowtype;
  v_has      boolean;
  v_id       uuid;
begin
  select * into v_pm from public.party_members where id = p_party_member_id;
  if v_uid is null or not found or v_pm.campaign_id is null then
    raise exception 'Access denied';
  end if;
  v_is_dm := coalesce(private.is_campaign_dm(v_pm.campaign_id), false);
  v_is_owner := coalesce(v_pm.owner_user_id = v_uid, false);
  if not (v_is_dm or v_is_owner) then
    raise exception 'Access denied';
  end if;
  -- NULL-safe: "p_kind not in (...)" answers NULL for a NULL kind and would let it through.
  if p_kind is null or p_kind not in ('fallen', 'retired') then
    raise exception 'Unknown kind';
  end if;
  if p_kind = 'fallen' and not v_is_dm then
    raise exception 'Only the DM marks a character fallen';
  end if;
  if (p_account is not null or p_last_blow is not null) and not v_is_dm then
    raise exception 'Only the DM writes the account';
  end if;
  if p_last_words is not null and not v_is_owner then
    raise exception 'Only the player writes the last words';
  end if;

  select * into v_prior from public.character_memorials
   where party_member_id = p_party_member_id for update;
  v_has := found;
  if v_has and v_prior.restored_at is null then
    raise exception 'Already in the Hall of the Fallen';
  end if;

  insert into public.character_memorials as m (
    party_member_id, campaign_id, owner_user_id, marked_by, kind, restored_at,
    game_date, real_date, account, last_blow, last_words, survived_by,
    player_name, character_name, portrait_url, portrait_focal_point,
    species_name, class_name, level, campaign_name
  )
  select
    v_pm.id, v_pm.campaign_id, v_pm.owner_user_id, v_uid, p_kind, null,
    nullif(btrim(p_game_date), ''), coalesce(p_real_date, current_date),
    nullif(btrim(p_account), ''), nullif(btrim(p_last_blow), ''), nullif(btrim(p_last_words), ''),
    case when p_kind = 'fallen' then array(
      select o.name from public.party_members o
       where o.campaign_id = v_pm.campaign_id and o.id <> v_pm.id
         and not exists (select 1 from public.character_memorials x
                          where x.party_member_id = o.id and x.restored_at is null)
       order by o.sort_order, o.name)
    else '{}'::text[] end,
    -- The player as the table knew them at this moment: their seat name, else
    -- their username, else the name a DM typed for a DM-run character.
    coalesce(
      (select nullif(btrim(cm.display_name), '') from public.campaign_members cm
        where cm.campaign_id = v_pm.campaign_id and cm.user_id = v_pm.owner_user_id),
      (select nullif(btrim(p.username), '') from public.profiles p where p.user_id = v_pm.owner_user_id),
      nullif(btrim(v_pm.player_name), '')),
    v_pm.name, v_pm.portrait_url, v_pm.portrait_focal_point,
    coalesce(
      (select s.name from public.species s where s.id::text = v_pm.species_id),
      (select ls.name from public.library_species ls where ls.id::text = v_pm.species_id)),
    v_pm.class, v_pm.level,
    (select c.name from public.campaigns c where c.id = v_pm.campaign_id)
  on conflict (party_member_id) do update set
    campaign_id          = excluded.campaign_id,
    owner_user_id        = excluded.owner_user_id,
    marked_by            = excluded.marked_by,
    kind                 = excluded.kind,
    restored_at          = null,
    game_date            = excluded.game_date,
    real_date            = excluded.real_date,
    -- A field the caller did not send keeps what was written before the undo.
    account              = case when p_account is null then m.account else excluded.account end,
    last_blow            = case when p_last_blow is null then m.last_blow else excluded.last_blow end,
    last_words           = case when p_last_words is null then m.last_words else excluded.last_words end,
    survived_by          = excluded.survived_by,
    player_name          = excluded.player_name,
    character_name       = excluded.character_name,
    portrait_url         = excluded.portrait_url,
    portrait_focal_point = excluded.portrait_focal_point,
    species_name         = excluded.species_name,
    class_name           = excluded.class_name,
    level                = excluded.level,
    campaign_name        = excluded.campaign_name
  returning id into v_id;

  -- A character that fell before in another campaign: those mourners' rows
  -- belong to the old table.
  delete from public.memorial_mourners
   where memorial_id = v_id and campaign_id <> v_pm.campaign_id;

  -- Everyone at the table now is a mourner; the owner too, whatever their seat.
  insert into public.memorial_mourners (memorial_id, user_id, campaign_id)
  select v_id, u.user_id, v_pm.campaign_id
    from (select cm.user_id from public.campaign_members cm where cm.campaign_id = v_pm.campaign_id
          union
          select v_pm.owner_user_id where v_pm.owner_user_id is not null) u
  on conflict (memorial_id, user_id) do nothing;

  -- Each fall is announced afresh (the death notice reads tolled_at); the one
  -- who recorded it has already seen it.
  update public.memorial_mourners
     set tolled_at = case when user_id = v_uid then now() else null end
   where memorial_id = v_id;
end;
$$;

-- Undo: "Restore to life" (fallen, the DM) or "Return to the party" (retired,
-- the DM or the owner). Every word stays on the row.
create or replace function public.restore_character(p_party_member_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m   public.character_memorials%rowtype;
  v_is_dm boolean;
begin
  select * into v_m from public.character_memorials where party_member_id = p_party_member_id;
  if v_uid is null or not found then
    raise exception 'Access denied';
  end if;
  v_is_dm := coalesce(private.is_campaign_dm(v_m.campaign_id), false);
  if not (v_is_dm or (v_m.kind = 'retired' and coalesce(v_m.owner_user_id = v_uid, false))) then
    raise exception 'Access denied';
  end if;
  if v_m.restored_at is not null then
    raise exception 'Not in the Hall of the Fallen';
  end if;
  update public.character_memorials set restored_at = now() where party_member_id = p_party_member_id;
end;
$$;

-- The DM edits the account, the last blow and the dates after the fact.
create or replace function public.edit_memorial_account(
  p_party_member_id uuid,
  p_game_date       text,
  p_real_date       date,
  p_account         text,
  p_last_blow       text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_campaign uuid;
begin
  select campaign_id into v_campaign from public.character_memorials where party_member_id = p_party_member_id;
  if auth.uid() is null or v_campaign is null or not coalesce(private.is_campaign_dm(v_campaign), false) then
    raise exception 'Access denied';
  end if;
  update public.character_memorials
     set game_date = nullif(btrim(p_game_date), ''),
         real_date = coalesce(p_real_date, real_date),
         account   = nullif(btrim(p_account), ''),
         last_blow = nullif(btrim(p_last_blow), '')
   where party_member_id = p_party_member_id;
end;
$$;

-- The owning player writes (and later rewrites) the last words, from the card,
-- including after they have left the campaign.
create or replace function public.write_last_words(p_party_member_id uuid, p_last_words text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_found boolean;
begin
  select owner_user_id into v_owner from public.character_memorials where party_member_id = p_party_member_id;
  v_found := found;
  if auth.uid() is null or not v_found or not coalesce(v_owner = auth.uid(), false) then
    raise exception 'Access denied';
  end if;
  update public.character_memorials
     set last_words = nullif(btrim(p_last_words), '')
   where party_member_id = p_party_member_id;
end;
$$;

revoke execute on function public.set_character_down(uuid, text, text, date, text, text, text) from public, anon;
revoke execute on function public.restore_character(uuid) from public, anon;
revoke execute on function public.edit_memorial_account(uuid, text, date, text, text) from public, anon;
revoke execute on function public.write_last_words(uuid, text) from public, anon;
grant execute on function public.set_character_down(uuid, text, text, date, text, text, text) to authenticated, service_role;
grant execute on function public.restore_character(uuid) to authenticated, service_role;
grant execute on function public.edit_memorial_account(uuid, text, date, text, text) to authenticated, service_role;
grant execute on function public.write_last_words(uuid, text) to authenticated, service_role;

-- ── Live sync ───────────────────────────────────────────────────────────────
-- Both tables carry campaign_id and their readers may read the rows, so both
-- take the subscribed route (useCampaignLiveSync SYNC_TABLES).

alter publication supabase_realtime add table public.character_memorials;
alter publication supabase_realtime add table public.memorial_mourners;

create trigger character_memorials_signal_delete after delete on public.character_memorials
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

create trigger memorial_mourners_signal_delete after delete on public.memorial_mourners
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- ── Demo campaigns ──────────────────────────────────────────────────────────

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('character_memorials', 1, false, 'play state: a demo starts with nobody fallen'),
  ('memorial_mourners', 1, false, 'play state: per-player gestures at a memorial');
