-- Backgrounds join the shared library (epic #973, item 11).
--
-- Backgrounds join the shared library. "Shared library backgrounds, I think in our
-- migration to move every common data to a shared library we missed backgrounds"
-- (the maintainer). Species, spells, monsters and items already live in public
-- `library_*` tables that anyone reads and only an admin writes; backgrounds were
-- the last character option still copied per user. Every player's first read of
-- the picker inserted the SRD baseline into their own `backgrounds` table from
-- Open5e at runtime, so production held 105 rows, all but one an Open5e import,
-- almost all owned by a single account, with the same book entry duplicated under
-- an older document key. This is the species move (20260724000002/3, renamed
-- 20260731000002) done for backgrounds:
--
--   1. `library_backgrounds`: id is a text slug (stableSrdId of the record key, so
--      a later run of scripts/seed-library-backgrounds.ts upserts the very same
--      rows), `ruleset` NOT NULL, the (source_document_key, source_record_key)
--      pair unique, select for everyone, writes for `private.is_app_admin()`.
--      `source` and `source_document_key` are OUR slug for the book (the key in
--      `content_sources`, the one a table enables), exactly as library_monsters
--      and library_spells hold them, so enabling a book gates its backgrounds.
--   2. `party_members.background_id` becomes text and holds either a custom
--      background uuid or a library slug. The FK (ON DELETE SET NULL) is replaced
--      by an AFTER DELETE trigger on `backgrounds`.
--   3. The functions that treated a background as a uuid learn the library:
--      assess_content (the approval predicate looks a slug up in
--      library_backgrounds, like species and spells), get_character_content_item,
--      repoint_party_member_content, convert_party_member_ruleset (the 2024 ASI
--      review reads the library row's trio), transfer_campaign_ownership (a
--      library slug is shared, only a uuid is copied) and a comment in
--      remove_missing_character_content.
--   4. The data: every Open5e-imported `backgrounds` row is folded into one
--      library row per (book, edition, concept). The book is normalised to our
--      slug (a5e-ag -> a5e, tdcs -> taldorei, open5e -> o5e through
--      content_sources, and the pre-rename wotc-srd -> srd-2014), a legacy row
--      (record key `legacy:<uuid>`, left by the first importer) loses to its
--      current twin and only supplies a key when it has none, srd-2024 is 2024
--      and every other book is 5e-2014 compatible. Art the admin put on an
--      imported row is carried to the library row (the objects stay where they
--      are, in that account's folder). Every character that pointed at an
--      imported row is moved to its library twin and the imported rows are
--      deleted. Custom backgrounds, and imported rows a non-admin put art on,
--      stay in `backgrounds` with their uuid.
--
-- A character moved to a library background is reviewed at once (the review
-- triggers fire on the update): a table that has not enabled that book flags it,
-- as it does for a species or a spell from a book the table lacks.

create table if not exists public.library_backgrounds (
  id                        text primary key,
  name                      text not null,
  description               text,
  skill_proficiencies       text[] not null default '{}',
  tool_proficiencies        text[] not null default '{}',
  languages                 text[] not null default '{}',
  equipment                 text,
  feature_name              text,
  feature_description       text,
  suggested_characteristics text,
  -- 2024: the feat granted at 1st level, and the three abilities its ASI is spent on.
  feat_grant_name           text,
  feat_grant_description    text,
  asi_ability_trio          text[],
  origin_feat               jsonb,
  tags                      text[] not null default '{}',
  source                    text,
  source_title              text,
  source_url                text,
  image_url                 text,
  focal_point               jsonb,
  -- versioning/provenance, same contract as library_species.
  ruleset                   text not null,
  conceptual_key            text,
  source_document_key       text not null,
  source_record_key         text not null,
  source_revision           text,
  source_license            text,
  provenance                jsonb not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint library_backgrounds_ruleset_check check (ruleset in ('2014', '2024')),
  constraint library_backgrounds_asi_ability_trio_check check (
    asi_ability_trio is null
    or (array_length(asi_ability_trio, 1) = 3
        and asi_ability_trio <@ array['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']))
);

create unique index library_backgrounds_source_identity_unique
  on public.library_backgrounds (source_document_key, source_record_key);
create index library_backgrounds_ruleset_concept_idx
  on public.library_backgrounds (ruleset, conceptual_key);
create index library_backgrounds_source_idx
  on public.library_backgrounds (source, ruleset);

alter table public.library_backgrounds enable row level security;

create policy "library_backgrounds_select" on public.library_backgrounds
  for select using (true);
create policy "library_backgrounds_insert" on public.library_backgrounds
  for insert with check (private.is_app_admin());
create policy "library_backgrounds_update" on public.library_backgrounds
  for update using (private.is_app_admin());
create policy "library_backgrounds_delete" on public.library_backgrounds
  for delete using (private.is_app_admin());

create trigger library_backgrounds_updated_at
  before update on public.library_backgrounds
  for each row execute procedure update_updated_at();

-- ── party_members.background_id: a custom uuid or a library slug ─────────────

alter table public.party_members
  drop constraint if exists party_members_background_id_fkey;
-- The review trigger names the column in its WHEN clause, which Postgres will not
-- retype underneath; it is recreated exactly as it was.
drop trigger party_members_review_content_update on public.party_members;
alter table public.party_members
  alter column background_id type text using background_id::text;
create trigger party_members_review_content_update
  after update on public.party_members
  for each row when (
    new.campaign_id is distinct from old.campaign_id
    or new.owner_user_id is distinct from old.owner_user_id
    or new.species_id is distinct from old.species_id
    or new.background_id is distinct from old.background_id
    or (new.class_choices -> 'feats') is distinct from (old.class_choices -> 'feats')
    or new.level_choices is distinct from old.level_choices)
  execute procedure public.review_content_of_party_member();

-- Replaces the former ON DELETE SET NULL. Library rows are admin-managed and not
-- deleted in normal operation, so they get no trigger.
create or replace function public.cleanup_background_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update party_members
  set background_id = null
  where background_id = old.id::text;
  return old;
end;
$$;

revoke execute on function public.cleanup_background_references() from public, anon, authenticated;

create trigger backgrounds_cleanup_references
  after delete on public.backgrounds
  for each row execute procedure cleanup_background_references();

-- ── functions that held a background to be a uuid ────────────────────────────

CREATE OR REPLACE FUNCTION private.assess_content(p_kind text, p_ref text, p_campaign_id uuid, p_character_owner uuid, OUT approved boolean, OUT reason text, OUT label text, OUT source_slug text, OUT source_title text, OUT repoint_to uuid)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_uuid uuid;
  v_owner uuid;
  v_row_campaign uuid;
  v_document_key text;
  v_record_key text;
  v_ruleset text;
  v_found boolean := false;
  v_system boolean := false;
  v_blocked boolean := false;
begin
  approved := true;

  if p_kind = 'class' and p_ref like 'system:%' then
    label := substr(p_ref, 8);
    -- By name, and a name is not a different class for being typed in another case.
    if exists (
      select 1 from public.campaigns c, unnest(coalesce(c.disabled_class_names, '{}')) as blocked(name)
       where c.id = p_campaign_id and lower(blocked.name) = lower(label)
    ) then
      approved := false;
      reason := 'blocked';
    end if;
    return;
  end if;

  if p_kind = 'species' then
    v_blocked := exists (
      select 1 from public.campaigns c
       where c.id = p_campaign_id and p_ref = any(coalesce(c.disabled_species_ids, '{}')));
  end if;

  -- Library rows: public, shared, admin-written, tagged with their book. A slug
  -- the library does not know is nothing a client could have created, so it is
  -- left alone.
  v_uuid := private.try_uuid(p_ref);
  if v_uuid is null then
    if p_kind = 'species' then
      select ls.name, ls.source, ls.source_title into label, source_slug, source_title
        from public.library_species ls where ls.id = p_ref;
      v_found := found;
    elsif p_kind = 'background' then
      select lb.name, lb.source, lb.source_title into label, source_slug, source_title
        from public.library_backgrounds lb where lb.id = p_ref;
      v_found := found;
    elsif p_kind = 'spell' then
      select ls.name, ls.source, ls.source_title into label, source_slug, source_title
        from public.library_spells ls where ls.id = p_ref;
      v_found := found;
    end if;
    if not v_found then
      return;
    end if;
    if v_blocked then
      approved := false;
      reason := 'blocked';
    elsif not private.source_enabled(p_campaign_id, source_slug) then
      approved := false;
      reason := 'source';
    end if;
    return;
  end if;

  -- Rows somebody owns.
  case p_kind
    when 'species' then
      select s.name, s.user_id, s.campaign_id, s.source_document_key, s.source_record_key, s.ruleset
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset
        from public.species s where s.id = v_uuid;
      v_found := found;
    when 'background' then
      select b.name, b.user_id, null::uuid, b.source_document_key, b.source_record_key, b.ruleset
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset
        from public.backgrounds b where b.id = v_uuid;
      v_found := found;
    when 'class' then
      select c.class_name, c.user_id, c.campaign_id, c.source_document_key, c.source_record_key, c.ruleset
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset
        from public.custom_classes c where c.id = v_uuid;
      v_found := found;
    when 'subclass' then
      select c.subclass_name, c.user_id, c.campaign_id, c.source_document_key, c.source_record_key, c.ruleset
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset
        from public.custom_subclasses c where c.id = v_uuid;
      v_found := found;
    when 'spell' then
      select s.name, s.user_id, s.campaign_id, s.source_document_key, s.source_record_key, s.ruleset
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset
        from public.spells s where s.id = v_uuid;
      v_found := found;
    when 'feat' then
      select f.name, f.user_id, f.campaign_id, f.source_document_key, f.source_record_key, f.ruleset, f.user_id is null
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_system
        from public.class_features f where f.id = v_uuid;
      v_found := found;
    else
      raise exception 'Unknown content kind %', p_kind;
  end case;

  if not v_found then
    approved := false;
    reason := 'missing';
    label := 'Something that no longer exists';
    return;
  end if;

  if v_system then
    return;
  end if;

  -- The table's own: a DM of this table owns it, and it is not kept for another
  -- campaign of theirs.
  if private.is_table_dm(p_campaign_id, v_owner)
     and (v_row_campaign is null or v_row_campaign = p_campaign_id) then
    if v_blocked then
      approved := false;
      reason := 'blocked';
    end if;
    return;
  end if;

  approved := false;
  repoint_to := private.table_book_entry(p_kind, p_campaign_id, v_document_key, v_record_key, v_ruleset);

  -- "The character's owner" is whoever owns the character, and nobody when
  -- nobody does. It is never the row's creator standing in: a DM may create a
  -- roster character, and a creator that could be read as an owner would let
  -- that DM make any account the "owner" and read or copy that account's
  -- content through a flag.
  if p_character_owner is not null and v_owner = p_character_owner then
    reason := 'homebrew';
  else
    reason := 'foreign';
    label := 'Content from another table';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_character_content_item(p_review_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_review public.character_content_reviews%rowtype;
  v_pm public.party_members%rowtype;
  v_a record;
  v_table text;
  v_item jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_review from public.character_content_reviews where id = p_review_id;
  if not found then
    raise exception 'Nothing is waiting under that id';
  end if;

  select * into v_pm from public.party_members where id = v_review.party_member_id;
  if not coalesce(
    private.is_campaign_dm(v_review.campaign_id)
    or v_pm.owner_user_id = v_uid
    or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from private.party_member_content_refs(v_review.party_member_id) r
     where r.kind = v_review.kind and r.ref = v_review.ref
  ) then
    return null;
  end if;

  v_a := private.assess_content(v_review.kind, v_review.ref, v_review.campaign_id, v_pm.owner_user_id);
  if not v_a.approved and v_a.reason in ('foreign', 'missing') then
    return null;
  end if;

  if v_review.kind = 'class' and v_review.ref like 'system:%' then
    return jsonb_build_object('name', substr(v_review.ref, 8));
  end if;

  if private.try_uuid(v_review.ref) is not null then
    v_table := case v_review.kind
      when 'species' then 'species' when 'background' then 'backgrounds'
      when 'class' then 'custom_classes' when 'subclass' then 'custom_subclasses'
      when 'spell' then 'spells' when 'feat' then 'class_features' end;
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
      into v_item using private.try_uuid(v_review.ref);
    if v_item is not null then
      v_item := v_item || jsonb_build_object(
        'seen_at', private.content_seen_at(v_review.kind, private.try_uuid(v_review.ref), v_pm.owner_user_id),
        'nested_features', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'level', n.lvl, 'name', f.name, 'description', f.description)
                   order by nullif(left(regexp_replace(n.lvl, '\D', '', 'g'), 4), '')::integer nulls last, f.name), '[]'::jsonb)
            from private.content_nested_refs(v_review.kind, private.try_uuid(v_review.ref)) n
            join public.class_features f on f.id = n.id
           where n.kind = 'feat'
             and (f.user_id is null or f.user_id = v_pm.owner_user_id
                  or (private.is_table_dm(v_review.campaign_id, f.user_id)
                      and (f.campaign_id is null or f.campaign_id = v_review.campaign_id)))),
        'nested_spells', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'level', n.lvl, 'name', sp.name, 'spell_level', sp.level, 'description', sp.description)
                   order by nullif(left(regexp_replace(n.lvl, '\D', '', 'g'), 4), '')::integer nulls last, sp.name), '[]'::jsonb)
            from private.content_nested_refs(v_review.kind, private.try_uuid(v_review.ref)) n
            join public.spells sp on sp.id = n.id
           where n.kind = 'spell'
             and (sp.user_id = v_pm.owner_user_id
                  or (private.is_table_dm(v_review.campaign_id, sp.user_id)
                      and (sp.campaign_id is null or sp.campaign_id = v_review.campaign_id)))));
    end if;
  else
    v_table := case v_review.kind
      when 'species' then 'library_species' when 'background' then 'library_backgrounds'
      when 'spell' then 'library_spells' end;
    if v_table is null then
      return null;
    end if;
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
      into v_item using v_review.ref;
  end if;
  -- The owner's id is not the reader's to learn from a content row.
  return v_item - 'user_id';
end;
$function$;

CREATE OR REPLACE FUNCTION private.repoint_party_member_content(p_party_member_id uuid, p_kind text, p_old text, p_new text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_prev_limits text := current_setting('grimoire.spell_limits', true);
  v_moved integer;
begin
  if p_old = p_new then
    return;
  end if;
  case p_kind
    when 'species' then
      update public.party_members set species_id = p_new
       where id = p_party_member_id and species_id = p_old;
      get diagnostics v_moved = row_count;
    when 'background' then
      update public.party_members set background_id = p_new
       where id = p_party_member_id and background_id = p_old;
      get diagnostics v_moved = row_count;
    when 'class' then
      update public.character_classes set class_definition_id = p_new::uuid, class_definition_kind = 'custom'
       where party_member_id = p_party_member_id and class_definition_id = p_old::uuid;
      get diagnostics v_moved = row_count;
    when 'subclass' then
      update public.character_classes set subclass_definition_id = p_new::uuid
       where party_member_id = p_party_member_id and subclass_definition_id = p_old::uuid;
      get diagnostics v_moved = row_count;
    when 'spell' then
      perform set_config('grimoire.spell_limits', 'suspended', true);
      update public.character_spells set spell_id = p_new
       where party_member_id = p_party_member_id and spell_id = p_old;
      get diagnostics v_moved = row_count;
      perform set_config('grimoire.spell_limits', coalesce(v_prev_limits, ''), true);
    when 'feat' then
      update public.party_members pm set
        class_choices = case
          when jsonb_typeof(pm.class_choices -> 'feats') = 'array' then
            jsonb_set(pm.class_choices, '{feats}', (
              select coalesce(jsonb_agg(case when f.id = p_old then p_new else f.id end order by f.ord), '[]'::jsonb)
                from jsonb_array_elements_text(pm.class_choices -> 'feats') with ordinality as f(id, ord)))
          else pm.class_choices end,
        level_choices = case
          when jsonb_typeof(pm.level_choices) = 'object' then (
            select coalesce(jsonb_object_agg(l.lvl,
                     case when l.entry -> 'asi' ->> 'feat_id' = p_old
                          then jsonb_set(l.entry, '{asi,feat_id}', to_jsonb(p_new))
                          else l.entry end), '{}'::jsonb)
              from jsonb_each(pm.level_choices) as l(lvl, entry))
          else pm.level_choices end
       where pm.id = p_party_member_id;
      get diagnostics v_moved = row_count;
    else
      raise exception 'Unknown content kind %', p_kind;
  end case;
  -- Its callers go on to treat the character as pointing at p_new. If nothing
  -- moved (a trigger that returned NULL would do it) that would leave the
  -- character on the original with nobody asked about it.
  if v_moved = 0 then
    raise exception 'Nothing on this character points at that';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION private.convert_party_member_ruleset(p_party_member_id uuid, p_ruleset text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  left join public.backgrounds bg on bg.id::text = pm.background_id
  left join public.library_backgrounds lbg on lbg.id = pm.background_id
  where pm.id = p_party_member_id
    and p_ruleset = '2024'
    and coalesce(bg.asi_ability_trio, lbg.asi_ability_trio) is not null
    and not (pm.class_choices ? 'background_asi')
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_missing_character_content(p_review_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_review public.character_content_reviews%rowtype;
  v_pm public.party_members%rowtype;
  v_a record;
  v_pending integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_review from public.character_content_reviews where id = p_review_id for update;
  if not found then
    raise exception 'Nothing is waiting under that id';
  end if;

  select * into v_pm from public.party_members where id = v_review.party_member_id;
  if not coalesce(
    private.is_campaign_dm(v_review.campaign_id)
    or v_pm.owner_user_id = v_uid
    or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_a := private.assess_content(v_review.kind, v_review.ref, v_review.campaign_id, v_pm.owner_user_id);
  if v_a.approved or v_a.reason <> 'missing' then
    raise exception 'Only a choice that no longer exists can be removed this way';
  end if;

  case v_review.kind
    when 'species' then
      update public.party_members set species_id = null
       where id = v_review.party_member_id and species_id = v_review.ref;
    when 'spell' then
      delete from public.character_spells
       where party_member_id = v_review.party_member_id and spell_id = v_review.ref;
    when 'class' then
      -- The class row goes: a class is its definition, and this one has none
      -- left. The character keeps its level and is without a class until it
      -- takes one. Its class spells go first: a spell learned through a class
      -- that no longer exists has no source, and the foreign key's SET NULL on
      -- the row's delete would make the spell triggers raise on a class they
      -- cannot read, leaving a flag that could be neither approved nor removed.
      delete from public.character_spells
       where party_member_id = v_review.party_member_id
         and source_class_id in (
           select cc.id from public.character_classes cc
            where cc.party_member_id = v_review.party_member_id
              and cc.class_definition_id = private.try_uuid(v_review.ref));
      delete from public.character_classes
       where party_member_id = v_review.party_member_id
         and class_definition_id = private.try_uuid(v_review.ref);
    when 'subclass' then
      update public.character_classes
         set subclass_definition_id = null, subclass_name = null
       where party_member_id = v_review.party_member_id
         and subclass_definition_id = private.try_uuid(v_review.ref);
    when 'feat' then
      update public.party_members pm set
        class_choices = case
          when jsonb_typeof(pm.class_choices -> 'feats') = 'array' then
            jsonb_set(pm.class_choices, '{feats}', (
              select coalesce(jsonb_agg(f.id order by f.ord), '[]'::jsonb)
                from jsonb_array_elements_text(pm.class_choices -> 'feats') with ordinality as f(id, ord)
               where f.id <> v_review.ref))
          else pm.class_choices end,
        level_choices = case
          when jsonb_typeof(pm.level_choices) = 'object' then (
            select coalesce(jsonb_object_agg(l.lvl,
                     case when l.entry -> 'asi' ->> 'feat_id' = v_review.ref
                          then l.entry #- '{asi,feat_id}' else l.entry end), '{}'::jsonb)
              from jsonb_each(pm.level_choices) as l(lvl, entry))
          else pm.level_choices end
       where pm.id = v_review.party_member_id;
    else
      -- A background is never missing: one somebody owns is cleared from the
      -- character by cleanup_background_references when its row goes, and a
      -- library background is not deleted in normal operation.
      raise exception 'Nothing to remove for this kind';
  end case;

  v_pending := private.review_party_member_content(v_review.party_member_id);
  perform private.seat_cleared_party_member(v_review.party_member_id);
  return v_pending;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_campaign_ownership(p_campaign_id uuid, p_new_owner_id uuid, p_leave_campaign boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_new_role  text;
  v_monsters  jsonb := '{}'::jsonb;  -- old id (text) -> new id (text)
  v_traps     jsonb := '{}'::jsonb;
  v_bgs       jsonb := '{}'::jsonb;
  v_docs      jsonb := '{}'::jsonb;
  v_items     jsonb := '{}'::jsonb;  -- (#733)
  v_npcs      jsonb := '{}'::jsonb;  -- (#733)
  v_factions  jsonb := '{}'::jsonb;  -- (#733)
  v_locations jsonb := '{}'::jsonb;  -- (#733)
  v_new       uuid;
  r           record;
begin
  -- ── Authorization ─────────────────────────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS, so identity is re-derived from auth.uid() and
  -- never taken from a caller-supplied id.
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner from public.campaigns where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Only the campaign owner can transfer it';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'You already own this campaign';
  end if;

  -- The recipient must already be a member. That is the consent step: a campaign
  -- can only be handed to someone who chose to join it via an invite link, never
  -- pushed onto an arbitrary account id.
  select role into v_new_role
  from public.campaign_members
  where campaign_id = p_campaign_id and user_id = p_new_owner_id;

  if v_new_role is null then
    raise exception 'The new owner must already be a member of this campaign';
  end if;

  -- ── 1. Clone the personal-library rows the campaign hydrates from ─────────
  perform set_config('grimoire.bypass_quota', 'on', true);

  -- monsters: referenced by encounters (blueprint combatants and spawn events),
  -- NPC stat-block links, the campaign bestiary, pinned wildshape forms,
  -- companions, live wildshape state, the campaign's monster exclusions, and
  -- (#630) quest_refs / quest_beat_attachments. The union that used to live
  -- inline here moved to private.campaign_referenced_monster_ids, shared with
  -- the scoped-copy wrapper's exclusion set so the two cannot drift again.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.id in (select private.campaign_referenced_monster_ids(p_campaign_id))
  loop
    v_new := gen_random_uuid();
    insert into public.monsters
    select (jsonb_populate_record(
              null::public.monsters,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_monsters := v_monsters || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- traps: referenced by encounters.trap_ids (uuid[], no FK). Union moved to
  -- private.campaign_referenced_trap_ids (#630) -- same sharing rationale as
  -- the monster loop above.
  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.id in (select private.campaign_referenced_trap_ids(p_campaign_id))
  loop
    v_new := gen_random_uuid();
    insert into public.traps
    select (jsonb_populate_record(
              null::public.traps,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_traps := v_traps || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- backgrounds: character sheets resolve their origin features through
  -- party_members.background_id. Library backgrounds (text slugs) are shared and
  -- stay as they are; only a uuid, the owner's own row, is copied.
  for r in
    select b.*
    from public.backgrounds b
    where b.user_id = v_owner
      and b.id::text in (
        select pm.background_id from public.party_members pm
          where pm.campaign_id = p_campaign_id and pm.background_id is not null
      )
  loop
    v_new := gen_random_uuid();
    insert into public.backgrounds
    select (jsonb_populate_record(
              null::public.backgrounds,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_bgs := v_bgs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- scriptorium_documents: NPC handouts / stat-block sheets. Self-contained rows
  -- (nothing else FKs into them), so a plain copy is a complete copy.
  -- (#733) Reachability extended with two unions: handouts attached directly
  -- to a quest beat, and the handout of a quest-referenced GLOBAL npc that the
  -- npc loop below is about to clone (that npc's own scriptorium_doc_id link
  -- must resolve for the new owner too).
  for r in
    select d.*
    from public.scriptorium_documents d
    where d.user_id = v_owner
      -- (#915) Only account-wide documents are copied. A document scoped to
      -- this campaign is the campaign's own content and moves with it below.
      and d.campaign_id is null
      and d.id in (
        select n.scriptorium_doc_id from public.npcs n
          where n.campaign_id = p_campaign_id and n.scriptorium_doc_id is not null
        union
        -- (#733) handouts attached directly to a quest beat.
        select qba.ref_id::uuid
          from public.quest_beat_attachments qba
         where qba.campaign_id = p_campaign_id
           and qba.attachment_type = 'handout'
           and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        union
        -- (#733) a quest-referenced GLOBAL npc's own handout.
        select n.scriptorium_doc_id
          from public.npcs n
         where n.campaign_id is null
           and n.user_id = v_owner
           and n.scriptorium_doc_id is not null
           and (
             exists (
               select 1 from public.quest_refs qr
               join public.quests q on q.id = qr.quest_id
               where q.campaign_id = p_campaign_id
                 and qr.ref_type = 'npc'
                 and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and qr.ref_id::uuid = n.id
             )
             or exists (
               select 1 from public.quest_beat_attachments qba
               where qba.campaign_id = p_campaign_id
                 and qba.attachment_type = 'npc'
                 and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and qba.ref_id::uuid = n.id
             )
           )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.scriptorium_documents
    select (jsonb_populate_record(
              null::public.scriptorium_documents,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_docs := v_docs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) items: referenced by quest_refs ('item') and quest_beat_attachments
  -- ('item'). Only the outgoing DM's GLOBAL items are candidates -- campaign-
  -- scoped items already move with the campaign in step 3 below, ids intact.
  for r in
    select i.*
    from public.items i
    where i.user_id = v_owner
      and i.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'item'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = i.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'item'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = i.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.items
    select (jsonb_populate_record(
              null::public.items,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_items := v_items || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) npcs: referenced by quest_refs ('npc') and quest_beat_attachments
  -- ('npc'). A cloned npc's own linked_monster_id / scriptorium_doc_id are
  -- remapped in the second-order block below, once every map here is full.
  for r in
    select n.*
    from public.npcs n
    where n.user_id = v_owner
      and n.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'npc'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = n.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'npc'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = n.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.npcs
    select (jsonb_populate_record(
              null::public.npcs,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_npcs := v_npcs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) factions: referenced by quest_refs ('faction') and
  -- quest_beat_attachments ('faction'). Cloned SHALLOW -- faction_* junction
  -- rows (memberships, relations, deity/item/location links) are campaign
  -- relations, not part of the faction record itself, and are deliberately
  -- NOT cloned here. A campaign faction's own junction rows already travel
  -- with it via step 3 below (ids stable); a cloned GLOBAL faction starts
  -- with none, which is correct -- it never had campaign relations of its own.
  for r in
    select f.*
    from public.factions f
    where f.user_id = v_owner
      and f.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'faction'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = f.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'faction'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = f.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.factions
    select (jsonb_populate_record(
              null::public.factions,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_factions := v_factions || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733, rewritten by #797) locations: referenced by quest_refs ('location')
  -- and by quest_beats.staged_at_location_id -- the place a beat happens at.
  -- This used to chase a beat attachment's ref_id and the room id array beside
  -- it; both went when staging became a column, so a beat now names exactly one
  -- place and the sweep is one predicate instead of two. A cloned location's
  -- own parent_id / source_map_id are handled in the second-order block below.
  for r in
    select l.*
    from public.locations l
    where l.user_id = v_owner
      and l.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'location'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = l.id
        )
        or exists (
          -- A staged place AND everything under it. The old attachment cloned
          -- rooms because metadata->'room_ids' happened to list them, which
          -- meant a room the DM forgot to list stayed behind. Staging names the
          -- site, so the site's rooms follow by descent — a dungeon that
          -- arrives without its rooms is not a dungeon.
          --
          -- No uuid-shape regex here, unlike the quest_refs arm above: ref_id is
          -- untyped text, while staged_at_location_id is a uuid column with a
          -- foreign key behind it.
          with recursive staged as (
            select qb.staged_at_location_id as id
              from public.quest_beats qb
             where qb.campaign_id = p_campaign_id
               and qb.staged_at_location_id is not null
            union
            select c.id
              from public.locations c
              join staged s on c.parent_id = s.id
          )
          select 1 from staged where staged.id = l.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.locations
    select (jsonb_populate_record(
              null::public.locations,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_locations := v_locations || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- ── Second-order remaps within the newly cloned rows ───────────────────────
  -- (#733) A clone's own FK columns may point at ANOTHER row that was ALSO
  -- cloned in this same transaction (a cloned npc's linked_monster_id /
  -- scriptorium_doc_id, or a cloned location's parent_id pointing at another
  -- cloned location). Every map above is fully populated by this point, so
  -- these updates target the CLONE ids (v_npcs / v_locations values) --
  -- never campaign_id = p_campaign_id rows, which the step-2-style repoints
  -- below handle separately. npcs has no faction-reference column to remap.
  update public.npcs
     set linked_monster_id = (v_monsters->>linked_monster_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_npcs))
     and linked_monster_id is not null
     and v_monsters ? linked_monster_id::text;

  update public.npcs
     set scriptorium_doc_id = (v_docs->>scriptorium_doc_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_npcs))
     and scriptorium_doc_id is not null
     and v_docs ? scriptorium_doc_id::text;

  -- Cloned locations: remap parent_id clone-to-clone (a cloned room's parent
  -- may be another cloned location), then null source_map_id -- the new owner
  -- can open neither the outgoing DM's Cartographer map nor the deep-link
  -- target, same rule as the campaign-location source_map_id null-out below.
  update public.locations
     set parent_id = (v_locations->>parent_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_locations))
     and parent_id is not null
     and v_locations ? parent_id::text;

  update public.locations
     set source_map_id = null
   where id in (select value::uuid from jsonb_each_text(v_locations))
     and source_map_id is not null;

  -- ── 2. Repoint the campaign's references at the clones ────────────────────

  -- Plain FK columns.
  update public.npcs
     set linked_monster_id = (v_monsters->>linked_monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and linked_monster_id is not null
     and v_monsters ? linked_monster_id::text;

  update public.discovered_monsters
     set monster_id = (v_monsters->>monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and monster_id is not null
     and v_monsters ? monster_id::text;

  update public.pinned_forms
     set monster_id = (v_monsters->>monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and monster_id is not null
     and v_monsters ? monster_id::text;

  -- text column, so no cast on either side.
  update public.companions
     set source_monster_id = v_monsters->>source_monster_id
   where campaign_id = p_campaign_id
     and source_monster_id is not null
     and v_monsters ? source_monster_id;

  update public.party_members
     set background_id = v_bgs->>background_id
   where campaign_id = p_campaign_id
     and background_id is not null
     and v_bgs ? background_id::text;

  update public.npcs
     set scriptorium_doc_id = (v_docs->>scriptorium_doc_id::text)::uuid
   where campaign_id = p_campaign_id
     and scriptorium_doc_id is not null
     and v_docs ? scriptorium_doc_id::text;

  -- (#733) Every remaining campaign-content FK column that can hold an
  -- npc/item/faction/location id, found by enumerating information_schema
  -- for foreign keys targeting those four tables (see the migration's own
  -- report for the full accept/reject list). Same guarded-repoint shape as
  -- the plain FK columns above: touch only campaign rows, only non-null
  -- values, only when the value is actually a key in the relevant map.
  update public.companions
     set source_npc_id = (v_npcs->>source_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and source_npc_id is not null
     and v_npcs ? source_npc_id::text;

  update public.calendar_events
     set linked_location_id = (v_locations->>linked_location_id::text)::uuid
   where campaign_id = p_campaign_id
     and linked_location_id is not null
     and v_locations ? linked_location_id::text;

  update public.campaigns
     set current_location_id = (v_locations->>current_location_id::text)::uuid
   where id = p_campaign_id
     and current_location_id is not null
     and v_locations ? current_location_id::text;

  update public.encounters
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.locations
     set npc_owner_id = (v_npcs->>npc_owner_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_owner_id is not null
     and v_npcs ? npc_owner_id::text;

  -- Campaign locations only -- distinct from the clone-to-clone parent_id
  -- remap in the second-order block above, which targets the fresh clones.
  update public.locations
     set parent_id = (v_locations->>parent_id::text)::uuid
   where campaign_id = p_campaign_id
     and parent_id is not null
     and v_locations ? parent_id::text;

  update public.npc_inventory
     set item_id = (v_items->>item_id::text)::uuid
   where campaign_id = p_campaign_id
     and item_id is not null
     and v_items ? item_id::text;

  update public.npc_inventory
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  update public.npc_pc_notes
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  update public.npc_relationships
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  update public.npc_relationships
     set related_npc_id = (v_npcs->>related_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and related_npc_id is not null
     and v_npcs ? related_npc_id::text;

  update public.npcs
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.party_inventory
     set item_id = (v_items->>item_id::text)::uuid
   where campaign_id = p_campaign_id
     and item_id is not null
     and v_items ? item_id::text;

  update public.party_members
     set current_location_id = (v_locations->>current_location_id::text)::uuid
   where campaign_id = p_campaign_id
     and current_location_id is not null
     and v_locations ? current_location_id::text;

  update public.puzzle_rooms
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.quests
     set giver_npc_id = (v_npcs->>giver_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and giver_npc_id is not null
     and v_npcs ? giver_npc_id::text;

  update public.quests
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  -- FK children reachable only through a campaign-scoped parent -- same join
  -- shape as the ownership updates for these same tables in step 3 below.
  update public.crafting_recipe_ingredients ci
     set item_id = (v_items->>ci.item_id::text)::uuid
    from public.crafting_recipes cr
   where cr.id = ci.recipe_id
     and cr.campaign_id = p_campaign_id
     and ci.item_id is not null
     and v_items ? ci.item_id::text;

  update public.crafting_recipe_outputs co
     set item_id = (v_items->>co.item_id::text)::uuid
    from public.crafting_recipes cr
   where cr.id = co.recipe_id
     and cr.campaign_id = p_campaign_id
     and co.item_id is not null
     and v_items ? co.item_id::text;

  update public.faction_items fi
     set item_id = (v_items->>fi.item_id::text)::uuid
    from public.factions f
   where f.id = fi.faction_id
     and f.campaign_id = p_campaign_id
     and v_items ? fi.item_id::text;

  update public.faction_locations fl
     set location_id = (v_locations->>fl.location_id::text)::uuid
    from public.factions f
   where f.id = fl.faction_id
     and f.campaign_id = p_campaign_id
     and v_locations ? fl.location_id::text;

  update public.faction_npcs fn
     set npc_id = (v_npcs->>fn.npc_id::text)::uuid
    from public.factions f
   where f.id = fn.faction_id
     and f.campaign_id = p_campaign_id
     and v_npcs ? fn.npc_id::text;

  update public.faction_relations fr
     set target_faction_id = (v_factions->>fr.target_faction_id::text)::uuid
    from public.factions f
   where f.id = fr.faction_id
     and f.campaign_id = p_campaign_id
     and v_factions ? fr.target_faction_id::text;

  update public.store_items si
     set item_id = (v_items->>si.item_id::text)::uuid
    from public.locations l
   where l.id = si.location_id
     and l.campaign_id = p_campaign_id
     and v_items ? si.item_id::text;

  -- uuid[] columns -- rebuilt in place, order preserved, unmapped ids untouched.
  update public.encounters e
     set trap_ids = (
           select coalesce(array_agg(coalesce((v_traps->>u.tid::text)::uuid, u.tid) order by u.ord), '{}'::uuid[])
           from unnest(e.trap_ids) with ordinality as u(tid, ord)
         )
   where e.campaign_id = p_campaign_id
     and exists (select 1 from unnest(e.trap_ids) t where v_traps ? t::text);

  update public.campaigns c
     set excluded_monster_ids = (
           select array_agg(coalesce((v_monsters->>u.mid::text)::uuid, u.mid) order by u.ord)
           from unnest(c.excluded_monster_ids) with ordinality as u(mid, ord)
         )
   where c.id = p_campaign_id
     and c.excluded_monster_ids is not null
     and exists (select 1 from unnest(c.excluded_monster_ids) m where v_monsters ? m::text);

  -- JSONB columns. `combatants`, `events` and `wildshape_state` nest monster ids
  -- at three different depths, so rather than rebuilding each shape we substitute
  -- the uuid inside the serialized document. A v4 uuid is globally unique, so a
  -- match anywhere in the document IS that monster reference -- combatant slot
  -- ids and the like are distinct uuids and cannot collide.
  for r in select key as old_id, value as new_id from jsonb_each_text(v_monsters)
  loop
    update public.encounters
       set combatants = replace(combatants::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and combatants is not null
       and position(r.old_id in combatants::text) > 0;

    update public.encounters
       set events = replace(events::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and events is not null
       and position(r.old_id in events::text) > 0;

    update public.party_members
       set wildshape_state = replace(wildshape_state::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and wildshape_state is not null
       and position(r.old_id in wildshape_state::text) > 0;
  end loop;

  -- (#733) Combatants also carry npc_id (CombatantDef: "either monster_id or
  -- npc_id is set, not both") -- events and wildshape_state never reference an
  -- npc, only combatants does, so this pass is narrower than the monster one.
  for r in select key as old_id, value as new_id from jsonb_each_text(v_npcs)
  loop
    update public.encounters
       set combatants = replace(combatants::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and combatants is not null
       and position(r.old_id in combatants::text) > 0;
  end loop;

  -- Editor deep-links into the outgoing DM's Cartographer workspace: the new
  -- owner can open neither target, so drop the link rather than keep a dead one.
  update public.locations
     set source_map_id = null
   where campaign_id = p_campaign_id and source_map_id is not null;

  update public.puzzle_rooms
     set dungeon_feature_id = null
   where campaign_id = p_campaign_id and dungeon_feature_id is not null;

  -- ── 3. Move the campaign's own content ────────────────────────────────────
  update public.calendar_events         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.class_feature_options   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.class_features          set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.class_option_texts      set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.companions              set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.crafting_recipes        set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.custom_classes          set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.custom_subclasses       set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.deities                 set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.encounter_state         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.encounters              set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.faction_deities         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.factions                set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.items                   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.locations               set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.loot_tables             set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.notes                   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_inventory           set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_pc_notes            set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_relationships       set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npc_sets                set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.npcs                    set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.pantheons               set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.party_inventory         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.party_members           set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.puzzle_rooms            set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.quests                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.roll_tables             set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.rules                   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.scriptorium_documents   set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;  -- (#915)
  update public.session_proposals       set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.soundboard_broadcast    set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.soundboard_pages        set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.soundboard_playlists    set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.sounds                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.species                 set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;
  update public.spells                  set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;

  -- FK children that carry a user_id but no campaign_id -- reachable only through
  -- a campaign parent, so they are scoped by that parent's campaign_id.
  update public.faction_items f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_locations f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_npcs f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_party_members f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.faction_relations f set user_id = p_new_owner_id
   where f.user_id = v_owner
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);

  update public.store_items si set user_id = p_new_owner_id
   where si.user_id = v_owner
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);

  -- ── 4. Swap the roles ─────────────────────────────────────────────────────
  -- Order matters. campaign_members_guard_self_update lets a row through
  -- unconditionally when private.is_campaign_dm(campaign_id) holds for auth.uid()
  -- -- which is the OUTGOING DM here. Demoting them first would revoke that and
  -- the trigger would then reject the promotion as an illegal self role change.
  --
  -- The new owner also stops being a player: a DM has no character, and leaving
  -- the link set would make their character read as "taken" in the member list
  -- and block the DM from reassigning it to a real player.
  update public.campaign_members
     set role = 'dm', party_member_id = null
   where campaign_id = p_campaign_id and user_id = p_new_owner_id;

  if p_leave_campaign then
    delete from public.campaign_members
     where campaign_id = p_campaign_id and user_id = v_owner;
  else
    update public.campaign_members
       set role = 'player'
     where campaign_id = p_campaign_id and user_id = v_owner;
  end if;

  -- ── 5. The campaign row ───────────────────────────────────────────────────
  -- BYOK credentials belong to the outgoing DM and are cleared, never handed
  -- over. spotify_client_id stays: it is a public OAuth client id and #180 wants
  -- the campaign's Spotify setup to travel with it. falai_api_key is not
  -- listed: the column was dropped by 20260809145858 (#641, fal.ai removed as
  -- an image provider) along with every other reference to it.
  update public.campaigns
     set user_id           = p_new_owner_id,
         openai_api_key    = null,
         anthropic_api_key = null,
         gemini_api_key    = null
   where id = p_campaign_id;

  -- ── 6. Repoint quest references at the clones ─────────────────────────────
  -- Runs AFTER the campaign row flip: the patched validator arms accept a
  -- global clone through the campaign-owner branch only once campaigns.user_id
  -- is the recipient. For every synced kind, quest_refs goes FIRST: repointing
  -- an attachment fires sync_quest_ref_from_beat_attachment, whose mirror
  -- insert must land as an ON CONFLICT no-op against the already-repointed row
  -- instead of leaving an old+new duplicate pair. (#733: this now covers every
  -- ref_type the sync trigger produces -- npc, faction, location, item,
  -- monster -- not only monster. 'handout' is not in this list because the
  -- sync trigger has no 'handout' case and quest_refs' own CHECK constraint
  -- does not allow that ref_type -- attachments only, no mirror row.)
  update public.quest_refs qr
     set ref_id = v_monsters->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'monster'
     and v_monsters ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_npcs->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'npc'
     and v_npcs ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_locations->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'location'
     and v_locations ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_items->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'item'
     and v_items ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_factions->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'faction'
     and v_factions ? qr.ref_id;

  update public.quest_beat_attachments
     set ref_id = v_monsters->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'monster'
     and v_monsters ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_npcs->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'npc'
     and v_npcs ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_items->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'item'
     and v_items ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_factions->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'faction'
     and v_factions ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_docs->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'handout'
     and v_docs ? ref_id;

  -- #797: staging is a column, so repointing it is a single uuid swap. The
  -- room-id rebuild that used to sit here went with the list it maintained --
  -- production never held a non-empty room id array on any attachment, ever.
  --
  -- private.guard_beat_staging() fires on this UPDATE and passes because
  -- campaigns.user_id was already set to p_new_owner_id further up, so the
  -- clone (user_id = p_new_owner_id, campaign_id null) satisfies the
  -- campaign-owner arm. Moving this above that update would break transfers.
  update public.quest_beats qb
     set staged_at_location_id = (v_locations->>qb.staged_at_location_id::text)::uuid
   where qb.campaign_id = p_campaign_id
     and qb.staged_at_location_id is not null
     and v_locations ? qb.staged_at_location_id::text;
end;
$function$;

-- ── the data ─────────────────────────────────────────────────────────────────

-- Every imported row, with the book normalised to our slug, the edition, and a
-- concept key. An imported row is one with an Open5e identity.
create temp table bg_import as
select b.*,
       d.lib_doc,
       coalesce(b.ruleset, case when d.lib_doc = 'srd-2024' then '2024' else '2014' end) as lib_ruleset,
       coalesce(b.conceptual_key, trim(both '_' from regexp_replace(lower(b.name), '[^a-z0-9]+', '_', 'g'))) as ck,
       b.source_record_key like 'legacy:%' as is_legacy,
       -- Reading the claim here, in a one-off data migration, is not a gate: the
       -- art of an admin's imported row is canonical art, a player's is theirs.
       exists (select 1 from auth.users u
                where u.id = b.user_id and u.raw_app_meta_data ->> 'role' = 'admin') as owner_is_admin
  from public.backgrounds b
 cross join lateral (
   select case
            when b.source_document_key = 'wotc-srd' then 'srd-2014'
            else coalesce(
              (select cs.key from public.content_sources cs
                where cs.open5e_key = b.source_document_key and cs.key <> b.source_document_key
                order by cs.key limit 1),
              b.source_document_key)
          end as lib_doc) d
 where b.open5e_import
   and b.source_document_key is not null
   and b.source_record_key is not null;

-- One winner per (book, edition, concept): the current record beats a legacy one.
create temp table bg_group as
select distinct on (i.lib_doc, i.lib_ruleset, i.ck)
       i.*,
       k.record_key as lib_record_key,
       'srd_' || trim(both '_' from regexp_replace(lower(k.record_key), '[^a-z0-9]+', '_', 'g')) as lib_id
  from bg_import i
 cross join lateral (
   select case when i.is_legacy then i.lib_doc || '_' || i.ck else i.source_record_key end as record_key) k
 order by i.lib_doc, i.lib_ruleset, i.ck, i.is_legacy, i.created_at, i.id;

-- Art: from the admin's rows only, the newest.
create temp table bg_art as
select distinct on (i.lib_doc, i.lib_ruleset, i.ck)
       i.lib_doc, i.lib_ruleset, i.ck, i.image_url, i.focal_point
  from bg_import i
 where i.image_url is not null and i.owner_is_admin
 order by i.lib_doc, i.lib_ruleset, i.ck, i.created_at desc, i.id;

insert into public.library_backgrounds (
  id, name, description, skill_proficiencies, tool_proficiencies, languages, equipment,
  feature_name, feature_description, suggested_characteristics, feat_grant_name,
  feat_grant_description, asi_ability_trio, origin_feat, tags, source, source_title,
  source_url, image_url, focal_point, ruleset, conceptual_key, source_document_key,
  source_record_key, source_revision, source_license, provenance)
select g.lib_id, g.name, g.description, g.skill_proficiencies, g.tool_proficiencies, g.languages, g.equipment,
       g.feature_name, g.feature_description, g.suggested_characteristics, g.feat_grant_name,
       g.feat_grant_description, g.asi_ability_trio, g.origin_feat, g.tags, g.lib_doc,
       coalesce(g.source_title, (select cs.title from public.content_sources cs where cs.key = g.lib_doc)),
       g.source_url, a.image_url, a.focal_point, g.lib_ruleset, g.ck, g.lib_doc,
       g.lib_record_key, g.source_revision, g.source_license, g.provenance
  from bg_group g
  left join bg_art a on (a.lib_doc, a.lib_ruleset, a.ck) = (g.lib_doc, g.lib_ruleset, g.ck)
on conflict do nothing;

-- Which library row each imported row folds into, and which stay: an imported row
-- a player put their own art on is theirs now, not the book's.
create temp table bg_map as
select i.id as old_id, g.lib_id, i.lib_doc, g.lib_record_key,
       (i.image_url is not null and not i.owner_is_admin) as keep
  from bg_import i
  join bg_group g on (g.lib_doc, g.lib_ruleset, g.ck) = (i.lib_doc, i.lib_ruleset, i.ck);

-- The character keeps the very background it had; only where it is read from
-- changes. On 5 Oct 2026 nine characters at tables that never enabled A5E used an
-- A5E background (six of them at other DMs' tables): through the review trigger
-- this remap would bench all nine until a DM re-approved what they had already
-- accepted. A storage move is not a new choice, so the review does not run here.
alter table public.party_members disable trigger party_members_review_content_update;

update public.party_members pm
   set background_id = m.lib_id
  from bg_map m
 where pm.background_id = m.old_id::text and not m.keep;

alter table public.party_members enable trigger party_members_review_content_update;

delete from public.character_content_reviews r
 where r.kind = 'background'
   and r.ref in (select old_id::text from bg_map where not keep);

delete from public.backgrounds b
 where b.id in (select old_id from bg_map where not keep);

-- The ones that stay are the player's own rows from here on. Moving them onto the
-- library identity makes them shadow their library twin in the merged list.
update public.backgrounds b
   set open5e_import = false,
       source_document_key = m.lib_doc,
       source_record_key = m.lib_record_key
  from bg_map m
 where b.id = m.old_id and m.keep
   and not exists (
     select 1 from public.backgrounds o
      where o.user_id = b.user_id and o.id <> b.id
        and o.source_document_key = m.lib_doc and o.source_record_key = m.lib_record_key);
update public.backgrounds b
   set open5e_import = false
  from bg_map m
 where b.id = m.old_id and m.keep;

do $$
declare
  v_lost integer;
begin
  -- Nothing a character points at may be left pointing at nothing: a slug the
  -- library does not hold, or a uuid no row has. (supabase/checks/content_integrity.sql
  -- holds the same line from here on.)
  select count(*) into v_lost
    from public.party_members pm
   where pm.background_id is not null
     and ((pm.background_id !~ '^[0-9a-f]{8}-'
           and not exists (select 1 from public.library_backgrounds lb where lb.id = pm.background_id))
          or (pm.background_id ~ '^[0-9a-f]{8}-'
              and not exists (select 1 from public.backgrounds b where b.id::text = pm.background_id)));
  if v_lost > 0 then
    raise exception 'library_backgrounds: % character(s) would point at a background that does not exist', v_lost;
  end if;
  raise notice 'library_backgrounds: % library rows, % imported rows folded, % kept as the player''s own',
    (select count(*) from public.library_backgrounds),
    (select count(*) from bg_map where not keep),
    (select count(*) from bg_map where keep);
end $$;

drop table bg_map;
drop table bg_art;
drop table bg_group;
drop table bg_import;
