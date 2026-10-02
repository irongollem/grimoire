-- Epic #943, wave 5: a character's class has one shape.
--
-- It had three. A class could be free text on the character
-- (party_members.class / .subclass), a character_classes row that carried only
-- a name, or a character_classes row pinned to a definition. All three were
-- still being written: the wizard wrote the first and the third, level-up and
-- de-level kept the text in step by hand, a character built with a typed class
-- got a name-only row the first time it levelled up, an import could strip a
-- row's pin, and the MCP tool made characters with text and no row at all.
-- Everything that reads a class had to cope with each: a fallback in the
-- tracker, the sheet, the spell page and the rest buttons, and (after the
-- review of PR #948) a rule in the approval gate for what a bare name stands
-- for on its owner's screen.
--
-- There is now one: a character's classes are its character_classes rows, and
-- every row is pinned to a definition. A subclass is a definition too. What a
-- class can be given later (art, more of its own rules) has one place to live.
--
--   * party_members.class / .subclass stay, because some fifty screens read
--     them, but as a mirror the database keeps: the primary class row's names.
--     A client's write to them is overwritten. Nothing keeps them in step by
--     hand any more.
--   * A character with no class rows has no class. That is a valid state (a
--     character before its first class), and its mirror is null.
--   * A typed class that named nothing real becomes something real: an empty
--     class, or subclass, of that name in its table's own content, for the DM
--     to fill in. Nothing a player or DM typed is lost.
--
-- Existing rows are migrated here, not accommodated. Read-only against
-- production on 2 Oct 2026: 28 characters; 23 with class rows, every one
-- pinned; 4 with a typed official class and no row (they get one); 1 with no
-- class at all (stays so); 8 subclasses known only by name, of which 5 match a
-- subclass their table has and 3 get an empty one made. Typed text and rows
-- disagreed nowhere.
--
-- Runs after 20261002132454 (it needs a character's own edition to choose the
-- right official class) and after 20261002132455 (whose review it stands down
-- while it works, and whose grandfathering it performs at the end).

-- ── 1. Every typed class becomes a pinned row ────────────────────────────────

-- The demo template is copied, live, into every account that loads the demo,
-- and the copy carries only what belongs to the template campaign itself
-- (copy_demo_template collects by campaign_id). A template character pinned to
-- one of its author's general definitions would make that copy fail for every
-- new user: the pin would name a row the loader cannot use. So in the template
-- a matched definition that lives outside the campaign is brought into it, and
-- the character is pinned to that. Book keys are not carried: an account holds
-- one row per pair of keys.
create function pg_temp.definition_in_campaign(p_table text, p_id uuid, p_campaign_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_row jsonb;
  v_new uuid := gen_random_uuid();
begin
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table) into v_row using p_id;
  v_row := v_row || jsonb_build_object(
    'id', v_new, 'campaign_id', p_campaign_id, 'created_at', now(), 'updated_at', now(),
    'source_document_key', null, 'source_record_key', null,
    'provenance', coalesce(nullif(v_row -> 'provenance', 'null'::jsonb), '{}'::jsonb)
                  || jsonb_build_object('backfilled_copy_of', p_id::text));
  execute format('insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).*', p_table, p_table)
    using v_row;
  return v_new;
end;
$$;

-- A backfilled row is not a class the character just took, so it opens no
-- spell-change window.
alter table public.character_classes disable trigger character_classes_open_spell_window;

do $$
declare
  r record;
  v_definition_id uuid;
  v_kind text;
  v_class_name text;
begin
  -- The content review (20261002132455) stands down: these writes change no
  -- choice anyone made. Every seated character is reviewed once at the end.
  perform set_config('grimoire.content_review', 'running', true);

  for r in
    select pm.id, btrim(pm.class) as class, nullif(btrim(pm.subclass), '') as subclass,
           pm.level, pm.hit_dice_remaining, pm.ruleset, pm.campaign_id, pm.user_id, pm.owner_user_id,
           (select c.user_id from public.campaigns c where c.id = pm.campaign_id) as campaign_owner,
           coalesce((select c.demo_template from public.campaigns c where c.id = pm.campaign_id), false) as in_template
      from public.party_members pm
     where nullif(btrim(pm.class), '') is not null
       and not exists (select 1 from public.character_classes cc where cc.party_member_id = pm.id)
  loop
    v_definition_id := null;

    -- The official class of that name, in the character's own edition.
    select sc.id, sc.class_name, 'system' into v_definition_id, v_class_name, v_kind
      from public.system_classes sc
     where sc.ruleset = r.ruleset and lower(sc.class_name) = lower(r.class);

    -- Else a class of that name the character may be pinned to: its table's,
    -- or its creator's or owner's own (the same reach as
    -- validate_character_class_definition).
    if v_definition_id is null then
      select d.id, d.class_name, 'custom' into v_definition_id, v_class_name, v_kind
        from public.custom_classes d
       where lower(d.class_name) = lower(r.class)
         and (d.ruleset is null or d.ruleset = r.ruleset)
         and (d.campaign_id = r.campaign_id
              or (d.campaign_id is null and d.user_id in (r.user_id, r.owner_user_id)))
       order by (d.campaign_id is not null) desc, d.created_at, d.id
       limit 1;
      if v_definition_id is not null and r.in_template
         and (select d.campaign_id from public.custom_classes d where d.id = v_definition_id) is null then
        v_definition_id := pg_temp.definition_in_campaign('custom_classes', v_definition_id, r.campaign_id);
      end if;
    end if;

    -- Else the name was only ever a label. It becomes an empty class of that
    -- name in the table's own content (the character's own, with no table).
    if v_definition_id is null then
      insert into public.custom_classes (user_id, campaign_id, class_name, ruleset, provenance)
      values (coalesce(r.campaign_owner, r.owner_user_id, r.user_id), r.campaign_id, r.class, r.ruleset,
              jsonb_build_object('backfilled_from', 'typed_class'))
      returning id, class_name, 'custom' into v_definition_id, v_class_name, v_kind;
    end if;

    insert into public.character_classes
      (party_member_id, class_name, class_definition_id, class_definition_kind,
       subclass_name, levels, is_primary, hit_dice_used, sort_order)
    values
      (r.id, v_class_name, v_definition_id, v_kind, r.subclass,
       least(greatest(r.level, 1), 20), true,
       -- Hit dice were counted on the character while it had no class row.
       greatest(least(greatest(r.level, 1), 20) - coalesce(r.hit_dice_remaining, r.level), 0), 0);
  end loop;
end;
$$;

alter table public.character_classes enable trigger character_classes_open_spell_window;

-- ── 2. Every subclass becomes a pinned definition ────────────────────────────

do $$
declare
  r record;
  v_definition_id uuid;
  v_subclass_name text;
begin
  perform set_config('grimoire.content_review', 'running', true);

  for r in
    select cc.id, cc.class_name, cc.subclass_name, pm.ruleset, pm.campaign_id, pm.user_id, pm.owner_user_id,
           (select c.user_id from public.campaigns c where c.id = pm.campaign_id) as campaign_owner,
           coalesce((select c.demo_template from public.campaigns c where c.id = pm.campaign_id), false) as in_template
      from public.character_classes cc
      join public.party_members pm on pm.id = cc.party_member_id
     where cc.subclass_name is not null and cc.subclass_definition_id is null
  loop
    v_definition_id := null;

    -- A subclass of that name the character may be pinned to (the same reach
    -- as validate_character_subclass_definition, which compares the class name
    -- exactly).
    select d.id, d.subclass_name into v_definition_id, v_subclass_name
      from public.custom_subclasses d
     where d.class_name = r.class_name
       and lower(d.subclass_name) = lower(r.subclass_name)
       and (d.ruleset is null or d.ruleset = r.ruleset)
       and (d.campaign_id = r.campaign_id
            or (d.campaign_id is null and d.user_id in (r.user_id, r.owner_user_id)))
     order by (d.campaign_id is not null) desc, d.created_at, d.id
     limit 1;
    if v_definition_id is not null and r.in_template
       and (select d.campaign_id from public.custom_subclasses d where d.id = v_definition_id) is null then
      v_definition_id := pg_temp.definition_in_campaign('custom_subclasses', v_definition_id, r.campaign_id);
    end if;

    if v_definition_id is null then
      insert into public.custom_subclasses (user_id, campaign_id, class_name, subclass_name, ruleset, provenance)
      values (coalesce(r.campaign_owner, r.owner_user_id, r.user_id), r.campaign_id, r.class_name, r.subclass_name,
              r.ruleset, jsonb_build_object('backfilled_from', 'typed_subclass'))
      returning id, subclass_name into v_definition_id, v_subclass_name;
    end if;

    update public.character_classes
       set subclass_definition_id = v_definition_id, subclass_name = v_subclass_name
     where id = r.id;
  end loop;

  perform set_config('grimoire.content_review', '', true);
end;
$$;

-- ── 3. The old shapes cannot come back ───────────────────────────────────────

alter table public.character_classes
  alter column class_definition_id set not null,
  alter column class_definition_kind set not null,
  drop constraint character_classes_definition_pair_check,
  drop constraint character_classes_definition_kind_check,
  add constraint character_classes_definition_kind_check
    check (class_definition_kind in ('system', 'custom')),
  add constraint character_classes_subclass_pair_check
    check ((subclass_name is null) = (subclass_definition_id is null));

-- ── 4. The typed columns are a mirror the database keeps ─────────────────────

-- party_members.class / .subclass are the primary class row's names, and null
-- for a character with no class. Computed in one place, here, whoever writes.
--
-- Definers, because the answer must not depend on what the writer may read: a
-- caller who may update a character but could not see its class rows would
-- otherwise blank its class.
create function public.mirror_party_member_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select cc.class_name, cc.subclass_name into new.class, new.subclass
    from public.character_classes cc
   where cc.party_member_id = new.id
   order by cc.is_primary desc, cc.sort_order, cc.created_at, cc.id
   limit 1;
  if not found then
    new.class := null;
    new.subclass := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.mirror_party_member_class() from public, anon, authenticated;

-- On insert a character has no class rows yet, so whatever was sent is cleared.
create trigger party_members_mirror_class_insert
  before insert on public.party_members
  for each row execute procedure public.mirror_party_member_class();

-- On update only when a statement names the columns, so an HP change does not
-- pay for a lookup.
create trigger party_members_mirror_class_update
  before update of class, subclass on public.party_members
  for each row execute procedure public.mirror_party_member_class();

-- A change to a character's class rows refreshes its mirror by naming the
-- column, which runs the trigger above.
create function public.refresh_party_member_class_mirror()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.party_members set class = class where id = old.party_member_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.party_members set class = class where id = new.party_member_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.refresh_party_member_class_mirror() from public, anon, authenticated;

create trigger character_classes_refresh_mirror
  after insert or delete or update of party_member_id, class_name, subclass_name, is_primary, sort_order
  on public.character_classes
  for each row execute procedure public.refresh_party_member_class_mirror();

-- Bring every existing character's mirror in line once.
update public.party_members set class = class;

-- ── 5. A Sorcerer is a Sorcerer by its class row ─────────────────────────────

-- The last reader of the typed class in the database: it counted a character
-- with class = 'Sorcerer' and no rows as a Sorcerer of its whole level. Every
-- such character has a row now.
create or replace function public.sorcerer_level(p_member public.party_members)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select cc.levels from public.character_classes cc
      where cc.party_member_id = p_member.id
        and cc.class_name = 'Sorcerer'
        and cc.class_definition_kind = 'system'
      limit 1),
    0
  );
$function$;

-- ── 6. Characters already seated ─────────────────────────────────────────────

-- Sitting at a table before approval existed was the approval. Every choice a
-- seated character has that the predicate of 20261002132455 would not take is
-- recorded as approved for that character; nothing is copied or re-pointed.
-- Here rather than in that migration, because the class rows above are among
-- the choices. A one-time statement, not a mode of the review.
insert into public.character_content_reviews
  (campaign_id, party_member_id, kind, ref, label, reason, source_slug, source_title, status, decided_at)
select pm.campaign_id, pm.id, r.kind, r.ref, coalesce(a.label, r.ref), a.reason, a.source_slug, a.source_title,
       'approved', now()
  from public.party_members pm
  cross join lateral private.party_member_content_refs(pm.id) r
  cross join lateral private.assess_content(r.kind, r.ref, pm.campaign_id, pm.owner_user_id) a
 where pm.campaign_id is not null
   and r.ref is not null
   and not a.approved
on conflict (party_member_id, kind, ref) do nothing;
