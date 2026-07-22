-- Migration: srd_v2_identity_transition
-- Retire legacy v1-identity SRD rows now that the v2 dual-edition seeds are live (#553).
--
-- Old (v1-seeded) SRD rows carry source_document_key = 'wotc-srd' with
-- id = source_record_key = 'srd_<name_slug>'. The v2 seeds write new rows under
-- 'srd-2014' / 'srd-2024' whose source_record_key is the same slug hyphenated,
-- so normalizing hyphens to underscores maps old -> new 1:1 (verified live
-- 2026-07-22: 319/319 spells, 322/322 monsters matched). Community/v1 rows
-- (dmag, toh, kp, warlock, o5e, a5e) are left untouched: they are still valid
-- and still referenced (e.g. character_spells rows pointing at dmag spells).
--
-- Every statement here is a no-op on a database that has no legacy rows.

-- 0) Preserve class lists: Open5e v2's srd-2014 class data regressed vs v1
--    (54/319 spells are missing at least one class the v1 row had, e.g.
--    Command lost Paladin), and characters already know spells under those
--    classes — the class-membership trigger on character_spells would reject
--    the remap. Union the old row's classes into the new row so nothing the
--    app has been serving is lost.
update srd_spells n
set classes = (
  select array_agg(distinct c order by c)
  from unnest(n.classes || o.classes) as c
)
from srd_spells o
where o.source_document_key = 'wotc-srd'
  and n.source_document_key = 'srd-2014'
  and replace(n.source_record_key, '-', '_') = o.id
  and exists (select 1 from unnest(o.classes) oc where oc <> all(n.classes));

-- 1) Remap soft references from old wotc-srd ids to their srd-2014 successors.
--    Only text id columns can hold SRD ids; uuid reference columns
--    (discovered_monsters, npcs, pinned_forms, loot_tables, items.spell_ids,
--    campaigns.excluded_monster_ids) can only point at user-copy rows.
--    The character_spells validation triggers re-check class membership and
--    per-class spell limits on every row UPDATE; a pure 1:1 identity swap
--    must not re-litigate those (characters at their limit would be rejected
--    for a no-op change). Disable them for the remap only; re-enabled below
--    within this same transaction.
alter table character_spells disable trigger character_spells_guard_revised_preparation;
alter table character_spells disable trigger character_spells_validate_limits;
alter table character_spells disable trigger character_spells_validate_source;

update character_spells cs
set spell_id = n.id
from srd_spells o
join srd_spells n
  on n.source_document_key = 'srd-2014'
 and replace(n.source_record_key, '-', '_') = o.id
where o.source_document_key = 'wotc-srd'
  and cs.spell_id = o.id;

alter table character_spells enable trigger character_spells_guard_revised_preparation;
alter table character_spells enable trigger character_spells_validate_limits;
alter table character_spells enable trigger character_spells_validate_source;

update spell_cast_records scr
set spell_id = n.id
from srd_spells o
join srd_spells n
  on n.source_document_key = 'srd-2014'
 and replace(n.source_record_key, '-', '_') = o.id
where o.source_document_key = 'wotc-srd'
  and scr.spell_id = o.id;

update companions c
set source_monster_id = n.id
from srd_monsters o
join srd_monsters n
  on n.source_document_key = 'srd-2014'
 and replace(n.source_record_key, '-', '_') = o.id
where o.source_document_key = 'wotc-srd'
  and c.source_monster_id = o.id;

-- 2) Delete the superseded legacy SRD rows.
delete from srd_spells where source_document_key = 'wotc-srd';
delete from srd_monsters where source_document_key = 'wotc-srd';

-- 3) Enabled sources: the 'wotc-srd' slug becomes 'srd-2014', and 'srd-2024'
--    is enabled for every campaign. The source-listing RPCs are ruleset-scoped
--    (get_srd_spell_sources(p_ruleset) etc.), so the extra slug is inert in
--    2014 campaigns and vice versa.
update campaign_enabled_sources
set source_slug = 'srd-2014', source_title = 'System Reference Document 5.1'
where source_slug = 'wotc-srd';

insert into campaign_enabled_sources (campaign_id, source_slug, source_title)
select id, 'srd-2014', 'System Reference Document 5.1' from campaigns
on conflict do nothing;

insert into campaign_enabled_sources (campaign_id, source_slug, source_title)
select id, 'srd-2024', 'System Reference Document 5.2' from campaigns
on conflict do nothing;

-- 4) New campaigns auto-enable both SRD editions.
create or replace function public.enable_default_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into campaign_enabled_sources (campaign_id, source_slug, source_title)
  values
    (new.id, 'srd-2014', 'System Reference Document 5.1'),
    (new.id, 'srd-2024', 'System Reference Document 5.2')
  on conflict do nothing;
  return new;
end;
$$;

-- Trigger functions never need EXECUTE for callers; keep this off the RPC surface.
revoke execute on function public.enable_default_sources() from public, anon, authenticated;
