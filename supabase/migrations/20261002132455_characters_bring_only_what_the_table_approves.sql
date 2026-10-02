-- Epic #943, wave 4: a player's own books, and what the table approves.
--
-- Content works the way the edition does: the player builds what they like, and
-- the table decides what sits down. Until now it could not decide anything
-- about a character that arrived with its choices already made. The pickers
-- only offer what a table allows, but a character built with no table, or at
-- another one, walked in with whatever it had, and the DM often could not even
-- see it: a member can read the DM's content, the DM cannot read a member's, so
-- a joined character's background (always a row somebody owns) showed as nothing.
--
-- What this migration decides (the epic body holds the reasoning):
--
--   * user_enabled_sources: the books a player with no table reads from.
--   * What a table approves is one predicate, private.assess_content(): library
--     content from a book the DM enabled and has not blocked, the official
--     classes the DM has not blocked, and content a DM of that table owns.
--   * A character whose choices are not all approved is flagged, one row per
--     choice in character_content_reviews, and cannot be made anyone's active
--     character while a flag is pending (SQLSTATE CR001). It still joins: it
--     sits at the table benched, where the DM can see it and the player can
--     change a choice from the table's own lists.
--   * Five reasons. 'source': a library entry from a book the table has not
--     enabled; the DM allows it for this character or enables the book.
--     'blocked': the table blocked it; the DM allows it for this character or
--     unblocks it. 'homebrew': the player's own content, whatever it says it
--     is; the DM approves it. 'foreign': somebody else's content (another
--     table's DM made it); it cannot be approved here, because approving would
--     copy that person's work without them, so it has to be changed.
--     'missing': it points at nothing; it has to be removed.
--   * Who owns a row decides everything; what a row says about itself decides
--     nothing. Provenance keys are client-writable, so a player's own row is
--     always the DM's to approve, even one labelled as the SRD.
--   * Approving the player's own content ADOPTS it: private.adopt_content()
--     copies it into the table's content, with what it points at (a class's
--     features, a subclass's granted spells) on the same terms, and the
--     character is re-pointed at the copy. The original is untouched. Nothing
--     belonging to a third person is ever copied or shown, at any depth.
--   * The one thing that needs no asking: when the table already has its own
--     copy of the same book entry (one its DM made), the character is pointed
--     at that. The result is the DM's row, so nothing is trusted.
--   * A DM turning a book off later, or a seated player picking something
--     unapproved, flags the character and changes nothing else. Characters
--     already seated when this ships are recorded as approved: sitting at a
--     table before approval existed was the approval.
--
-- Checked: species, background, class, subclass, spells, feats. Not checked: a
-- disguise species (cosmetic, set at the table) and items (table content by
-- construction).

-- ── 1. A player's own books ──────────────────────────────────────────────────

create table public.user_enabled_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_slug text not null,
  source_title text,
  enabled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_slug)
);

comment on table public.user_enabled_sources is
  'The books a player reads from when a character has no table. The two SRDs are always on and are not stored here; a table''s own list is campaign_enabled_sources.';

alter table public.user_enabled_sources enable row level security;

create policy "user_enabled_sources_select" on public.user_enabled_sources for select using ((select auth.uid()) = user_id);
create policy "user_enabled_sources_insert" on public.user_enabled_sources for insert with check ((select auth.uid()) = user_id);
create policy "user_enabled_sources_update" on public.user_enabled_sources for update using ((select auth.uid()) = user_id);
create policy "user_enabled_sources_delete" on public.user_enabled_sources for delete using ((select auth.uid()) = user_id);

create trigger user_enabled_sources_updated_at
  before update on public.user_enabled_sources
  for each row execute procedure update_updated_at();

-- ── 2. The flags ─────────────────────────────────────────────────────────────

create table public.character_content_reviews (
  id uuid primary key default gen_random_uuid(),
  -- The table whose approval is in question. An approval from one table says
  -- nothing about another, so these rows go when the character leaves.
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  party_member_id uuid not null references public.party_members(id) on delete cascade,
  kind text not null check (kind in ('species', 'background', 'class', 'subclass', 'spell', 'feat')),
  -- What the character points at: a library slug, a content row's uuid, or
  -- 'system:<class name>' for a class known by name.
  ref text not null,
  -- Its name when flagged, so the DM's queue reads without a second lookup the
  -- DM may not be allowed to make.
  label text not null,
  reason text not null check (reason in ('source', 'blocked', 'homebrew', 'foreign', 'missing')),
  source_slug text,
  source_title text,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_member_id, kind, ref)
);

comment on table public.character_content_reviews is
  'One row per choice a seated character has that its table has not approved. Pending rows bench the character; an approved row is the DM allowing it for this character. Written only by the review and approval functions.';

create index character_content_reviews_campaign_idx on public.character_content_reviews (campaign_id);
create index character_content_reviews_party_member_idx on public.character_content_reviews (party_member_id);

alter table public.character_content_reviews enable row level security;

-- The DM of the table and whoever the character belongs to. No write policy:
-- a flag is raised by the review and cleared by an approval or a changed choice.
create policy "character_content_reviews_select" on public.character_content_reviews for select
  using (
    private.is_campaign_dm(campaign_id)
    or exists (
      select 1 from public.party_members pm
       where pm.id = character_content_reviews.party_member_id
         and (pm.owner_user_id = (select auth.uid())
              or (pm.owner_user_id is null and pm.user_id = (select auth.uid())))
    )
  );

create trigger character_content_reviews_updated_at
  before update on public.character_content_reviews
  for each row execute procedure update_updated_at();

-- Live sync (CLAUDE.md "Live Data"): it has campaign_id and its readers may read
-- the rows, so it is a subscribed table. Published, and it rings the doorbell on
-- delete because a campaign-filtered DELETE never arrives.
alter publication supabase_realtime add table public.character_content_reviews;

create trigger character_content_reviews_signal_delete
  after delete on public.character_content_reviews
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- Play state, not content: a demo starts with nothing waiting on anyone.
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason)
values ('character_content_reviews', 1, null, null, false, 'per-character approval state: a demo starts with nothing waiting');

-- ── 3. What a table approves ─────────────────────────────────────────────────

-- A reference is a uuid if Postgres would read it as one, not if it looks like
-- the canonical spelling. `species_id` and `spell_id` are text, and a row's id
-- written without hyphens or in braces still names that row to a cast; a check
-- by pattern let such a string walk past every lookup as "not a uuid".
create function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- Who speaks for a table: its owner and anyone seated as its DM. Takes the user
-- rather than reading auth.uid(), because the question here is about the owner
-- of a content row, not about the caller.
create function private.is_table_dm(p_campaign_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_user_id is not null and (
    exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.user_id = p_user_id)
    or exists (
      select 1 from public.campaign_members m
       where m.campaign_id = p_campaign_id and m.user_id = p_user_id and m.role = 'dm'
    ));
$$;

-- A book with no key is not a book the table could have enabled or not, so
-- there is nothing to refuse.
create function private.source_enabled(p_campaign_id uuid, p_source_slug text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_source_slug is null or exists (
    select 1 from public.campaign_enabled_sources s
     where s.campaign_id = p_campaign_id and s.source_slug = p_source_slug);
$$;

-- Everything a character points at, as (kind, ref). An official class is named
-- rather than pointed at, because a table blocks official classes by name.
--
-- A class or subclass row may be only a name, with no definition pinned. That
-- is an honest state: a character the DM built with a typed class gets such a
-- row the first time it levels up, and the name is a label with nothing behind
-- it. But the app resolves a name against whatever its viewer can read, the
-- viewer's own homebrew included, so on its OWNER'S screen a bare name becomes
-- the owner's own class of that name, at a table that was never asked. So a
-- name is read the way the owner's app reads it (private.named_content_of_owner):
-- where it lands on the owner's own content and the table has nothing by that
-- name, the reference IS that content, flagged and approved like a pinned one,
-- and approving pins the row to the table's copy. Any other bare name stays a
-- label: an official class is checked by name, anything else is not content.
-- What a class or subclass known only by name stands for on its owner's
-- screen: the owner's own row of that name, when it is not an official class
-- and the table has nothing by it. NULL otherwise.
create function private.named_content_of_owner(
  p_kind text, p_owner uuid, p_campaign_id uuid, p_class_name text, p_subclass_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when p_owner is null or p_campaign_id is null or p_class_name is null then null
    when p_kind = 'class' then (
      select own.id from public.custom_classes own
       where own.user_id = p_owner
         and lower(own.class_name) = lower(p_class_name)
         and not exists (
           select 1 from public.system_classes sc where lower(sc.class_name) = lower(p_class_name))
         and not exists (
           select 1 from public.custom_classes t
            where lower(t.class_name) = lower(p_class_name)
              and private.is_table_dm(p_campaign_id, t.user_id)
              and (t.campaign_id is null or t.campaign_id = p_campaign_id))
       order by own.created_at, own.id
       limit 1)
    when p_kind = 'subclass' and p_subclass_name is not null then (
      select own.id from public.custom_subclasses own
       where own.user_id = p_owner
         and lower(own.class_name) = lower(p_class_name)
         and lower(own.subclass_name) = lower(p_subclass_name)
         and not exists (
           select 1 from public.custom_subclasses t
            where lower(t.class_name) = lower(p_class_name)
              and lower(t.subclass_name) = lower(p_subclass_name)
              and private.is_table_dm(p_campaign_id, t.user_id)
              and (t.campaign_id is null or t.campaign_id = p_campaign_id))
       order by own.created_at, own.id
       limit 1)
  end;
$$;

create function private.party_member_content_refs(p_party_member_id uuid)
returns table (kind text, ref text)
language sql
stable
set search_path = ''
as $$
  select 'species', pm.species_id
    from public.party_members pm
   where pm.id = p_party_member_id and pm.species_id is not null
  union
  select 'background', pm.background_id::text
    from public.party_members pm
   where pm.id = p_party_member_id and pm.background_id is not null
  union
  select 'class',
         case
           when cc.class_definition_kind = 'custom' and cc.class_definition_id is not null
             then cc.class_definition_id::text
           when cc.class_definition_id is null
             then coalesce(
               private.named_content_of_owner('class', pm.owner_user_id, pm.campaign_id, cc.class_name, null)::text,
               'system:' || cc.class_name)
           else 'system:' || cc.class_name
         end
    from public.character_classes cc
    join public.party_members pm on pm.id = cc.party_member_id
   where cc.party_member_id = p_party_member_id
  union
  select 'subclass', cc.subclass_definition_id::text
    from public.character_classes cc
   where cc.party_member_id = p_party_member_id and cc.subclass_definition_id is not null
  union
  select 'subclass', named.id::text
    from public.character_classes cc
    join public.party_members pm on pm.id = cc.party_member_id
    cross join lateral (
      select private.named_content_of_owner(
        'subclass', pm.owner_user_id, pm.campaign_id, cc.class_name, cc.subclass_name) as id) named
   where cc.party_member_id = p_party_member_id
     and cc.subclass_definition_id is null and cc.subclass_name is not null
     and named.id is not null
  union
  select 'spell', cs.spell_id
    from public.character_spells cs
   where cs.party_member_id = p_party_member_id
  union
  -- Feats are ids inside two jsonb columns: the running list, and the choice
  -- recorded at each level that took a feat instead of an ability increase.
  select 'feat', feat.id
    from public.party_members pm,
         jsonb_array_elements_text(
           case when jsonb_typeof(pm.class_choices -> 'feats') = 'array'
                then pm.class_choices -> 'feats' else '[]'::jsonb end) as feat(id)
   -- A JSON null in the list is not a choice. Left in, it came out as a NULL
   -- ref, which made every comparison in the review's final delete NULL and so
   -- kept approvals for choices the character no longer had.
   where pm.id = p_party_member_id and feat.id is not null
  union
  select 'feat', level.entry -> 'asi' ->> 'feat_id'
    from public.party_members pm,
         jsonb_each(
           case when jsonb_typeof(pm.level_choices) = 'object'
                then pm.level_choices else '{}'::jsonb end) as level(lvl, entry)
   where pm.id = p_party_member_id and level.entry -> 'asi' ->> 'feat_id' is not null;
$$;

-- The table's own copy of a book entry: a row a DM of the table made
-- themselves (never one adopted from a player) with the same provenance keys.
-- This is the only thing that lets a character through without anyone being
-- asked, and it is safe whatever the character pointed at before, because the
-- result is the DM's row, not the player's.
create function private.table_book_entry(
  p_kind text, p_campaign_id uuid, p_document_key text, p_record_key text, p_ruleset text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_table text := case p_kind
    when 'species' then 'species' when 'background' then 'backgrounds'
    when 'class' then 'custom_classes' when 'subclass' then 'custom_subclasses'
    when 'spell' then 'spells' when 'feat' then 'class_features' end;
  v_id uuid;
begin
  if v_table is null or p_document_key is null or p_record_key is null then
    return null;
  end if;
  execute format($q$
    select t.id from public.%I t
     where private.is_table_dm($1, t.user_id)
       and (%s)
       and t.source_document_key = $2 and t.source_record_key = $3
       and t.ruleset is not distinct from $4
       and t.provenance ->> 'adopted_from' is null
     order by t.created_at
     limit 1
  $q$, v_table, case when p_kind = 'background' then 'true' else 't.campaign_id is null or t.campaign_id = $1' end)
    into v_id using p_campaign_id, p_document_key, p_record_key, p_ruleset;
  return v_id;
end;
$$;

-- The predicate. One function, so the review, the approval and the tests cannot
-- disagree about what a table approves.
--
--   approved    the table takes it as it is
--   reason      why not: 'source', 'blocked', 'homebrew', 'foreign' or 'missing'
--   adoptable   it is the character owner's own row, which approval may copy
--   repoint_to  the table's own copy of the same book entry, when it has one:
--               the character is pointed at that instead and nobody is asked
--
-- Who owns a row decides everything, and what a row SAYS about itself decides
-- nothing. A row's provenance keys are client-writable, so "this is the SRD
-- Acolyte" is a claim, not a fact: a player could write anything into their own
-- row under those keys. So a player's own row is always the DM's to approve,
-- and the keys are used only to find a row the DM made, never to trust the
-- player's.
--
-- A row that belongs to neither the character's owner nor the table is
-- 'foreign' and is named in the flag only as that: its real name is not the
-- flag's reader's to learn. A uuid that points at nothing is 'missing', not
-- approved: otherwise a character could be seated on an empty reference and
-- the content created afterwards under that id.
create function private.assess_content(
  p_kind text, p_ref text, p_campaign_id uuid, p_character_owner uuid,
  out approved boolean, out reason text, out label text,
  out source_slug text, out source_title text, out adoptable boolean, out repoint_to uuid)
language plpgsql
stable
set search_path = ''
as $$
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
  adoptable := false;

  if p_kind = 'class' and p_ref like 'system:%' then
    label := substr(p_ref, 8);
    -- By name, and a name is not a different class for being typed in another
    -- case. A name that is no official class is a label with nothing behind
    -- it (see party_member_content_refs): there is nothing to approve.
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
    adoptable := true;
  else
    reason := 'foreign';
    label := 'Content from another table';
  end if;
end;
$$;

-- ── 4. Adoption: a copy the table owns ───────────────────────────────────────

-- Copies one of a character owner's own content rows into a table's content and
-- returns the copy's id. Returns the row's own id when it is already the
-- table's or is a system row, an earlier copy of this very row when the table
-- has one, and NULL when the row is not `p_owner`'s to give (or does not
-- exist): nothing that belongs to a third person is ever copied, at any depth.
--
-- Deep: a class takes its features with it, a subclass its features and the
-- spells it grants, a species the spells it grants. A nested reference that
-- comes back NULL is dropped from the copy, so the copy never points at a row
-- the table cannot read. (A dropped grant is removed, not blanked: a species
-- grant with no spell is a free pick, which would make the copy more generous
-- than the original.)
--
-- Through jsonb, so a column added later comes along. Not a definer and not
-- client-callable: only an approval calls it, after authorizing.
create function private.adopt_content(p_kind text, p_ref uuid, p_campaign_id uuid, p_owner uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_table text := case p_kind
    when 'species' then 'species' when 'background' then 'backgrounds'
    when 'class' then 'custom_classes' when 'subclass' then 'custom_subclasses'
    when 'spell' then 'spells' when 'feat' then 'class_features' end;
  v_scoped boolean := p_kind <> 'background';
  v_row jsonb;
  v_table_owner uuid;
  v_new_id uuid;
  v_existing uuid;
  v_grants jsonb;
  v_grant jsonb;
  v_spell uuid;
begin
  if v_table is null then
    raise exception 'Unknown content kind %', p_kind;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_row using p_ref;
  if v_row is null then
    return null;
  end if;

  -- Already the table's, or nobody's (a system feature): nothing to copy.
  if v_row ->> 'user_id' is null
     or (private.is_table_dm(p_campaign_id, (v_row ->> 'user_id')::uuid)
         and (not v_scoped or v_row ->> 'campaign_id' is null
              or (v_row ->> 'campaign_id')::uuid = p_campaign_id)) then
    return p_ref;
  end if;

  if p_owner is null or (v_row ->> 'user_id')::uuid is distinct from p_owner then
    return null;
  end if;

  -- An earlier copy of this very row.
  execute format($q$
    select t.id from public.%I t
     where private.is_table_dm($1, t.user_id)
       and (%s)
       and t.provenance ->> 'adopted_from' = $2
     order by t.created_at
     limit 1
  $q$, v_table, case when v_scoped then 't.campaign_id is null or t.campaign_id = $1' else 'true' end)
    into v_existing using p_campaign_id, p_ref::text;
  if v_existing is not null then
    return v_existing;
  end if;

  select c.user_id into v_table_owner from public.campaigns c where c.id = p_campaign_id;
  if v_table_owner is null then
    raise exception 'Campaign not found';
  end if;

  -- The copy does not keep what the player's row said about where it came
  -- from. The book keys say "this IS that book's entry", which is a claim only
  -- a row the DM made can stand behind (and an account holds at most one row
  -- per pair of keys, so a second player's copy of the same entry could not be
  -- approved at all). The source and licence fields would have the table's own
  -- content display a book's name over text a player wrote. What the row
  -- claimed is kept in provenance, where it identifies and displays nothing.
  -- AI provenance is not a claim about a book and stays: it has to travel.
  v_new_id := gen_random_uuid();
  v_row := v_row || jsonb_build_object(
    'id', v_new_id,
    'user_id', v_table_owner,
    'created_at', now(),
    'updated_at', now(),
    'source_document_key', null,
    'source_record_key', null,
    'source_revision', null,
    'source_license', null,
    'source', null,
    'source_title', null,
    'source_url', null,
    'conceptual_key', null,
    'open5e_import', false,
    'provenance', coalesce(nullif(v_row -> 'provenance', 'null'::jsonb), '{}'::jsonb)
                  || jsonb_build_object(
                       'adopted_from', p_ref::text,
                       'adopted_claims', jsonb_build_object(
                         'document', v_row -> 'source_document_key',
                         'record', v_row -> 'source_record_key',
                         'source', v_row -> 'source')));
  if v_scoped then
    v_row := v_row || jsonb_build_object('campaign_id', p_campaign_id);
  end if;

  -- What it points at comes too, on the same terms.
  if p_kind in ('class', 'subclass') then
    v_row := v_row || jsonb_build_object(
      'features', private.adopt_id_map(v_row -> 'features', 'feat', p_campaign_id, p_owner));
  end if;
  if p_kind = 'subclass' then
    v_row := v_row || jsonb_build_object(
      'granted_spells', private.adopt_id_map(v_row -> 'granted_spells', 'spell', p_campaign_id, p_owner));
  end if;
  if p_kind = 'species' and jsonb_typeof(v_row -> 'granted_spells') = 'array' then
    v_grants := '[]'::jsonb;
    for v_grant in select * from jsonb_array_elements(v_row -> 'granted_spells') loop
      if private.try_uuid(v_grant ->> 'spell_id') is not null then
        v_spell := private.adopt_content('spell', private.try_uuid(v_grant ->> 'spell_id'), p_campaign_id, p_owner);
        if v_spell is null then
          continue;
        end if;
        v_grant := v_grant || jsonb_build_object('spell_id', v_spell::text);
      end if;
      v_grants := v_grants || jsonb_build_array(v_grant);
    end loop;
    v_row := v_row || jsonb_build_object('granted_spells', v_grants);
  end if;

  execute format('insert into public.%I select (jsonb_populate_record(null::public.%I, $1)).*', v_table, v_table)
    using v_row;
  return v_new_id;
end;
$$;

-- Re-points every uuid in a {"<level>": [ids]} map at the table's copy of what
-- it names, dropping any that is not the owner's to give. Slugs (library
-- content) pass through untouched.
create function private.adopt_id_map(p_map jsonb, p_kind text, p_campaign_id uuid, p_owner uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_level text;
  v_ids jsonb;
  v_id text;
  v_new jsonb;
  v_adopted uuid;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;
  for v_level, v_ids in select * from jsonb_each(p_map) loop
    if jsonb_typeof(v_ids) <> 'array' then
      v_out := v_out || jsonb_build_object(v_level, v_ids);
      continue;
    end if;
    v_new := '[]'::jsonb;
    for v_id in select * from jsonb_array_elements_text(v_ids) loop
      if private.try_uuid(v_id) is not null then
        v_adopted := private.adopt_content(p_kind, private.try_uuid(v_id), p_campaign_id, p_owner);
        if v_adopted is not null then
          v_new := v_new || to_jsonb(v_adopted::text);
        end if;
      else
        v_new := v_new || to_jsonb(v_id);
      end if;
    end loop;
    v_out := v_out || jsonb_build_object(v_level, v_new);
  end loop;
  return v_out;
end;
$$;

-- Points a character at different content of the same kind. The spell count
-- limit stands down for the spell statement: re-pointing is not a new choice.
create function private.repoint_party_member_content(
  p_party_member_id uuid, p_kind text, p_old text, p_new text)
returns void
language plpgsql
set search_path = ''
as $$
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
      update public.party_members set background_id = p_new::uuid
       where id = p_party_member_id and background_id = p_old::uuid;
      get diagnostics v_moved = row_count;
    -- A class or subclass row may reach here known only by name (it stood for
    -- its owner's content of that name). Re-pointing pins it, and takes the
    -- definition's own spelling of the name, which the class triggers compare
    -- exactly.
    when 'class' then
      update public.character_classes cc
         set class_definition_id = p_new::uuid,
             class_definition_kind = 'custom',
             class_name = coalesce(
               (select d.class_name from public.custom_classes d where d.id = p_new::uuid), cc.class_name)
       where cc.party_member_id = p_party_member_id
         and (cc.class_definition_id = p_old::uuid
              or (cc.class_definition_id is null and exists (
                    select 1 from public.custom_classes d
                     where d.id = p_old::uuid and lower(d.class_name) = lower(cc.class_name))));
      get diagnostics v_moved = row_count;
    when 'subclass' then
      update public.character_classes cc
         set subclass_definition_id = p_new::uuid,
             subclass_name = coalesce(
               (select d.subclass_name from public.custom_subclasses d where d.id = p_new::uuid), cc.subclass_name)
       where cc.party_member_id = p_party_member_id
         and (cc.subclass_definition_id = p_old::uuid
              or (cc.subclass_definition_id is null and exists (
                    select 1 from public.custom_subclasses d
                     where d.id = p_old::uuid
                       and lower(d.class_name) = lower(cc.class_name)
                       and lower(d.subclass_name) = lower(cc.subclass_name))));
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
$$;

-- ── 5. The review ────────────────────────────────────────────────────────────

-- Brings a character's flags in line with what it points at and what its table
-- approves, and returns how many are pending. Idempotent, and the only writer
-- of pending rows. Copies nothing: the one thing it does without asking is
-- point a character at the table's own copy of a book entry it already has.
-- With p_grandfather set it changes nothing about the character and records
-- every unapproved choice as approved (the data migration at the end of this
-- file).
--
-- Re-entrant by flag: re-pointing fires the very triggers that call this
-- function.
create function private.review_party_member_content(p_party_member_id uuid, p_grandfather boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  -- At most this many flags are raised per review, so one request cannot write
  -- an unbounded number of rows into a queue the DM has to read. It bounds what
  -- is NEWLY pending only. Counting rows the DM had already approved toward it
  -- (as the first version did) let a character pad itself with a hundred cheap
  -- choices, have them approved, and sit down with the hundred-and-first never
  -- having been shown to anyone. While anything is unapproved there is always
  -- at least one pending row, so the character stays benched; clearing some
  -- brings the next ones up.
  c_max_flags constant integer := 100;
  v_raised integer := 0;
  v_existing public.character_content_reviews%rowtype;
  v_pm public.party_members%rowtype;
  v_owner uuid;
  v_ref record;
  v_target text;
  v_a record;
  v_kept text[] := '{}';
  v_held text[] := '{}';
  v_pending integer;
begin
  if current_setting('grimoire.content_review', true) = 'running' then
    return null;
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    return 0;
  end if;

  if v_pm.campaign_id is null then
    delete from public.character_content_reviews where party_member_id = p_party_member_id;
    return 0;
  end if;

  perform set_config('grimoire.content_review', 'running', true);

  -- An approval belongs to the table that gave it.
  delete from public.character_content_reviews
   where party_member_id = p_party_member_id and campaign_id <> v_pm.campaign_id;

  v_owner := v_pm.owner_user_id;

  for v_ref in
    select r.kind, r.ref from private.party_member_content_refs(p_party_member_id) r
     where r.ref is not null
  loop
    v_target := v_ref.ref;
    v_a := private.assess_content(v_ref.kind, v_target, v_pm.campaign_id, v_owner);

    -- The table has its own copy of this book entry: point at that, and judge
    -- the copy (it may itself be blocked).
    --
    -- Best effort. Re-pointing writes to the character, and another rule may
    -- refuse the write (the class trigger does not admit every row of the
    -- DM's; a character may already hold the target spell). A review runs
    -- inside other people's statements, the DM enabling a book among them, so
    -- a refusal here must leave the flag standing, not abort their action: a
    -- player could otherwise arrange a character that blocks every table-wide
    -- change.
    if not v_a.approved and v_a.repoint_to is not null and not p_grandfather then
      begin
        perform private.repoint_party_member_content(
          p_party_member_id, v_ref.kind, v_target, v_a.repoint_to::text);
        v_target := v_a.repoint_to::text;
        v_a := private.assess_content(v_ref.kind, v_target, v_pm.campaign_id, v_owner);
      exception when others then
        null;
      end;
    end if;

    v_held := v_held || (v_ref.kind || '|' || v_target);
    if v_a.approved then
      continue;
    end if;

    select * into v_existing from public.character_content_reviews r
     where r.party_member_id = p_party_member_id and r.kind = v_ref.kind and r.ref = v_target;
    if found and v_existing.status = 'approved' and v_existing.reason is not distinct from v_a.reason then
      v_kept := v_kept || (v_ref.kind || '|' || v_target);
      continue;
    end if;
    if not p_grandfather then
      if v_raised >= c_max_flags then
        continue;
      end if;
      v_raised := v_raised + 1;
    end if;

    insert into public.character_content_reviews as r
      (campaign_id, party_member_id, kind, ref, label, reason, source_slug, source_title, status, decided_at)
    values
      (v_pm.campaign_id, p_party_member_id, v_ref.kind, v_target, coalesce(v_a.label, v_target),
       v_a.reason, v_a.source_slug, v_a.source_title,
       case when p_grandfather then 'approved' else 'pending' end,
       case when p_grandfather then now() end)
    on conflict (party_member_id, kind, ref) do update
      set label = excluded.label, reason = excluded.reason,
          source_slug = excluded.source_slug, source_title = excluded.source_title,
          -- An approval was given for a reason. If the reason is no longer the
          -- same (a reference that pointed at nothing now points at somebody's
          -- homebrew; an allowed species has since been blocked), it is a new
          -- question and waits again.
          status = case when r.reason is distinct from excluded.reason then 'pending' else r.status end,
          decided_by = case when r.reason is distinct from excluded.reason then null else r.decided_by end,
          decided_at = case when r.reason is distinct from excluded.reason then null else r.decided_at end;
    v_kept := v_kept || (v_ref.kind || '|' || v_target);
  end loop;

  -- A flag for a choice the character no longer has has nothing left to say,
  -- and neither has a pending one for a choice the table now takes. An APPROVED
  -- one for a choice the character still has is kept even while the table takes
  -- it anyway: the DM allowed it for this character, and turning the book off
  -- again later must not quietly take that back.
  delete from public.character_content_reviews r
   where r.party_member_id = p_party_member_id
     and not ((r.kind || '|' || r.ref) = any(v_kept))
     and not (r.status = 'approved' and (r.kind || '|' || r.ref) = any(v_held));

  perform set_config('grimoire.content_review', '', true);

  select count(*)::integer into v_pending
    from public.character_content_reviews r
   where r.party_member_id = p_party_member_id and r.status = 'pending';
  return v_pending;
end;
$$;

revoke execute on function private.try_uuid(text) from public, anon, authenticated;
revoke execute on function private.is_table_dm(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.source_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function private.party_member_content_refs(uuid) from public, anon, authenticated;
revoke execute on function private.named_content_of_owner(text, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function private.table_book_entry(text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function private.assess_content(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.adopt_id_map(jsonb, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.adopt_content(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.repoint_party_member_content(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function private.review_party_member_content(uuid, boolean) from public, anon, authenticated;

-- ── 6. When a character is reviewed ──────────────────────────────────────────
-- Whenever what it points at changes, and whenever what its table approves
-- changes. Definer triggers: the reviewer reads and writes content the caller
-- may not.

create function public.review_content_of_party_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.review_party_member_content(new.id);
  return null;
end;
$$;

create function public.review_content_of_changed_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select distinct c.party_member_id from changed c loop
    perform private.review_party_member_content(v_id);
  end loop;
  return null;
end;
$$;

create function public.review_content_of_row_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.review_party_member_content(new.party_member_id);
  return null;
end;
$$;

create function public.review_content_of_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select pm.id from public.party_members pm
     where pm.campaign_id in (select distinct c.campaign_id from changed c)
  loop
    perform private.review_party_member_content(v_id);
  end loop;
  return null;
end;
$$;

create function public.review_content_of_campaign_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in select pm.id from public.party_members pm where pm.campaign_id = new.id loop
    perform private.review_party_member_content(v_id);
  end loop;
  return null;
end;
$$;

revoke execute on function public.review_content_of_party_member() from public, anon, authenticated;
revoke execute on function public.review_content_of_changed_members() from public, anon, authenticated;
revoke execute on function public.review_content_of_row_member() from public, anon, authenticated;
revoke execute on function public.review_content_of_campaign() from public, anon, authenticated;
revoke execute on function public.review_content_of_campaign_row() from public, anon, authenticated;

create trigger party_members_review_content_insert
  after insert on public.party_members
  for each row when (new.campaign_id is not null)
  execute procedure public.review_content_of_party_member();

-- Only the columns that hold a choice, and of class_choices only its feats:
-- that column also carries per-turn combat bookkeeping that changes constantly.
create trigger party_members_review_content_update
  after update on public.party_members
  for each row when (
    new.campaign_id is distinct from old.campaign_id
    -- Whose content is the character's own turns on its owner, so a hand-over
    -- changes what its flags should say.
    or new.owner_user_id is distinct from old.owner_user_id
    or new.species_id is distinct from old.species_id
    or new.background_id is distinct from old.background_id
    or (new.class_choices -> 'feats') is distinct from (old.class_choices -> 'feats')
    or new.level_choices is distinct from old.level_choices)
  execute procedure public.review_content_of_party_member();

create trigger character_classes_review_content_insert
  after insert on public.character_classes
  referencing new table as changed
  for each statement execute procedure public.review_content_of_changed_members();

create trigger character_classes_review_content_delete
  after delete on public.character_classes
  referencing old table as changed
  for each statement execute procedure public.review_content_of_changed_members();

-- Row-level, because a transition table cannot be combined with a column list,
-- and a class row is updated on every rest (hit dice) without its choice changing.
create trigger character_classes_review_content_update
  after update of class_name, class_definition_id, class_definition_kind, subclass_name, subclass_definition_id
  on public.character_classes
  for each row execute procedure public.review_content_of_row_member();

create trigger character_spells_review_content_insert
  after insert on public.character_spells
  referencing new table as changed
  for each statement execute procedure public.review_content_of_changed_members();

create trigger character_spells_review_content_delete
  after delete on public.character_spells
  referencing old table as changed
  for each statement execute procedure public.review_content_of_changed_members();

create trigger character_spells_review_content_update
  after update of spell_id on public.character_spells
  for each row execute procedure public.review_content_of_row_member();

create trigger campaign_enabled_sources_review_content_insert
  after insert on public.campaign_enabled_sources
  referencing new table as changed
  for each statement execute procedure public.review_content_of_campaign();

create trigger campaign_enabled_sources_review_content_delete
  after delete on public.campaign_enabled_sources
  referencing old table as changed
  for each statement execute procedure public.review_content_of_campaign();

create trigger campaigns_review_content_blocklists
  after update of disabled_species_ids, disabled_class_names on public.campaigns
  for each row execute procedure public.review_content_of_campaign_row();

-- ── 7. The seat gate ─────────────────────────────────────────────────────────

-- A character with a pending flag cannot be made anyone's active character, by
-- anyone, the DM included: the DM's way to seat it is to approve what is
-- waiting. Everything else in this function is as 20261002132454 left it.
create or replace function public.guard_campaign_member_self_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- DMs of this campaign may change the rest (role, name, character).
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
    return new;
  end if;

  -- Admission (private.admit_campaign_member) links the character the joiner
  -- chose, and has checked it is theirs. It runs as whoever gave the last yes,
  -- usually a parent, who owns no character here, so the per-caller check
  -- below would refuse every approval that brings one.
  if current_setting('grimoire.pm_campaign_transition', true) = 'on' then
    return new;
  end if;

  -- Non-DM self-update: role stays pinned to its prior value.
  if new.role is distinct from old.role then
    raise exception 'Not allowed to change role or campaign assignment';
  end if;

  -- party_member_id may change (claim / self-create / assume), but only to a
  -- character the player is allowed to take: same campaign, not owned by someone
  -- else, and not already claimed by another member. Clearing it is always allowed.
  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null then

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
    ) then
      raise exception 'That character is already claimed by another player';
    end if;
  end if;

  return new;
end;
$function$;

-- Attach brings the character to the table either way; it fills the seat only
-- when nothing is waiting. The character's own trigger has already reviewed it
-- by the time the count is read (the campaign_id update fires it).
create or replace function public.attach_party_member_to_campaign(p_party_member_id uuid, p_campaign_id uuid, p_set_active boolean default true)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- The owner attaches their character; a DM may attach an unclaimed
  -- character they created (DM-managed roster work). coalesce makes the
  -- predicate total (CLAUDE.md SECURITY DEFINER item 3): for an unclaimed row
  -- owner_user_id is NULL, `NULL = v_uid` is NULL, `NULL or false` is NULL,
  -- and `if not NULL` never raises — the exact case an attacker is in.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Only the character''s owner can attach it';
  end if;

  if v_pm.campaign_id is not null then
    raise exception 'Character is already in a campaign. Detach it first.';
  end if;

  if not private.is_campaign_member(p_campaign_id) then
    raise exception 'You are not a member of that campaign';
  end if;

  -- After the membership check, so a stranger learns nothing about a table's
  -- edition from the refusal.
  perform private.assert_ruleset_admissible(v_pm.ruleset, p_campaign_id);

  -- A player bringing a character they made, which nobody owns yet, is its
  -- owner from here on (the claim rule of 20261002132454: the member made the
  -- character themselves). It has to be settled before the review below, which
  -- treats a character nobody owns as having no content of its own. A DM
  -- attaching a roster character to their own table does not take it here; if
  -- the attach also fills the DM's own seat, the claim trigger makes them its
  -- owner, as it does for any member seated on a character they made.
  if v_pm.owner_user_id is null and not private.is_campaign_dm(p_campaign_id) then
    update public.party_members set owner_user_id = v_uid where id = p_party_member_id;
  end if;

  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  update public.party_members
     set campaign_id = p_campaign_id
   where id = p_party_member_id;

  -- Benched while anything waits on the DM (#943 wave 4).
  if p_set_active and not exists (
    select 1 from public.character_content_reviews r
     where r.party_member_id = p_party_member_id and r.status = 'pending'
  ) then
    update public.campaign_members
       set party_member_id = p_party_member_id
     where campaign_id = p_campaign_id
       and user_id = v_uid
       and party_member_id is null;
  end if;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
end;
$function$;

create or replace function private.admit_campaign_member(p_campaign_id uuid, p_user_id uuid, p_role text, p_display_name text, p_party_member_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_inserted integer;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (p_campaign_id, p_user_id, p_role, p_display_name)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if p_party_member_id is not null then
    perform set_config('grimoire.pm_campaign_transition', 'on', true);
    update public.party_members pm
       set campaign_id = p_campaign_id
     where pm.id = p_party_member_id
       and pm.owner_user_id = p_user_id
       and pm.campaign_id is null
       and exists (
         select 1 from public.campaigns c
          where c.id = p_campaign_id
            and (c.ruleset = pm.ruleset or c.allows_mixed_rulesets)
       );
    -- The seat is filled only when nothing is waiting on the DM; otherwise the
    -- character has come to the table benched (#943 wave 4).
    update public.campaign_members m
       set party_member_id = p_party_member_id
     where m.campaign_id = p_campaign_id
       and m.user_id = p_user_id
       and m.party_member_id is null
       and exists (
         select 1 from public.party_members pm
          where pm.id = p_party_member_id
            and pm.campaign_id = p_campaign_id
            and pm.owner_user_id = p_user_id
       )
       and not exists (
         select 1 from public.character_content_reviews r
          where r.party_member_id = p_party_member_id and r.status = 'pending'
       );
    perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  end if;

  -- Whatever route admitted them, nothing is pending for them here any more
  -- (a request left from before a child came of age, say).
  delete from public.campaign_join_requests
   where campaign_id = p_campaign_id and user_id = p_user_id;

  return v_inserted > 0;
end;
$function$;

-- ── 8. Approving, and removing what is not there ─────────────────────────────

-- A character with nothing waiting takes the seat it was kept from, if its
-- owner has none filled at that table.
create function private.seat_cleared_party_member(p_party_member_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found or v_pm.campaign_id is null or v_pm.owner_user_id is null then
    return;
  end if;
  if exists (
    select 1 from public.character_content_reviews r
     where r.party_member_id = p_party_member_id and r.status = 'pending'
  ) then
    return;
  end if;
  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  update public.campaign_members m
     set party_member_id = p_party_member_id
   where m.campaign_id = v_pm.campaign_id
     and m.user_id = v_pm.owner_user_id
     and m.party_member_id is null;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
end;
$$;

revoke execute on function private.seat_cleared_party_member(uuid) from public, anon, authenticated;

-- The DM clears one flag. `p_scope` says how far the approval reaches:
--
--   'character'  this character only. A library or blocked choice gets an
--                approved row; the player's own content is adopted into the
--                table and the character re-pointed at the copy.
--   'table'      everyone. The book is enabled, or the block is lifted, and
--                every seated character is reviewed again. Only for a choice
--                the library or the table itself vouches for: the book to
--                enable is read from the library row, never from anything a
--                player wrote.
--
-- The flag is assessed again here rather than trusted as stored: what it points
-- at may have changed since it was raised.
--
-- Returns how many flags the character still has pending.

-- The rows a content row points at that adoption follows, as (kind, id, level):
-- a class's features, a subclass's features and granted spells, a species'
-- granted spells. Library slugs are not rows and are left out.
create function private.content_nested_refs(p_kind text, p_id uuid)
returns table (kind text, id uuid, lvl text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_table text := case p_kind
    when 'species' then 'species' when 'class' then 'custom_classes'
    when 'subclass' then 'custom_subclasses' end;
  v_row jsonb;
begin
  if v_table is null or p_id is null then
    return;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_row using p_id;
  if v_row is null then
    return;
  end if;
  if p_kind in ('class', 'subclass') and jsonb_typeof(v_row -> 'features') = 'object' then
    return query
      select 'feat'::text, private.try_uuid(f.ref), m.lvl
        from jsonb_each(v_row -> 'features') as m(lvl, ids),
             jsonb_array_elements_text(
               case when jsonb_typeof(m.ids) = 'array' then m.ids else '[]'::jsonb end) as f(ref)
       where private.try_uuid(f.ref) is not null;
  end if;
  if p_kind = 'subclass' and jsonb_typeof(v_row -> 'granted_spells') = 'object' then
    return query
      select 'spell'::text, private.try_uuid(g.ref), m.lvl
        from jsonb_each(v_row -> 'granted_spells') as m(lvl, ids),
             jsonb_array_elements_text(
               case when jsonb_typeof(m.ids) = 'array' then m.ids else '[]'::jsonb end) as g(ref)
       where private.try_uuid(g.ref) is not null;
  end if;
  if p_kind = 'species' and jsonb_typeof(v_row -> 'granted_spells') = 'array' then
    return query
      select 'spell'::text, private.try_uuid(g.entry ->> 'spell_id'), g.entry ->> 'min_level'
        from jsonb_array_elements(v_row -> 'granted_spells') as g(entry)
       where private.try_uuid(g.entry ->> 'spell_id') is not null;
  end if;
end;
$$;

-- When what the DM is shown was last changed: the row itself, and every row of
-- the same owner that an approval would copy with it. A class is its features;
-- checking only the class row let a player rewrite a feature after the DM had
-- looked and have the new text copied.
create function private.content_seen_at(p_kind text, p_id uuid, p_owner uuid)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_table text := case p_kind
    when 'species' then 'species' when 'background' then 'backgrounds'
    when 'class' then 'custom_classes' when 'subclass' then 'custom_subclasses'
    when 'spell' then 'spells' when 'feat' then 'class_features' end;
  v_at timestamptz;
begin
  if v_table is null or p_id is null then
    return null;
  end if;
  execute format('select t.updated_at from public.%I t where t.id = $1', v_table) into v_at using p_id;
  return greatest(
    v_at,
    (select max(f.updated_at) from public.class_features f
      where f.user_id = p_owner
        and f.id in (select n.id from private.content_nested_refs(p_kind, p_id) n where n.kind = 'feat')),
    (select max(sp.updated_at) from public.spells sp
      where sp.user_id = p_owner
        and sp.id in (select n.id from private.content_nested_refs(p_kind, p_id) n where n.kind = 'spell')));
end;
$$;

-- Holds those same rows still until the approval commits, so the copy is of
-- what was just compared. The top row first: while it is locked its lists of
-- features and spells cannot change either.
create function private.lock_content(p_kind text, p_id uuid, p_owner uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_table text := case p_kind
    when 'species' then 'species' when 'background' then 'backgrounds'
    when 'class' then 'custom_classes' when 'subclass' then 'custom_subclasses'
    when 'spell' then 'spells' when 'feat' then 'class_features' end;
begin
  if v_table is null or p_id is null then
    return;
  end if;
  execute format('select 1 from public.%I t where t.id = $1 for update', v_table) using p_id;
  perform 1 from public.class_features f
    where f.user_id = p_owner
      and f.id in (select n.id from private.content_nested_refs(p_kind, p_id) n where n.kind = 'feat')
    for update;
  perform 1 from public.spells sp
    where sp.user_id = p_owner
      and sp.id in (select n.id from private.content_nested_refs(p_kind, p_id) n where n.kind = 'spell')
    for update;
end;
$$;

revoke execute on function private.content_nested_refs(text, uuid) from public, anon, authenticated;
revoke execute on function private.content_seen_at(text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.lock_content(text, uuid, uuid) from public, anon, authenticated;

create function public.approve_character_content(
  p_review_id uuid, p_scope text default 'character', p_seen_updated_at timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_review public.character_content_reviews%rowtype;
  v_pm public.party_members%rowtype;
  v_owner uuid;
  v_a record;
  v_copy uuid;
  v_pending integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_scope is null or p_scope not in ('character', 'table') then
    raise exception 'Unknown approval scope';
  end if;

  select * into v_review from public.character_content_reviews where id = p_review_id;
  if not found then
    raise exception 'Nothing is waiting under that id';
  end if;
  if not private.is_campaign_dm(v_review.campaign_id) then
    raise exception 'Only the DM of the table can approve a character''s choices' using errcode = '42501';
  end if;
  -- Locked only once the caller is known to be the DM.
  perform 1 from public.character_content_reviews where id = p_review_id for update;

  select * into v_pm from public.party_members where id = v_review.party_member_id;
  v_owner := v_pm.owner_user_id;
  v_a := private.assess_content(v_review.kind, v_review.ref, v_review.campaign_id, v_owner);

  if not v_a.approved then
    if v_a.reason = 'foreign' then
      raise exception 'This was made at another table and cannot be approved here; it has to be changed';
    elsif v_a.reason = 'missing' then
      raise exception 'This no longer exists and cannot be approved; it has to be removed';
    elsif p_scope = 'table' then
      if v_a.reason = 'source' and v_a.source_slug is not null then
        insert into public.campaign_enabled_sources (campaign_id, source_slug, source_title)
        values (v_review.campaign_id, v_a.source_slug, v_a.source_title)
        on conflict (campaign_id, source_slug) do nothing;
      elsif v_a.reason = 'blocked' and v_review.kind = 'species' then
        update public.campaigns
           set disabled_species_ids = array_remove(disabled_species_ids, v_review.ref)
         where id = v_review.campaign_id;
      elsif v_a.reason = 'blocked' and v_review.kind = 'class' and v_review.ref like 'system:%' then
        -- Without case, as the predicate compares: array_remove matches exactly,
        -- so 'wizard' against a blocked 'Wizard' removed nothing and reported
        -- success with the character still benched.
        update public.campaigns
           set disabled_class_names = array(
             select n from unnest(coalesce(disabled_class_names, '{}')) as n
              where lower(n) <> lower(substr(v_review.ref, 8)))
         where id = v_review.campaign_id;
      else
        raise exception 'Only a book or a blocked choice can be approved for the whole table';
      end if;
      -- The enable and the unblock each re-review every seated character.
    elsif v_a.reason = 'homebrew' then
      -- The DM approves what they looked at. A player's own row stays theirs to
      -- edit, so without this they could show one thing and have another copied.
      -- Locked first, and held to the end of the approval, so nothing changes
      -- between this comparison and the copy. (A timestamp from the future
      -- passes, exactly as leaving it out does: it is the DM's own check, and
      -- skipping it is the DM's call.)
      perform private.lock_content(v_review.kind, private.try_uuid(v_review.ref), v_owner);
      if p_seen_updated_at is not null
         and private.content_seen_at(v_review.kind, private.try_uuid(v_review.ref), v_owner) > p_seen_updated_at then
        raise exception 'This was changed after you looked at it; look again before approving' using errcode = 'CR002';
      end if;
      v_copy := private.adopt_content(v_review.kind, private.try_uuid(v_review.ref), v_review.campaign_id, v_owner);
      if v_copy is null then
        raise exception 'This cannot be copied into the table''s content';
      end if;
      perform private.repoint_party_member_content(
        v_review.party_member_id, v_review.kind, v_review.ref, v_copy::text);
    else
      update public.character_content_reviews
         set status = 'approved', decided_by = v_uid, decided_at = now()
       where id = p_review_id;
    end if;
  end if;

  v_pending := private.review_party_member_content(v_review.party_member_id);
  perform private.seat_cleared_party_member(v_review.party_member_id);
  return v_pending;
end;
$$;

revoke execute on function public.approve_character_content(uuid, text, timestamptz) from public, anon;
grant execute on function public.approve_character_content(uuid, text, timestamptz) to authenticated, service_role;

-- A reference to something that no longer exists cannot be approved or changed
-- into anything: it can only be taken off the character. Its owner may do that,
-- and so may the DM of the table it sits at. Returns how many flags are left.
create function public.remove_missing_character_content(p_review_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
      -- The definition is gone; the row keeps its name as a label. That is safe
      -- because a bare name is read the way its owner's app reads it: if it now
      -- lands on other content of the owner's, the next review flags that.
      update public.character_classes
         set class_definition_id = null, class_definition_kind = null
       where party_member_id = v_review.party_member_id
         and class_definition_id = private.try_uuid(v_review.ref);
    when 'subclass' then
      update public.character_classes set subclass_definition_id = null
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
      -- A background is a foreign key and is cleared by the database when its
      -- row goes, so it is never missing.
      raise exception 'Nothing to remove for this kind';
  end case;

  v_pending := private.review_party_member_content(v_review.party_member_id);
  perform private.seat_cleared_party_member(v_review.party_member_id);
  return v_pending;
end;
$$;

revoke execute on function public.remove_missing_character_content(uuid) from public, anon;
grant execute on function public.remove_missing_character_content(uuid) to authenticated, service_role;

-- What a flag is about, for the DM who has to decide and cannot otherwise read
-- a player's own content. A definer handing a row to someone RLS would refuse,
-- so it is narrow on purpose:
--
--   * only through a flag at the caller's own table, or on the caller's own
--     character;
--   * only while the character still points at it;
--   * only what the flag's reader is entitled to: a library row, the table's
--     own content, or the CHARACTER OWNER'S own row. Never a third person's.
--     Without that last rule, pointing a character at a stranger's row was a
--     way to read it.
--
-- Known and accepted (third audit, 2 Oct 2026). A DM may write a seated
-- character's choices, so a DM who knows the id of one of that player's
-- private rows can point the character at it and read it here as the
-- character owner's own. It needs an id nothing in the app discloses: a
-- player's content is readable by the player alone until they bring it to a
-- table themselves, at which point showing it to the DM is the design.
-- Closing it means recording who made each choice and treating a choice the
-- owner did not make as `foreign`; that was weighed and left, because the
-- ways a legitimate choice arrives under the DM's session (admission, a
-- seat the DM fills, a flag the cap had held back) would each have to be told
-- apart from it, and a player's honest homebrew wrongly refused costs more
-- than this does.
--
-- A class is its features and a subclass its features and spells, and an
-- approval copies those too, so they are returned with the row
-- (`nested_features`, `nested_spells`) on the same terms: the character owner's
-- own, the table's, or nobody's. `seen_at` is what the caller hands back to
-- approve_character_content: the newest change to anything shown.
create function public.get_character_content_item(p_review_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      when 'species' then 'library_species' when 'spell' then 'library_spells' end;
    if v_table is null then
      return null;
    end if;
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
      into v_item using v_review.ref;
  end if;
  -- The owner's id is not the reader's to learn from a content row.
  return v_item - 'user_id';
end;
$$;

revoke execute on function public.get_character_content_item(uuid) from public, anon;
grant execute on function public.get_character_content_item(uuid) to authenticated, service_role;

-- ── 9. Characters already seated ─────────────────────────────────────────────

-- Sitting at a table before approval existed was the approval. Every choice a
-- seated character has that this predicate would not take is recorded as
-- approved for that character, and nothing is copied or re-pointed.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.party_members where campaign_id is not null loop
    perform private.review_party_member_content(v_id, true);
  end loop;
end;
$$;
