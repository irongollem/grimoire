-- Jack of All Trades comes from the class definition, like Wild Shape (#1147).
--
-- A Bard of 2nd level or higher adds half their proficiency bonus, rounded
-- down, to an ability check without it (PHB 2014 / SRD 5.2 "Bard"; the two
-- editions differ in which checks, which the client decides per character
-- edition in `src/rules/skillCheck.ts`). Nothing scored it. Who has it is a
-- capability of the class definition, the rule #934 set for Wild Shape
-- (`20261102100215`): a homebrew class can grant it with a tick in the class
-- editor, and a class merely named "Bard" need not have it. The existing
-- triggers copy a definition's list onto every character class row, so the
-- sheet learns it from the rows it already loads.
--
-- Granted here by concept key alone, never by name: the library Bard in both
-- editions, and a Bard imported from a book into custom_classes. A copy of
-- the Bard made from now on copies the capability with the rest of the class
-- (`customClassCopy`), and a homebrew bard is the DM's to tick. (When this was
-- written, production held no custom class keyed or named like a bard.)

alter table public.system_classes
  drop constraint system_classes_capabilities_known,
  add constraint system_classes_capabilities_known
    check (capabilities <@ array['wild_shape', 'jack_of_all_trades']::text[]);
alter table public.custom_classes
  drop constraint custom_classes_capabilities_known,
  add constraint custom_classes_capabilities_known
    check (capabilities <@ array['wild_shape', 'jack_of_all_trades']::text[]);

-- The `*_capabilities_changed` triggers pass each update on to the class rows
-- that point at the definition.
update public.system_classes sc
   set capabilities = array_append(sc.capabilities, 'jack_of_all_trades')
 where sc.conceptual_key = 'bard'
   and not ('jack_of_all_trades' = any (sc.capabilities));
update public.custom_classes cu
   set capabilities = array_append(cu.capabilities, 'jack_of_all_trades')
 where cu.conceptual_key = 'bard'
   and not ('jack_of_all_trades' = any (cu.capabilities));

-- Every library Bard row now carries it.
do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
    from public.character_classes cc
    join public.system_classes sc on sc.id = cc.class_definition_id and cc.class_definition_kind = 'system'
   where sc.conceptual_key = 'bard'
     and not ('jack_of_all_trades' = any (cc.capabilities));
  if v_missing > 0 then
    raise exception '% Bard class rows did not receive Jack of All Trades', v_missing;
  end if;
end;
$$;
