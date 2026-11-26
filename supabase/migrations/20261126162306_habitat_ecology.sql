-- Habitat ecology (#1283): a field guide of species under a light tree of clades, each species' forms (an age or a
-- domesticated breed, with or without a stat block), the links between species (eats, competes, helps, lives on,
-- shelters, carries), what a species yields, and a habitat's species with how common each is. The roll's shares
-- (campaign_habitat_life) become per form, and an empty share is worked out in code from how common the species is
-- and how it lives (lib/canon/ecology.ts); a share the DM types is kept. Design: the Habitat Ecology canvas, approved
-- 26 Nov 2026.
--
-- The existing life rows move here: each creature becomes a species of one adult form, in the habitats it was in,
-- with the share the DM gave it kept as theirs. No reader of the old columns survives.

-- ── Clades: kin, nested as deep as the author likes ────────────────────────
create table public.campaign_clades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  parent_id uuid references public.campaign_clades (id) on delete set null,
  name text not null constraint campaign_clades_name_length check (char_length(btrim(name)) between 1 and 80),
  -- Free words ("family", "order"); a clade needs none.
  rank text constraint campaign_clades_rank_length check (rank is null or char_length(btrim(rank)) between 1 and 40),
  -- Rich text (Tiptap JSON): what the kin share, which the art and the creature generator are told.
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_clades_not_its_own_parent check (parent_id is distinct from id)
);
create index campaign_clades_campaign_idx on public.campaign_clades (campaign_id, sort_order);
create index campaign_clades_parent_idx on public.campaign_clades (parent_id) where parent_id is not null;
create index campaign_clades_user_idx on public.campaign_clades (user_id);
create trigger campaign_clades_updated_at
  before update on public.campaign_clades
  for each row execute procedure update_updated_at();

-- A clade is never inside itself, however far up: 23514.
create function private.campaign_clades_no_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    with recursive up as (
      select c.id, c.parent_id, 1 as depth from public.campaign_clades c where c.id = new.parent_id
      union all
      select c.id, c.parent_id, up.depth + 1 from public.campaign_clades c join up on c.id = up.parent_id where up.depth < 64
    )
    select 1 from up where up.id = new.id
  ) then
    raise exception using errcode = '23514', message = 'A clade cannot be inside itself';
  end if;
  return new;
end;
$$;
revoke execute on function private.campaign_clades_no_cycle() from public, anon, authenticated;
create trigger campaign_clades_no_cycle
  before insert or update of parent_id on public.campaign_clades
  for each row execute procedure private.campaign_clades_no_cycle();

-- ── Species ────────────────────────────────────────────────────────────────
create table public.campaign_species (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  clade_id uuid references public.campaign_clades (id) on delete set null,
  name text not null constraint campaign_species_name_length check (char_length(btrim(name)) between 1 and 80),
  scientific_name text constraint campaign_species_scientific_name_length
    check (scientific_name is null or char_length(btrim(scientific_name)) between 1 and 120),
  kingdom text not null default 'animal' constraint campaign_species_kingdom check (kingdom in ('animal', 'plant', 'fungus', 'other')),
  -- How it lives, which the code reads with abundance to work out how often it is met.
  lives_as text constraint campaign_species_lives_as check (lives_as in ('alone', 'pairs', 'family', 'harem', 'herd', 'colony')),
  -- When it is about: by day, at dawn and dusk, by night, at any time.
  activity text constraint campaign_species_activity check (activity in ('day', 'twilight', 'night', 'any')),
  -- Per season kind (spring, summer, autumn, winter): { "away": boolean, "note": text }. A season it is away it is
  -- off the roll.
  seasons jsonb not null default '{}'::jsonb constraint campaign_species_seasons_shape
    check (jsonb_typeof(seasons) = 'object' and seasons - array['spring', 'summer', 'autumn', 'winter'] = '{}'::jsonb),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_species_campaign_idx on public.campaign_species (campaign_id, sort_order);
create index campaign_species_clade_idx on public.campaign_species (clade_id) where clade_id is not null;
create index campaign_species_user_idx on public.campaign_species (user_id);
create trigger campaign_species_updated_at
  before update on public.campaign_species
  for each row execute procedure update_updated_at();

-- ── Forms: an age or a breed of a species, each with at most one stat block ─
create table public.campaign_species_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  species_id uuid not null references public.campaign_species (id) on delete cascade,
  label text not null constraint campaign_species_forms_label_length check (char_length(btrim(label)) between 1 and 40),
  stage_order integer not null default 0,
  domesticated boolean not null default false,
  -- The stat block, the DM's own or a shared book's; none for a stage nobody fights (a young pith piper, a plant).
  monster_id uuid references public.monsters (id) on delete set null,
  library_monster_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_species_forms_one_stat_block check (num_nonnulls(monster_id, library_monster_id) <= 1),
  -- The target of the composite references below: a form named with its species.
  constraint campaign_species_forms_id_species unique (id, species_id)
);
-- A stat block is a form of at most one species in a campaign, so its sheet can say what it is.
create unique index campaign_species_forms_monster_once on public.campaign_species_forms (campaign_id, monster_id) where monster_id is not null;
create unique index campaign_species_forms_library_once on public.campaign_species_forms (campaign_id, library_monster_id) where library_monster_id is not null;
create index campaign_species_forms_species_idx on public.campaign_species_forms (species_id, stage_order);
create index campaign_species_forms_monster_idx on public.campaign_species_forms (monster_id) where monster_id is not null;
create index campaign_species_forms_campaign_idx on public.campaign_species_forms (campaign_id);
create index campaign_species_forms_user_idx on public.campaign_species_forms (user_id);
create trigger campaign_species_forms_updated_at
  before update on public.campaign_species_forms
  for each row execute procedure update_updated_at();

-- A shared book's creature id is text, checked on write here and in production by content_integrity.sql.
create function private.campaign_species_forms_library_id_exists()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.library_monster_id is not null
     and not exists (select 1 from public.library_monsters m where m.id = new.library_monster_id) then
    raise exception using errcode = '23503', message = 'campaign_species_forms.library_monster_id names no creature in the library';
  end if;
  return new;
end;
$$;
revoke execute on function private.campaign_species_forms_library_id_exists() from public, anon, authenticated;
create trigger campaign_species_forms_library_id_exists
  before insert or update of library_monster_id on public.campaign_species_forms
  for each row execute procedure private.campaign_species_forms_library_id_exists();

-- ── Links: the food web, and the rest of how species touch ─────────────────
create table public.campaign_species_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  from_species_id uuid not null references public.campaign_species (id) on delete cascade,
  kind text not null constraint campaign_species_links_kind
    check (kind in ('eats', 'competes', 'helps', 'lives_on', 'shelters', 'carries')),
  -- No target only for sheltering or carrying "other animals".
  to_species_id uuid references public.campaign_species (id) on delete cascade,
  -- Narrowed to one form on either side: the form must be of that side's species.
  from_form_id uuid,
  to_form_id uuid,
  -- Only where both live; none is wherever they meet.
  habitat_id uuid references public.campaign_habitats (id) on delete cascade,
  note text constraint campaign_species_links_note_length check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_species_links_target check (to_species_id is not null or kind in ('shelters', 'carries')),
  constraint campaign_species_links_to_form_needs_species check (to_form_id is null or to_species_id is not null),
  constraint campaign_species_links_from_form foreign key (from_form_id, from_species_id)
    references public.campaign_species_forms (id, species_id) on delete cascade,
  constraint campaign_species_links_to_form foreign key (to_form_id, to_species_id)
    references public.campaign_species_forms (id, species_id) on delete cascade
);
create index campaign_species_links_from_idx on public.campaign_species_links (from_species_id);
create index campaign_species_links_to_idx on public.campaign_species_links (to_species_id) where to_species_id is not null;
create index campaign_species_links_from_form_idx on public.campaign_species_links (from_form_id) where from_form_id is not null;
create index campaign_species_links_to_form_idx on public.campaign_species_links (to_form_id) where to_form_id is not null;
create index campaign_species_links_habitat_idx on public.campaign_species_links (habitat_id) where habitat_id is not null;
create index campaign_species_links_campaign_idx on public.campaign_species_links (campaign_id);
create index campaign_species_links_user_idx on public.campaign_species_links (user_id);
create trigger campaign_species_links_updated_at
  before update on public.campaign_species_links
  for each row execute procedure update_updated_at();

-- ── Yields: what a species gives (a reagent, a hide, a forage) ─────────────
create table public.campaign_species_yields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  species_id uuid not null references public.campaign_species (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  library_item_id text,
  note text constraint campaign_species_yields_note_length check (note is null or char_length(note) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_species_yields_one_item check (num_nonnulls(item_id, library_item_id) = 1)
);
create unique index campaign_species_yields_item_once on public.campaign_species_yields (species_id, item_id) where item_id is not null;
create unique index campaign_species_yields_library_once on public.campaign_species_yields (species_id, library_item_id) where library_item_id is not null;
create index campaign_species_yields_item_idx on public.campaign_species_yields (item_id) where item_id is not null;
create index campaign_species_yields_campaign_idx on public.campaign_species_yields (campaign_id);
create index campaign_species_yields_user_idx on public.campaign_species_yields (user_id);
create trigger campaign_species_yields_updated_at
  before update on public.campaign_species_yields
  for each row execute procedure update_updated_at();

create function private.campaign_species_yields_library_id_exists()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.library_item_id is not null
     and not exists (select 1 from public.library_items i where i.id = new.library_item_id) then
    raise exception using errcode = '23503', message = 'campaign_species_yields.library_item_id names no item in the library';
  end if;
  return new;
end;
$$;
revoke execute on function private.campaign_species_yields_library_id_exists() from public, anon, authenticated;
create trigger campaign_species_yields_library_id_exists
  before insert or update of library_item_id on public.campaign_species_yields
  for each row execute procedure private.campaign_species_yields_library_id_exists();

-- ── What lives in a habitat, and how common it is there ────────────────────
create table public.campaign_habitat_species (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  habitat_id uuid not null references public.campaign_habitats (id) on delete cascade,
  species_id uuid not null references public.campaign_species (id) on delete cascade,
  abundance text constraint campaign_habitat_species_abundance
    check (abundance in ('very_rare', 'rare', 'uncommon', 'common', 'abundant')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_habitat_species_once unique (habitat_id, species_id)
);
create index campaign_habitat_species_species_idx on public.campaign_habitat_species (species_id);
create index campaign_habitat_species_campaign_idx on public.campaign_habitat_species (campaign_id);
create index campaign_habitat_species_user_idx on public.campaign_habitat_species (user_id);
create trigger campaign_habitat_species_updated_at
  before update on public.campaign_habitat_species
  for each row execute procedure update_updated_at();

-- "Anything else": the share left to the generator, worked out (10) unless the DM sets it.
alter table public.campaign_habitats
  add column other_percent numeric(5, 2) constraint campaign_habitats_other_percent check (other_percent is null or (other_percent >= 0 and other_percent <= 100));

-- A truth may belong to a species, as it may to a habitat.
alter table public.canon_entries
  add column species_id uuid references public.campaign_species (id) on delete set null,
  add constraint canon_entries_only_a_truth_has_a_species check (species_id is null or part = 'truth');
create index canon_entries_species_idx on public.canon_entries (species_id) where species_id is not null;

-- ── The roll's shares, per form ────────────────────────────────────────────
-- A row is a form on a habitat's roll. Its species must live in the habitat (the composite reference to
-- campaign_habitat_species, so taking a species out of a habitat takes its forms off the roll), and the form must be of
-- that species. `percent` null is a share worked out in code; a number is the DM's. The 100 rule holds for the DM's
-- numbers plus the habitat's "anything else" when that is set.
alter table public.campaign_habitat_life
  add column species_id uuid,
  add column form_id uuid;

-- Each creature on a roll today becomes a species of one adult form, once per campaign (a creature in two habitats is
-- one species), named and kinded from its stat block; its habitats list it; its share stays the DM's.
create temporary table eco_move as
select distinct on (l.campaign_id, coalesce(l.monster_id::text, l.library_monster_id))
       l.campaign_id, l.monster_id, l.library_monster_id,
       (select h.user_id from public.campaign_habitats h where h.id = l.habitat_id) as user_id,
       coalesce(m.name, lm.name) as name,
       coalesce(m.monster_type, lm.monster_type) as monster_type,
       gen_random_uuid() as species_id, gen_random_uuid() as form_id
  from public.campaign_habitat_life l
  left join public.monsters m on m.id = l.monster_id
  left join public.library_monsters lm on lm.id = l.library_monster_id
 order by l.campaign_id, coalesce(l.monster_id::text, l.library_monster_id), l.created_at;

insert into public.campaign_species (id, user_id, campaign_id, name, kingdom)
select species_id, user_id, campaign_id, left(coalesce(nullif(btrim(name), ''), 'Unnamed creature'), 80),
       case when monster_type = 'plant' then 'plant' when monster_type in ('beast', 'monstrosity', 'dragon') then 'animal' else 'other' end
  from eco_move;
insert into public.campaign_species_forms (id, user_id, campaign_id, species_id, label, stage_order, monster_id, library_monster_id)
select form_id, user_id, campaign_id, species_id, 'Adult', 1, monster_id, library_monster_id from eco_move;
insert into public.campaign_habitat_species (user_id, campaign_id, habitat_id, species_id, sort_order)
select l.user_id, l.campaign_id, l.habitat_id, e.species_id, l.sort_order
  from public.campaign_habitat_life l
  join eco_move e on e.campaign_id = l.campaign_id
   and coalesce(e.monster_id::text, e.library_monster_id) = coalesce(l.monster_id::text, l.library_monster_id);
update public.campaign_habitat_life l
   set species_id = e.species_id, form_id = e.form_id
  from eco_move e
 where e.campaign_id = l.campaign_id
   and coalesce(e.monster_id::text, e.library_monster_id) = coalesce(l.monster_id::text, l.library_monster_id);
drop table eco_move;

drop view public.campaign_habitat_life_named;
drop trigger zz_same_campaign_refs on public.campaign_habitat_life;
drop trigger campaign_habitat_life_library_id_exists on public.campaign_habitat_life;
drop function private.campaign_habitat_life_library_id_exists();
drop index public.campaign_habitat_life_monster_once;
drop index public.campaign_habitat_life_library_once;
drop index public.campaign_habitat_life_monster_idx;
alter table public.campaign_habitat_life
  drop constraint campaign_habitat_life_one_creature,
  drop column monster_id,
  drop column library_monster_id,
  alter column species_id set not null,
  alter column form_id set not null,
  alter column percent drop not null,
  add constraint campaign_habitat_life_species foreign key (habitat_id, species_id)
    references public.campaign_habitat_species (habitat_id, species_id) on delete cascade,
  add constraint campaign_habitat_life_form foreign key (form_id, species_id)
    references public.campaign_species_forms (id, species_id) on delete cascade,
  add constraint campaign_habitat_life_form_once unique (habitat_id, form_id);
create index campaign_habitat_life_species_idx on public.campaign_habitat_life (habitat_id, species_id);
create index campaign_habitat_life_form_idx on public.campaign_habitat_life (form_id);

-- The 100 rule, restated: the DM's own shares and their "anything else", never what code works out.
create or replace function private.campaign_habitat_life_within_hundred()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Read through jsonb: PL/pgSQL resolves `new.habitat_id` against the row type even in the branch that is not taken,
  -- and a campaign_habitats row has no such field.
  v_habitat uuid := case when tg_table_name = 'campaign_habitats' then new.id else (to_jsonb(new) ->> 'habitat_id')::uuid end;
  v_total numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('campaign_habitat_life:' || v_habitat::text, 0));
  select coalesce(sum(l.percent), 0) + coalesce((select h.other_percent from public.campaign_habitats h where h.id = v_habitat), 0)
    into v_total
    from public.campaign_habitat_life l
   where l.habitat_id = v_habitat;
  if v_total > 100 then
    raise exception using errcode = '23514',
      message = format('What lives in a habitat adds up to %s%%: it cannot pass 100%%', trim_scale(v_total));
  end if;
  return null;
end;
$$;
create constraint trigger campaign_habitats_other_within_hundred
  after insert or update of other_percent on public.campaign_habitats
  deferrable initially deferred
  for each row execute procedure private.campaign_habitat_life_within_hundred();

-- What lives in each habitat by name, for the screen, the roll and the world block: one row per form on the roll, with
-- its species. Invoker: a stat block this reader may not read leaves its name null, and the row stays.
create view public.campaign_habitat_life_named
with (security_invoker = true) as
select l.id, l.campaign_id, l.habitat_id, l.species_id, l.form_id, l.percent, l.sort_order,
       coalesce(f.monster_id::text, f.library_monster_id) as record_id,
       f.monster_id is null and f.library_monster_id is not null as from_library,
       coalesce(m.name, lm.name) as name,
       s.name as species_name,
       f.label as form_label
  from public.campaign_habitat_life l
  join public.campaign_species s on s.id = l.species_id
  join public.campaign_species_forms f on f.id = l.form_id
  left join public.monsters m on m.id = f.monster_id
  left join public.library_monsters lm on lm.id = f.library_monster_id;

-- ── Every reference stays in its campaign ──────────────────────────────────
create trigger zz_same_campaign_refs
  before insert or update of parent_id, campaign_id on public.campaign_clades
  for each row execute procedure private.enforce_same_campaign_refs('parent_id', 'campaign_clades', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of clade_id, campaign_id on public.campaign_species
  for each row execute procedure private.enforce_same_campaign_refs('clade_id', 'campaign_clades', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of species_id, monster_id, campaign_id on public.campaign_species_forms
  for each row execute procedure private.enforce_same_campaign_refs(
    'species_id', 'campaign_species', 'owned',
    'monster_id', 'monsters', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of from_species_id, to_species_id, from_form_id, to_form_id, habitat_id, campaign_id
  on public.campaign_species_links
  for each row execute procedure private.enforce_same_campaign_refs(
    'from_species_id', 'campaign_species', 'owned',
    'to_species_id', 'campaign_species', 'owned',
    'from_form_id', 'campaign_species_forms', 'owned',
    'to_form_id', 'campaign_species_forms', 'owned',
    'habitat_id', 'campaign_habitats', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of species_id, item_id, campaign_id on public.campaign_species_yields
  for each row execute procedure private.enforce_same_campaign_refs(
    'species_id', 'campaign_species', 'owned',
    'item_id', 'items', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of habitat_id, species_id, campaign_id on public.campaign_habitat_species
  for each row execute procedure private.enforce_same_campaign_refs(
    'habitat_id', 'campaign_habitats', 'owned',
    'species_id', 'campaign_species', 'owned');
create trigger zz_same_campaign_refs
  before insert or update of habitat_id, species_id, form_id, campaign_id on public.campaign_habitat_life
  for each row execute procedure private.enforce_same_campaign_refs(
    'habitat_id', 'campaign_habitats', 'owned',
    'species_id', 'campaign_species', 'owned',
    'form_id', 'campaign_species_forms', 'owned');

drop trigger zz_same_campaign_refs on public.canon_entries;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, became_entry_id, from_fact_id, arc_id, habitat_id, species_id, revealed_session_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs('party_member_id', 'party_members', 'owned', 'became_entry_id', 'canon_entries', 'owned',
    'from_fact_id', 'story_facts', 'owned', 'arc_id', 'canon_arcs', 'owned', 'habitat_id', 'campaign_habitats', 'owned',
    'species_id', 'campaign_species', 'owned', 'revealed_session_id', 'campaign_sessions', 'owned');

-- ── Access: the DMs of the campaign, one policy per command ────────────────
do $$
declare
  t text;
begin
  foreach t in array array['campaign_clades', 'campaign_species', 'campaign_species_forms', 'campaign_species_links',
                           'campaign_species_yields', 'campaign_habitat_species'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (private.is_campaign_dm(campaign_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (private.is_campaign_dm(campaign_id))', t || '_delete', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
    -- Live: each rings the campaign doorbell.
    execute format('create trigger %1$s_signal_insert after insert on public.%1$I referencing new table as changed for each statement execute procedure signal_campaign_change()', t);
    execute format('create trigger %1$s_signal_update after update on public.%1$I referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change()', t);
    execute format('create trigger %1$s_signal_delete after delete on public.%1$I referencing old table as changed for each statement execute procedure signal_campaign_change()', t);
    execute format('create trigger %1$s_guard_content_author before update on public.%1$I for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id) execute procedure private.guard_content_author()', t);
  end loop;
end $$;
grant select on public.campaign_habitat_life_named to authenticated, service_role;

-- ── The demo copy ──────────────────────────────────────────────────────────
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('campaign_clades', 1, true, null),
  ('campaign_species', 1, true, null),
  ('campaign_species_forms', 1, true, null),
  ('campaign_species_links', 1, true, null),
  ('campaign_species_yields', 1, true, null),
  ('campaign_habitat_species', 1, true, null);

-- ── Handing a campaign on ──────────────────────────────────────────────────
-- Restated whole from 20261123235700 with the six new tables beside the habitats.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.location_roads        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.story_facts           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entries         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_clues           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_steps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_force_ticks     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_entry_quests    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_peoples      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_arcs             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_trash            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitats      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitat_places set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitat_life  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_clades set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_species set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_species_forms set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_species_links set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_species_yields set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_habitat_species set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.canon_lore_passages   set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  -- Who wrote a passage moves with it (#1226 story 10): the journal tells a DM's passage from the player's
  -- by its author, so a passage the outgoing owner wrote must stay the DM's words.
  update public.canon_lore_passages   set author_id = p_to where campaign_id = p_campaign_id and author_id = p_from;
  update public.note_sorting          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;

comment on table public.campaign_clades is 'Kin in a campaign''s field guide, nested; a species sits in one (#1283).';
comment on table public.campaign_species is 'A living kind in a campaign''s world: its forms, kin, links and habits (#1283).';
comment on table public.campaign_species_forms is 'An age or a domesticated breed of a species, with at most one stat block (#1283).';
comment on table public.campaign_species_links is 'How species touch: eats, competes, helps, lives on, shelters, carries (#1283).';
comment on table public.campaign_species_yields is 'What a species gives, as items (#1283).';
comment on table public.campaign_habitat_species is 'The species living in a habitat and how common each is there (#1283).';
comment on table public.campaign_habitat_life is 'A habitat''s roll: one row per form, its share the DM''s or, when null, worked out in code (#1283).';
