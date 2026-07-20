-- Class grants identify their exact source class; every non-class grant must
-- carry a human-readable reason (species, feat, item, or other feature).
update public.character_spells set source_label = initcap(source_type) || ' grant'
where source_type <> 'class' and nullif(btrim(source_label), '') is null;

alter table public.character_spells add constraint character_spells_grant_reason_check
  check (source_type = 'class' or nullif(btrim(source_label), '') is not null);
