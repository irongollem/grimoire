-- Migration: stat_block_save_conditions_own_their_ends
--
-- #1055. A structured save (`SaveStructure`, src/types/statBlock.types.ts) used to
-- hold its conditions as names plus ONE `ends` for all of them:
--
--   {"conditions": ["Frightened", "Restrained"], "ends": {"kind": "save", "at": "end"}}
--
-- That cannot say what the Alp's Sleep Breath says ("ending the restrained
-- condition on itself on a success"; Frightened keeps its minute). Each condition
-- now carries its own end:
--
--   {"conditions": [{"name": "Frightened", "ends": {"kind": "rounds", "remaining": 10}},
--                   {"name": "Restrained", "ends": {"kind": "save", "at": "end", "remaining": 10}}]}
--
-- Saves sit in `structured.save` and in `structured.options[].save` of every entry
-- of every list.
--
-- Two parts, the same pair as the #1017 contract (20261010004946):
--
-- 1. The write guard (`private.guard_stat_block_shape`) converts the old shape on
--    every write, because the old client lives on in installed PWAs for days and
--    would otherwise store a save the new client cannot read. The conversion gives
--    the old `ends` to every condition, which is exactly what it meant: the old
--    runner applied it to each of them. A write-time invariant, not a read
--    fallback: nothing reads the old shape, because it can no longer be stored.
--
-- 2. Every stored row in the old shape is rewritten in place (`set stat_block =
--    stat_block`), so the guard converts it. That carries the old meaning over
--    unchanged; `npm run stat-blocks:structure -- --write` then re-parses the
--    parsed and extracted saves into per-condition ends and round caps. A DM's own
--    (`manual`) structure is never re-parsed, so for it the conversion is final
--    and the DM refines it in the editor.

create function private.save_with_condition_ends(save jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(save) is distinct from 'object' then save
    when jsonb_typeof(save -> 'conditions') = 'array' then
      (save - 'ends') || jsonb_build_object('conditions', (
        select coalesce(jsonb_agg(
                 case
                   when jsonb_typeof(c.v) = 'string' then
                     jsonb_build_object('name', c.v)
                     || case when jsonb_typeof(save -> 'ends') = 'object'
                             then jsonb_build_object('ends', save -> 'ends')
                             else '{}'::jsonb end
                   else c.v
                 end
                 order by c.ord
               ), '[]'::jsonb)
          from jsonb_array_elements(save -> 'conditions') with ordinality as c(v, ord)
      ))
    else save - 'ends'
  end
$$;

create function private.structured_with_condition_ends(s jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(s) is distinct from 'object' then s
    else s
      || case when jsonb_typeof(s -> 'save') = 'object'
              then jsonb_build_object('save', private.save_with_condition_ends(s -> 'save'))
              else '{}'::jsonb end
      || case when jsonb_typeof(s -> 'options') = 'array'
              then jsonb_build_object('options', (
                select coalesce(jsonb_agg(
                         case
                           when jsonb_typeof(o.v) = 'object' and jsonb_typeof(o.v -> 'save') = 'object'
                           then o.v || jsonb_build_object('save', private.save_with_condition_ends(o.v -> 'save'))
                           else o.v
                         end
                         order by o.ord
                       ), '[]'::jsonb)
                  from jsonb_array_elements(s -> 'options') with ordinality as o(v, ord)
              ))
              else '{}'::jsonb end
  end
$$;

-- These keep their default EXECUTE grant on purpose. The guard is not a definer,
-- so it calls them as the role writing the stat block (a DM, the service role),
-- and a revoke would make every stat-block save fail with "permission denied".
-- PostgREST does not publish `private`, so the grant puts nothing on the RPC surface.

-- The #1017 guard (20261010004946), with one change: an entry that has a
-- `structured` object has its saves brought to the per-condition shape.
create or replace function private.guard_stat_block_shape()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  b jsonb := new.stat_block;
  k text;
  l text;
begin
  if b is null or jsonb_typeof(b) <> 'object' then
    return new;
  end if;

  foreach k in array array['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities'] loop
    if jsonb_typeof(b -> k) = 'string' and lower(btrim(b ->> k)) not in ('', 'false', '[]') then
      raise exception 'This stat block was saved in an older format. Reload the app and save it again.'
        using errcode = 'check_violation',
              detail = format('%s still holds prose; stat blocks now keep defenses in a typed `defenses` object (#1017).', k);
    end if;
    b := b - k;
  end loop;

  if jsonb_typeof(b -> 'defenses') is distinct from 'object' then
    b := b || jsonb_build_object('defenses', jsonb_build_object(
      'resistances', '[]'::jsonb, 'immunities', '[]'::jsonb, 'vulnerabilities', '[]'::jsonb, 'condition_immunities', '[]'::jsonb
    ));
  end if;

  foreach l in array array['special_abilities', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'lair_actions'] loop
    if jsonb_typeof(b -> l) = 'array' then
      b := jsonb_set(b, array[l], (
        select coalesce(jsonb_agg(
                 case
                   when jsonb_typeof(x.entry) = 'object' and jsonb_typeof(x.entry -> 'structured') is distinct from 'object'
                   then x.entry || jsonb_build_object('structured', jsonb_build_object('kind', 'other', 'source', 'parsed'))
                   when jsonb_typeof(x.entry) = 'object'
                   then x.entry || jsonb_build_object('structured', private.structured_with_condition_ends(x.entry -> 'structured'))
                   else x.entry
                 end
                 order by x.ord
               ), '[]'::jsonb)
          from jsonb_array_elements(b -> l) with ordinality as x(entry, ord)
      ));
    end if;
  end loop;

  new.stat_block := b;
  return new;
end
$$;

revoke execute on function private.guard_stat_block_shape() from public, anon, authenticated;

-- Part 2: let the guard convert every stored save still in the old shape.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['library_monsters', 'monsters', 'npcs', 'companions', 'hall_of_heroes'] loop
    execute format($q$
      update public.%I
         set stat_block = stat_block
       where jsonb_typeof(stat_block) = 'object'
         and (jsonb_path_exists(stat_block, '$.*[*].structured.save ? (exists(@.ends) || exists(@.conditions[*] ? (@.type() == "string")))')
           or jsonb_path_exists(stat_block, '$.*[*].structured.options[*].save ? (exists(@.ends) || exists(@.conditions[*] ? (@.type() == "string")))'))
    $q$, tbl);
  end loop;
end
$$;
