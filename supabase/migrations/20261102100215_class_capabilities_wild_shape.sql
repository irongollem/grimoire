-- A class's abilities come from its definition, not its name (#934, story 9).
--
-- Whether a character can Wild Shape was decided by `class_name` containing
-- "druid" (`druidProfile`, src/rules/wildshape.ts). A homebrew shapeshifter
-- class could not Wild Shape at all, and anything named "Druid…" could. Now a
-- class definition lists what it can do in `capabilities` (today only
-- 'wild_shape'), and every character class row carries its definition's list,
-- kept in step by trigger. The row is what the sheet, the bestiary, the
-- encounter runner and level-up already read, so they learn it from the same
-- query as today: no second request, and no moment while one loads in which a
-- druid reads as a non-druid (the flicker that hid Wild Shape before).
--
-- Nothing changes for anyone today. The backfill grants 'wild_shape' to every
-- definition the old rule recognised: a class named like "druid", a library
-- class keyed 'druid', and any class a character row named like "druid"
-- points at (a renamed custom class keeps what its characters had). Checked
-- at the end: every row the old rule called a druid still is one.
--
-- Subclasses (Circle of the Moon) are not part of this: a subclass may be
-- free text with no definition, so its name is the only record of it.

alter table public.system_classes
  add column capabilities text[] not null default '{}',
  add constraint system_classes_capabilities_known check (capabilities <@ array['wild_shape']::text[]);
alter table public.custom_classes
  add column capabilities text[] not null default '{}',
  add constraint custom_classes_capabilities_known check (capabilities <@ array['wild_shape']::text[]);
alter table public.character_classes
  add column capabilities text[] not null default '{}';

update public.system_classes sc
   set capabilities = array['wild_shape']
 where sc.class_name ilike '%druid%'
    or sc.conceptual_key = 'druid'
    or exists (select 1 from public.character_classes cc
                where cc.class_definition_kind = 'system' and cc.class_definition_id = sc.id
                  and cc.class_name ilike '%druid%');
update public.custom_classes cu
   set capabilities = array['wild_shape']
 where cu.class_name ilike '%druid%'
    or cu.conceptual_key = 'druid'
    or exists (select 1 from public.character_classes cc
                where cc.class_definition_kind = 'custom' and cc.class_definition_id = cu.id
                  and cc.class_name ilike '%druid%');

-- What a class row can do: its definition's list. Total: a row whose
-- definition is missing can do nothing special.
create or replace function private.class_definition_capabilities(p_kind text, p_definition_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case p_kind
      when 'system' then (select sc.capabilities from public.system_classes sc where sc.id = p_definition_id)
      when 'custom' then (select cu.capabilities from public.custom_classes cu where cu.id = p_definition_id)
    end,
    '{}'::text[]);
$$;
-- Only the triggers below call it, as their definer.
revoke execute on function private.class_definition_capabilities(text, uuid) from public, anon, authenticated;

-- Every write to a class row takes its capabilities from the definition, so a
-- client can neither set them nor keep stale ones.
create or replace function private.character_class_capabilities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.capabilities := private.class_definition_capabilities(new.class_definition_kind, new.class_definition_id);
  return new;
end;
$$;
revoke execute on function private.character_class_capabilities() from public, anon, authenticated;

-- A definition that gains or loses a capability passes it to every row that
-- points at it (the row trigger above recomputes).
create or replace function private.class_definition_capabilities_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.character_classes cc
     set capabilities = cc.capabilities
   where cc.class_definition_id = new.id
     and cc.class_definition_kind = case tg_table_name when 'system_classes' then 'system' else 'custom' end;
  return null;
end;
$$;
revoke execute on function private.class_definition_capabilities_changed() from public, anon, authenticated;

-- Rows first, then the triggers, so the backfill is one pass. The column-scoped
-- triggers on character_classes (content review, spell windows, the mirror)
-- do not fire on a capabilities-only update.
update public.character_classes cc
   set capabilities = private.class_definition_capabilities(cc.class_definition_kind, cc.class_definition_id);

create trigger character_classes_capabilities
  before insert or update on public.character_classes
  for each row execute procedure private.character_class_capabilities();

create trigger system_classes_capabilities_changed
  after update of capabilities on public.system_classes
  for each row when (old.capabilities is distinct from new.capabilities)
  execute procedure private.class_definition_capabilities_changed();
create trigger custom_classes_capabilities_changed
  after update of capabilities on public.custom_classes
  for each row when (old.capabilities is distinct from new.capabilities)
  execute procedure private.class_definition_capabilities_changed();

-- Nothing changes for anyone: every row the name rule called a druid can still
-- Wild Shape.
do $$
declare
  v_lost int;
begin
  select count(*) into v_lost
    from public.character_classes cc
   where cc.class_name ilike '%druid%'
     and not ('wild_shape' = any (cc.capabilities));
  if v_lost > 0 then
    raise exception '% druid class rows would lose Wild Shape', v_lost;
  end if;
end;
$$;
