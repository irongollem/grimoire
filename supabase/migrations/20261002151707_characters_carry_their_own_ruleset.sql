-- Epic #943: a character carries its own ruleset; a campaign decides who may
-- sit down.
--
-- The ruleset lived only on `campaigns`, so a character was whatever edition
-- its table happened to be and a character with no table had none. Three things
-- followed from that and all three go here:
--
--   1. A DM switching a campaign's edition rewrote every seated character's
--      classes and spells (the campaigns_review_characters_ruleset trigger).
--      A character is its player's (#730); a DM's setting must not change it.
--   2. Nothing could refuse a 2024 character at a 2014 table, because nothing
--      knew the character was 2024.
--   3. Claiming never transferred ownership. Linking a seat to a DM-made
--      character left owner_user_id NULL, so the player playing it could lose
--      it to a detach or to the DM deleting their account.
--
-- What this migration decides (the epic body holds the reasoning):
--
--   * party_members.ruleset is NOT NULL with no default. Every insert states
--     it; an insert that omits it is refused, inside a campaign or not.
--   * It changes only through convert_party_member_ruleset(), which is the old
--     campaign trigger's logic keyed on one character.
--   * campaigns.allows_mixed_rulesets (default false) gates attach, join and a
--     direct insert. A refusal raises SQLSTATE RS001 with both rulesets in the
--     detail, which is what the client's bounce dialog keys on.
--   * A campaign edition switch touches no character. Seated characters keep
--     their edition and their seat; the mismatch is derivable
--     (party_members.ruleset <> campaigns.ruleset) and needs no table.
--   * ruleset_reviews belongs to the character: campaign_id is dropped so a
--     campaign-less copy can carry reviews. With no campaign_id its rows cannot
--     be a filtered realtime subscription, so it leaves the publication and
--     rings the campaign_sync doorbell instead.
--   * A DM assigning an unowned character to a seat makes that member its
--     owner, and owner_user_id is no longer something a client can write.
--
-- Existing rows are migrated here, not accommodated: an attached character
-- takes its campaign's ruleset, an unattached one the edition of its pinned
-- class (three production characters were detached from 2024 tables), and a
-- linked-but-unowned one is owned by the member whose seat it fills.

-- ── 1. Columns and the data migration ────────────────────────────────────────

alter table public.campaigns
  add column allows_mixed_rulesets boolean not null default false;

comment on column public.campaigns.allows_mixed_rulesets is
  'Whether a character built under the other edition may attach or join. A character already seated is never removed by turning this off.';

alter table public.party_members add column ruleset text;

-- The backfill is not an edit anyone made: keep updated_at truthful and keep
-- the campaign_id transition guard out of an update that changes no campaign.
alter table public.party_members disable trigger user;

update public.party_members pm
   set ruleset = c.ruleset
  from public.campaigns c
 where c.id = pm.campaign_id;

update public.party_members pm
   set ruleset = coalesce((
     select sc.ruleset
       from public.character_classes cc
       join public.system_classes sc on sc.id = cc.class_definition_id
      where cc.party_member_id = pm.id
      order by cc.is_primary desc nulls last, cc.sort_order, cc.id
      limit 1), '2014')
 where pm.campaign_id is null;

-- A character a member is already playing becomes theirs, under the rule the
-- claim trigger applies from here on: in the seat's own campaign, and not an
-- offered (is_dm_managed) character. Who made each existing link is not
-- recorded, so every one of them counts as the hand-over it was in practice.
-- One seat per character is the rule (guard_campaign_member_self_update); the
-- ordering only makes the choice deterministic if a row ever broke it.
update public.party_members pm
   set owner_user_id = link.user_id
  from (
    select distinct on (cm.party_member_id) cm.party_member_id, cm.user_id, cm.campaign_id
      from public.campaign_members cm
     where cm.party_member_id is not null
     order by cm.party_member_id, cm.joined_at, cm.id
  ) link
 where link.party_member_id = pm.id
   and link.campaign_id = pm.campaign_id
   and pm.owner_user_id is null
   and not pm.is_dm_managed;

alter table public.party_members enable trigger user;

alter table public.party_members
  alter column ruleset set not null,
  add constraint party_members_ruleset_check check (ruleset in ('2014', '2024'));

comment on column public.party_members.ruleset is
  'The edition this character is built under. Its own, not its campaign''s; changes only via convert_party_member_ruleset().';

-- ── 2. One reader, one gate ──────────────────────────────────────────────────

-- Still the only function allowed to resolve a character's ruleset
-- (20261001220509); it now reads the character instead of its campaign.
create or replace function private.party_member_ruleset(p_party_member_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select pm.ruleset from public.party_members pm where pm.id = p_party_member_id),
    '2014');
$$;

comment on function private.party_member_ruleset(uuid) is
  'The ruleset a character is built under. Total: an unknown character resolves to 2014 rather than NULL, so a caller''s `<> ''2024''` cannot fall through.';

-- The door. Called by attach, join and the insert trigger so the three cannot
-- disagree about who may sit down.
create function private.assert_ruleset_admissible(p_ruleset text, p_campaign_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ruleset text;
  v_mixed boolean;
begin
  select c.ruleset, c.allows_mixed_rulesets into v_ruleset, v_mixed
    from public.campaigns c where c.id = p_campaign_id;
  if not found then
    raise exception 'Campaign not found';
  end if;
  if p_ruleset is distinct from v_ruleset and not v_mixed then
    raise exception 'This table plays the % rules and does not take % characters',
      v_ruleset, p_ruleset
      using errcode = 'RS001',
            detail = jsonb_build_object(
              'character_ruleset', p_ruleset, 'campaign_ruleset', v_ruleset)::text;
  end if;
end;
$$;

revoke execute on function private.assert_ruleset_admissible(text, uuid) from public, anon, authenticated;

-- ── 3. party_members: the ruleset on insert, and on update ───────────────────

create function public.set_party_member_ruleset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Every insert states the edition. There is no "take the campaign's": that
  -- was the old model (a character's edition is its table's) surviving as a
  -- default, and nothing in the app relies on it, since the wizard asks first.
  if new.ruleset is null then
    raise exception 'A character must state its ruleset'
      using errcode = '23502';
  end if;
  if new.campaign_id is null then
    return new;
  end if;

  -- The insert policy lets a member write campaign_id directly, so the door has
  -- to be here as well as on attach.
  --
  -- Not for the table's own DM. The door keeps a character of the other edition
  -- from ARRIVING; a seated one of the other edition is already a state a table
  -- can be in (a campaign that switched edition keeps its characters, flagged),
  -- and a DM restoring a backup or importing a world has to be able to put that
  -- state back. The DM's character lands as it is, shows in the mismatch list,
  -- and is converted from there.
  if not (
    private.is_campaign_dm(new.campaign_id)
    or exists (
      select 1 from public.campaigns c
       where c.id = new.campaign_id and c.user_id = (select auth.uid()))
  ) then
    perform private.assert_ruleset_admissible(new.ruleset, new.campaign_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.set_party_member_ruleset() from public, anon, authenticated;

create trigger party_members_set_ruleset
  before insert on public.party_members
  for each row execute procedure public.set_party_member_ruleset();

-- The update policy lets an owner write any column. A bare ruleset write would
-- leave every pinned class and spell on the other edition, so it is refused;
-- convert_party_member_ruleset() raises the flag and does the whole job.
create function public.guard_party_member_ruleset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('grimoire.pm_ruleset_transition', true) = 'on' then
    return new;
  end if;
  raise exception 'A character changes ruleset only via convert_party_member_ruleset';
end;
$$;

revoke execute on function public.guard_party_member_ruleset() from public, anon, authenticated;

create trigger party_members_guard_ruleset
  before update of ruleset on public.party_members
  for each row when (new.ruleset is distinct from old.ruleset)
  execute procedure public.guard_party_member_ruleset();

-- ── 4. Ownership: who may write it, and when a link hands it over ────────────

-- The update policy lets a character's creator write any column, owner_user_id
-- included, and the insert policy lets them insert a row owned by anyone. That
-- was harmless while ownership decided little. It now decides who may convert a
-- character, clone it, delete it and keep it, so a creator rewriting the owner
-- takes a claimed character back, and a creator inserting one "for" a stranger
-- puts it in that stranger's pool.
--
-- SECURITY INVOKER on purpose, which is what makes the rule simple: a write made
-- directly by a client runs as `authenticated`; a write made by one of the
-- definer paths (the claim below, clone, assume, admission) or by the owner
-- foreign key's ON DELETE SET NULL runs as the function or table owner. So "a
-- client may not" needs no flag for the sanctioned paths to raise.
create function public.guard_party_member_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.owner_user_id is not null and new.owner_user_id is distinct from (select auth.uid()) then
      raise exception 'A character can only be created for its own player' using errcode = '42501';
    end if;
    -- The creator is the caller. The insert policy pins that for a player but
    -- not for a DM adding to their roster, who could otherwise put any account
    -- down as a character's creator.
    if new.user_id is distinct from (select auth.uid()) then
      raise exception 'A character is created in its creator''s own name' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'A character''s creator does not change' using errcode = '42501';
  end if;
  raise exception 'A character changes owner only by being claimed' using errcode = '42501';
end;
$$;

revoke execute on function public.guard_party_member_owner() from public, anon, authenticated;

create trigger party_members_guard_owner_insert
  before insert on public.party_members
  for each row execute procedure public.guard_party_member_owner();

create trigger party_members_guard_owner_update
  before update of owner_user_id, user_id on public.party_members
  for each row when (new.owner_user_id is distinct from old.owner_user_id
                     or new.user_id is distinct from old.user_id)
  execute procedure public.guard_party_member_owner();

-- A creator's hold on a character ends when someone else owns it. The creator
-- policies asked only "did you make this row", so the DM who made a roster
-- character kept reading and writing it after its player had claimed it and
-- taken it to their pool, where it is meant to be the owner's alone. Delete
-- already had this condition; select and update now match it. While the
-- character sits at the DM's table the DM reads and writes it as the DM, which
-- is the access they are meant to have.
--
-- Nobody loses anything on the day this lands: of production's 28 characters,
-- 8 have a creator who is not the owner, and all 8 are seated at a table the
-- creator is the DM of (2 Oct 2026).
drop policy party_members_creator_select on public.party_members;
create policy party_members_creator_select on public.party_members
  for select
  using ((select auth.uid()) = user_id
         and (owner_user_id is null or owner_user_id = (select auth.uid())));

drop policy party_members_creator_update on public.party_members;
create policy party_members_creator_update on public.party_members
  for update
  using ((select auth.uid()) = user_id
         and (owner_user_id is null or owner_user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id
              and (campaign_id is null or private.is_campaign_member(campaign_id)));

-- A seat points only at a character in its own campaign, for the DM too. The
-- guard that holds that line (guard_campaign_member_self_update), the attach
-- RPC and admission each carry both this migration's rule and the approval
-- gate, so each is defined once, in 20261002151708.

-- Claiming transfers ownership. A seat pointing at a character nobody owns
-- hands it to that member when the DM assigned it, or when the member made the
-- character themselves. Three things it deliberately is not:
--
--   * not for a character in another campaign (the seat guard refuses it);
--   * not for an offered character (is_dm_managed): that one stays the DM's and
--     a player takes a copy of it through assume_character();
--   * not a player linking themselves to a roster character the DM made. That
--     link has always given the player the sheet to edit, and still does; it
--     takes the DM's assignment to make it theirs to keep, and to delete.
--
-- An owned character is never re-owned: the seat link moves between a player's
-- own characters freely.
create function public.claim_party_member_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.party_members pm
     set owner_user_id = new.user_id
   where pm.id = new.party_member_id
     and pm.owner_user_id is null
     and pm.campaign_id = new.campaign_id
     and not pm.is_dm_managed
     and (pm.user_id = new.user_id or private.is_campaign_dm(new.campaign_id));
  return null;
end;
$$;

revoke execute on function public.claim_party_member_on_link() from public, anon, authenticated;

create trigger campaign_members_claim_character
  after insert or update of party_member_id on public.campaign_members
  for each row when (new.party_member_id is not null)
  execute procedure public.claim_party_member_on_link();

-- ── 5. The door on attach and join ───────────────────────────────────────────

create or replace function public.join_campaign_via_invite(p_token uuid, p_party_member_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_campaign_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select campaign_id into v_campaign_id from public.campaign_invites where token = p_token;
  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  -- The character is checked up front so a bad choice is refused now, not
  -- discovered when a parent approves days later (#730's rules: the caller's
  -- own character, and not already at another table; #943: an edition the
  -- table takes).
  if p_party_member_id is not null then
    select * into v_pm from public.party_members where id = p_party_member_id;
    if not found then
      raise exception 'Character not found';
    end if;
    if v_pm.owner_user_id is distinct from v_caller then
      raise exception 'Only the character''s owner can bring it to a campaign';
    end if;
    if v_pm.campaign_id is not null and v_pm.campaign_id is distinct from v_campaign_id then
      raise exception 'Character is already in another campaign';
    end if;
    if v_pm.campaign_id is null then
      perform private.assert_ruleset_admissible(v_pm.ruleset, v_campaign_id);
    end if;
  end if;

  return private.consume_campaign_invite(p_token, v_caller, p_party_member_id, null);
end;
$function$;

-- ── 6. A campaign switch touches no character ────────────────────────────────

drop trigger campaigns_review_characters_ruleset on public.campaigns;
drop function public.review_characters_for_campaign_ruleset();

-- ── 7. ruleset_reviews belongs to the character ──────────────────────────────

alter publication supabase_realtime drop table public.ruleset_reviews;

drop trigger ruleset_reviews_signal_delete on public.ruleset_reviews;

-- Takes ruleset_reviews_campaign_idx and the campaign FK with it.
alter table public.ruleset_reviews drop column campaign_id;

-- signal_campaign_change() reads campaign_id off the changed rows, which these
-- no longer have: the campaign to ring is wherever the character sits now, and
-- nobody when it sits nowhere (its owner's own client invalidates).
create function public.signal_ruleset_review_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct pm.campaign_id, 'ruleset_reviews', now()
    from changed c
    join party_members pm on pm.id = c.party_member_id
   where pm.campaign_id is not null
     and exists (select 1 from campaigns p where p.id = pm.campaign_id)
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$;

revoke execute on function public.signal_ruleset_review_change() from public, anon, authenticated;

create trigger ruleset_reviews_signal_insert
  after insert on public.ruleset_reviews
  referencing new table as changed
  for each statement execute procedure public.signal_ruleset_review_change();

create trigger ruleset_reviews_signal_update
  after update on public.ruleset_reviews
  referencing new table as changed
  for each statement execute procedure public.signal_ruleset_review_change();

create trigger ruleset_reviews_signal_delete
  after delete on public.ruleset_reviews
  referencing old table as changed
  for each statement execute procedure public.signal_ruleset_review_change();

-- The demo copy classifies a table by whether it carries campaign_id (tier 1)
-- or hangs off a table that does (tier 2). purge_demo_campaign() deletes tier 1
-- by campaign_id, so leaving this row at tier 1 would break every demo reset
-- and every demo delete. Reviews now go with their character.
update private.demo_campaign_tables
   set tier = 2, parent_column = 'party_member_id', parent_table = 'party_members'
 where table_name = 'ruleset_reviews';

-- ── 8. Conversion ────────────────────────────────────────────────────────────

-- The body of the retired campaign trigger, keyed on one character. Not a
-- definer and not client-callable: the two RPCs below authorize, then call it.
create function private.convert_party_member_ruleset(p_party_member_id uuid, p_ruleset text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_prev text := current_setting('grimoire.pm_ruleset_transition', true);
  v_prev_limits text := current_setting('grimoire.spell_limits', true);
begin
  perform set_config('grimoire.pm_ruleset_transition', 'on', true);
  update public.party_members set ruleset = p_ruleset where id = p_party_member_id;
  perform set_config('grimoire.pm_ruleset_transition', coalesce(v_prev, ''), true);

  -- Classes: official rows follow the same-named edition record; incompatible
  -- or unmatched definitions are retained and flagged for review below.
  update public.character_classes cc set
    class_definition_id = target.id,
    class_definition_kind = 'system'
  from public.system_classes current_definition, public.system_classes target
  where cc.party_member_id = p_party_member_id
    and cc.class_definition_kind = 'system'
    and current_definition.id = cc.class_definition_id
    and target.ruleset = p_ruleset
    and target.conceptual_key = current_definition.conceptual_key
    and target.id <> cc.class_definition_id;

  -- Spells: keep the chosen concept when a unique, still-eligible counterpart
  -- exists in the new edition; never silently substitute otherwise.
  --
  -- The count limit stands down for this one statement. A conversion keeps
  -- every choice the player made, and the other edition's limit may be lower (a
  -- 2024 Sorcerer prepares more than a 2014 one knows); refusing the conversion
  -- over that would make the lower edition unreachable. The limit applies again
  -- the next time the player changes a spell.
  perform set_config('grimoire.spell_limits', 'suspended', true);
  update public.character_spells grant_row set
    spell_id = target.id
  from public.library_spells current_spell
  join public.library_spells target
    on target.conceptual_key = current_spell.conceptual_key
    and target.ruleset = p_ruleset
    and target.level = current_spell.level
  where grant_row.party_member_id = p_party_member_id
    and current_spell.id = grant_row.spell_id
    and current_spell.ruleset is distinct from p_ruleset
    and 1 = (
      select count(*) from public.library_spells candidate
      where candidate.conceptual_key = current_spell.conceptual_key
        and candidate.ruleset = p_ruleset
        and candidate.level = current_spell.level
    )
    and (
      grant_row.source_type <> 'class'
      or grant_row.always_prepared
      or exists (
        select 1 from public.character_classes source_class
        where source_class.id = grant_row.source_class_id
          and source_class.class_name = any(coalesce(target.classes, '{}'::text[]))
      )
    )
    and not exists (
      select 1 from public.character_spells duplicate
      where duplicate.party_member_id = grant_row.party_member_id
        and duplicate.spell_id = target.id
        and duplicate.source_type = grant_row.source_type
        and coalesce(duplicate.source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(grant_row.source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and duplicate.id <> grant_row.id
    );
  perform set_config('grimoire.spell_limits', coalesce(v_prev_limits, ''), true);

  -- Recompute this character's review rows from scratch.
  delete from public.ruleset_reviews where party_member_id = p_party_member_id;

  -- Class definitions with no valid backing in the new edition.
  insert into public.ruleset_reviews (party_member_id, flag_type, character_class_id)
  select cc.party_member_id, 'class', cc.id
  from public.character_classes cc
  where cc.party_member_id = p_party_member_id
    and case
      when cc.class_definition_kind = 'system' then
        not exists (
          select 1 from public.system_classes definition
          where definition.id = cc.class_definition_id
            and definition.ruleset = p_ruleset
        )
      else
        not exists (
          select 1 from public.custom_classes definition
          where definition.id = cc.class_definition_id
            and (definition.ruleset is null or definition.ruleset = p_ruleset)
        )
    end
  on conflict do nothing;

  -- Pinned subclasses whose definition is unavailable in the new edition.
  insert into public.ruleset_reviews (party_member_id, flag_type, character_class_id)
  select cc.party_member_id, 'subclass', cc.id
  from public.character_classes cc
  where cc.party_member_id = p_party_member_id
    and cc.subclass_definition_id is not null
    and not exists (
      select 1 from public.custom_subclasses subclass
      where subclass.id = cc.subclass_definition_id
        and (subclass.ruleset is null or subclass.ruleset = p_ruleset)
    )
  on conflict do nothing;

  -- Spells left without rules backing in the new edition.
  insert into public.ruleset_reviews (party_member_id, flag_type, character_spell_id)
  select grant_row.party_member_id, 'spell', grant_row.id
  from public.character_spells grant_row
  where grant_row.party_member_id = p_party_member_id
    and not exists (
      select 1 from public.library_spells spell
      where spell.id = grant_row.spell_id and spell.ruleset = p_ruleset
    )
    and not exists (
      select 1 from public.spells spell
      where spell.id::text = grant_row.spell_id
        and (spell.ruleset is null or spell.ruleset = p_ruleset)
    )
  on conflict do nothing;

  -- Background: moving off 2024 orphans a recorded ASI/feat choice; moving to
  -- 2024 surfaces an ASI trio the character hasn't chosen from yet.
  insert into public.ruleset_reviews (party_member_id, flag_type)
  select pm.id, 'background'
  from public.party_members pm
  where pm.id = p_party_member_id
    and p_ruleset <> '2024'
    and (pm.class_choices ? 'background_asi' or pm.class_choices ? 'background_feat_id')
  on conflict do nothing;

  insert into public.ruleset_reviews (party_member_id, flag_type)
  select pm.id, 'background'
  from public.party_members pm
  join public.backgrounds bg on bg.id = pm.background_id
  where pm.id = p_party_member_id
    and p_ruleset = '2024'
    and bg.asi_ability_trio is not null
    and not (pm.class_choices ? 'background_asi')
  on conflict do nothing;
end;
$$;

revoke execute on function private.convert_party_member_ruleset(uuid, text) from public, anon, authenticated;

-- In place. The owner, or for a character nobody owns its creator or the DM of
-- the table it sits at. Deliberately not "the DM of its table" for an owned
-- character: that is the campaign switch rewriting a player's character again
-- by another route.
create function public.convert_party_member_ruleset(p_party_member_id uuid, p_ruleset text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pm public.party_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_ruleset is null or p_ruleset not in ('2014', '2024') then
    raise exception 'Unknown ruleset';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id for update;
  if not found then
    raise exception 'Character not found';
  end if;

  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null
          and (v_pm.user_id = v_uid or private.is_campaign_dm(v_pm.campaign_id))),
    false
  ) then
    raise exception 'Only the character''s owner can change its ruleset' using errcode = '42501';
  end if;

  if v_pm.ruleset = p_ruleset then
    return;
  end if;

  -- A seated character converts only to an edition its table takes. A table
  -- switching edition may leave a character mismatched; its owner converting it
  -- INTO a mismatch would be walking round the door.
  if v_pm.campaign_id is not null then
    perform private.assert_ruleset_admissible(p_ruleset, v_pm.campaign_id);
  end if;

  perform private.convert_party_member_ruleset(p_party_member_id, p_ruleset);
end;
$$;

revoke execute on function public.convert_party_member_ruleset(uuid, text) from public, anon;
grant execute on function public.convert_party_member_ruleset(uuid, text) to authenticated, service_role;

-- A copy, converted, in the caller's pool: what the bounce offers. The original
-- is not touched. clone_party_member() authorizes (owner only).
create function public.convert_party_member_copy(p_party_member_id uuid, p_ruleset text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_id uuid;
begin
  if p_ruleset is null or p_ruleset not in ('2014', '2024') then
    raise exception 'Unknown ruleset';
  end if;
  v_new_id := public.clone_party_member(p_party_member_id);
  perform private.convert_party_member_ruleset(v_new_id, p_ruleset);
  return v_new_id;
end;
$$;

revoke execute on function public.convert_party_member_copy(uuid, text) from public, anon;
grant execute on function public.convert_party_member_copy(uuid, text) to authenticated, service_role;

-- ── 9. A copy is a whole copy ────────────────────────────────────────────────

-- clone_party_member() and assume_character() each copied a character with
-- hand-written column lists, and each list had stopped at the columns that
-- existed the day it was written. A clone lost its class and subclass
-- definition pins (so it fell back to resolving by name) and every
-- always-prepared grant came back as an ordinary pick with no casting ability.
-- An assumed character lost the same, plus weapon masteries, custom attacks and
-- its deity; its class spells still pointed at the ORIGINAL's class rows, which
-- validate_character_spell_source refuses, so an offered spellcaster could not
-- be assumed at all; and its containers still pointed at the original's items.
--
-- One routine copies the sheet now, through jsonb so a future column comes
-- along without anyone remembering, and both callers say only what differs.
-- Not a definer and not client-callable: each caller authorizes first.
create function private.copy_party_member(p_source_id uuid, p_overrides jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_new_id uuid := gen_random_uuid();
  v_class record;
  v_new_class_id uuid;
  v_class_map jsonb := '{}'::jsonb;
  v_prev_limits text := current_setting('grimoire.spell_limits', true);
begin
  insert into public.party_members
  select (jsonb_populate_record(null::public.party_members,
            to_jsonb(pm)
            || jsonb_build_object('id', v_new_id, 'created_at', now(), 'updated_at', now())
            || p_overrides)).*
    from public.party_members pm
   where pm.id = p_source_id;
  if not found then
    raise exception 'Character not found';
  end if;

  for v_class in
    select * from public.character_classes
     where party_member_id = p_source_id
     order by sort_order
  loop
    insert into public.character_classes
      (party_member_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order,
       class_definition_id, class_definition_kind, subclass_definition_id)
    values
      (v_new_id, v_class.class_name, v_class.subclass_name, v_class.levels,
       v_class.is_primary, v_class.hit_dice_used, v_class.sort_order,
       v_class.class_definition_id, v_class.class_definition_kind, v_class.subclass_definition_id)
    returning id into v_new_class_id;
    v_class_map := v_class_map
      || jsonb_build_object(v_class.id::text, v_new_class_id::text);
  end loop;

  -- A copy is not a new choice, so the count limit stands down: a character
  -- over its limit (a conversion can leave one there) must still be copyable.
  perform set_config('grimoire.spell_limits', 'suspended', true);
  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, source_class_id,
     source_type, uses_per_day, uses_remaining, resets_on, source_label,
     always_prepared, casting_ability)
  select v_new_id, cs.spell_id, cs.is_known, cs.is_prepared,
         (v_class_map ->> cs.source_class_id::text)::uuid,
         cs.source_type, cs.uses_per_day, cs.uses_remaining, cs.resets_on,
         cs.source_label, cs.always_prepared, cs.casting_ability
    from public.character_spells cs
   where cs.party_member_id = p_source_id;
  perform set_config('grimoire.spell_limits', coalesce(v_prev_limits, ''), true);

  return v_new_id;
end;
$$;

revoke execute on function private.copy_party_member(uuid, jsonb) from public, anon, authenticated;

create or replace function public.clone_party_member(p_party_member_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- Total predicate (see attach), and deliberately narrower than "owner or
  -- creator": once a player has claimed a character, nobody else — the
  -- creating DM included — may copy their sheet into another pool.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Only the character''s owner can clone it';
  end if;

  -- Into the caller's pool, unattached. Campaign-bound state does not travel.
  return private.copy_party_member(p_party_member_id, jsonb_build_object(
    'user_id', v_uid,
    'owner_user_id', v_uid,
    'is_dm_managed', false,
    'campaign_id', null,
    'name', v_pm.name || ' (copy)',
    'current_initiative', null,
    'current_location_id', null,
    'concentration', null,
    'wildshape_state', null,
    'sort_order', 0
  ));
end;
$function$;

-- A player takes an offered character: their own copy, at the same table, with
-- what it carries. The offer itself stays the DM's. The copy keeps the
-- original's ruleset, so an offer built under an edition the table no longer
-- takes is refused by the insert trigger (RS001) until the DM converts it.
create or replace function public.assume_character(p_original_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_caller        uuid := auth.uid();
  v_original      party_members%rowtype;
  v_membership    campaign_members%rowtype;
  v_new_id        uuid;
  v_item          record;
  v_new_item_id   uuid;
  v_item_map      jsonb := '{}'::jsonb;
begin
  -- Load the original character
  select * into v_original from party_members where id = p_original_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- Verify it is an unclaimed DM-managed character
  if not (v_original.is_dm_managed and v_original.owner_user_id is null) then
    raise exception 'Character is not available for assumption';
  end if;

  -- Verify the caller is a player in the same campaign
  select * into v_membership
  from campaign_members
  where campaign_id = v_original.campaign_id
    and user_id = v_caller
    and role = 'player'
  limit 1;
  if not found then
    raise exception 'Not a campaign player';
  end if;

  -- The whole sheet, owned by the player and no longer an offer.
  v_new_id := private.copy_party_member(p_original_id, jsonb_build_object(
    'owner_user_id', v_caller,
    'is_dm_managed', false
  ));

  -- What it carries, with containers re-pointed at the copies. A container the
  -- original does not itself carry is not copied, so its contents come loose.
  for v_item in
    select * from party_inventory where carried_by = p_original_id
  loop
    v_new_item_id := gen_random_uuid();
    insert into party_inventory
    select (jsonb_populate_record(null::party_inventory,
              to_jsonb(v_item) || jsonb_build_object(
                'id', v_new_item_id, 'carried_by', v_new_id,
                'container_id', null, 'updated_at', now()))).*;
    v_item_map := v_item_map || jsonb_build_object(v_item.id::text, v_new_item_id::text);
  end loop;

  update party_inventory copy
     set container_id = (v_item_map ->> source.container_id::text)::uuid
    from party_inventory source
   where source.carried_by = p_original_id
     and source.container_id is not null
     and v_item_map ? source.container_id::text
     and copy.id = (v_item_map ->> source.id::text)::uuid;

  -- Set the new character as the player's active character
  update campaign_members
  set party_member_id = v_new_id
  where id = v_membership.id;

  return v_new_id;
end;
$function$;

-- ── 10. The spell count limit can stand down ─────────────────────────────────

-- Unchanged apart from v_enforce. Only the two count checks are skipped while
-- `grimoire.spell_limits` is 'suspended' (a conversion and a clone raise it for
-- their own spell statement); the rest of the trigger still runs, including the
-- 2024 rule that a known spell is a prepared one.
CREATE OR REPLACE FUNCTION public.validate_character_spell_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_prepared_ability text;
  v_prepared_divisor integer;
  v_spell_level integer;
  v_limit integer;
  v_existing integer;
  v_score integer;
  v_enforce boolean := current_setting('grimoire.spell_limits', true) is distinct from 'suspended';
begin
  if new.source_type <> 'class' or new.always_prepared then return new; end if;
  select * into strict v_class from public.character_classes where id = new.source_class_id;
  select * into strict v_member from public.party_members where id = new.party_member_id;
  v_spell_level := public.character_spell_level(new.spell_id);

  if v_class.class_definition_kind = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 then
      v_limit := v_policy.cantrip_limit[least(v_class.levels, 20)];
    else
      v_limit := v_policy.prepared_limit[least(v_class.levels, 20)];
      if v_policy.caster_type <> 'spellbook' then new.is_prepared := true; end if;
      if v_policy.caster_type = 'spellbook' and not new.is_prepared then return new; end if;
    end if;
    if v_limit is null then return new; end if;
    select count(*) into v_existing from public.character_spells existing
    where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
      and existing.source_type = 'class' and not existing.always_prepared
      and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
        or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
      and (v_spell_level = 0 or v_policy.caster_type <> 'spellbook' or existing.is_prepared)
      and existing.id is distinct from new.id;
    if v_enforce and v_existing >= v_limit then
      raise exception '% can prepare at most % % at class level %', v_class.class_name, v_limit,
        case when v_spell_level = 0 then 'cantrips' else 'spells' end, v_class.levels;
    end if;
    return new;
  end if;

  if v_class.class_definition_kind = 'system' then
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.system_classes where class_name = v_class.class_name
      and id = v_class.class_definition_id limit 1;
  else
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.custom_classes where id = v_class.class_definition_id;
  end if;
  if v_spell_level = 0 then
    v_limit := v_cantrips_known[least(v_class.levels, 20)];
  elsif v_caster_type = 'known' then
    v_limit := nullif(v_spells_known ->> (least(v_class.levels, 20) - 1), '')::integer;
  elsif new.is_prepared and v_caster_type in ('prepared', 'spellbook') then
    v_score := case v_prepared_ability when 'int' then v_member."int" when 'wis' then v_member.wis
      when 'cha' then v_member.cha else 10 end;
    v_limit := greatest(1, floor((v_score - 10)::numeric / 2)::integer
      + floor(v_class.levels::numeric / greatest(coalesce(v_prepared_divisor, 1), 1))::integer);
  else
    return new;
  end if;
  if v_limit is null then return new; end if;
  select count(*) into v_existing from public.character_spells existing
  where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
    and existing.source_type = 'class' and not existing.always_prepared
    and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
      or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
    and (v_spell_level = 0 or v_caster_type = 'known' or existing.is_prepared)
    and existing.id is distinct from new.id;
  if v_enforce and v_existing >= v_limit then raise exception '% spell limit of % reached', v_class.class_name, v_limit; end if;
  return new;
end;
$function$;
