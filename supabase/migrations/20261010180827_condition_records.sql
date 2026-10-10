-- #1018: a condition on a creature is a record, not a bare name.
--
-- `party_members.conditions` and `companions.conditions` go from text[] to a
-- jsonb array of `AppliedCondition` records (src/types/condition.types.ts), and
-- every combatant's `conditions` inside `encounter_state.combatants_live` gets
-- the same shape. A record keeps the name as its key and adds where the
-- condition came from, what ends it (a turn edge, a count of rounds, a repeat
-- save) and any ongoing damage, so the encounter runner can expire it on its own.
--
-- Existing names convert to `{ "name": ... }`, which means "lasts until
-- removed". Exhaustion was stored as the string "Exhausted N"; it becomes
-- `{ "name": "Exhaustion", "level": N }`. The old shape is not read side by
-- side anywhere (CLAUDE.md, rule 1).
--
-- Check constraints refuse a string element afterwards. A tab still running the
-- old client would otherwise write `["Prone"]` into the new column and every
-- reader would break on it; refused, the write errors and the tab reloads into
-- the new client. `jsonb_path_exists` keeps the checks subquery-free.

create function pg_temp.condition_record(p_name text) returns jsonb
language sql immutable as $$
  select case
    when p_name ~* '^exhaust(ed|ion)\s+\d$'
      then jsonb_build_object('name', 'Exhaustion', 'level', (regexp_match(p_name, '(\d)$'))[1]::int)
    else jsonb_build_object('name', p_name)
  end
$$;

create function pg_temp.condition_records(p_names text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(pg_temp.condition_record(n) order by ord), '[]'::jsonb)
  from unnest(p_names) with ordinality as t(n, ord)
$$;

-- A jsonb array that may hold old string elements, records left as they are.
create function pg_temp.condition_records_jsonb(p_list jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(
    case when jsonb_typeof(e) = 'string' then pg_temp.condition_record(e #>> '{}') else e end
    order by ord), '[]'::jsonb)
  from jsonb_array_elements(p_list) with ordinality as t(e, ord)
$$;

-- ── party_members ────────────────────────────────────────────────────────────
alter table public.party_members alter column conditions drop default;
alter table public.party_members
  alter column conditions type jsonb using pg_temp.condition_records(conditions);
alter table public.party_members alter column conditions set default '[]'::jsonb;
alter table public.party_members add constraint party_members_conditions_are_records check (
  jsonb_typeof(conditions) = 'array'
  and not jsonb_path_exists(conditions, '$[*] ? (@.type() != "object" || !exists(@.name) || @.name.type() != "string")')
);

-- ── companions ───────────────────────────────────────────────────────────────
alter table public.companions alter column conditions drop default;
alter table public.companions
  alter column conditions type jsonb using pg_temp.condition_records(conditions);
alter table public.companions alter column conditions set default '[]'::jsonb;
alter table public.companions add constraint companions_conditions_are_records check (
  jsonb_typeof(conditions) = 'array'
  and not jsonb_path_exists(conditions, '$[*] ? (@.type() != "object" || !exists(@.name) || @.name.type() != "string")')
);

-- ── encounter_state.combatants_live ──────────────────────────────────────────
update public.encounter_state s
set combatants_live = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(cb -> 'conditions') = 'array'
        then jsonb_set(cb, '{conditions}', pg_temp.condition_records_jsonb(cb -> 'conditions'))
      else cb
    end
    order by ord), '[]'::jsonb)
  from jsonb_array_elements(s.combatants_live) with ordinality as t(cb, ord)
)
where jsonb_path_exists(s.combatants_live, '$[*].conditions[*] ? (@.type() == "string")');

alter table public.encounter_state add constraint encounter_state_conditions_are_records check (
  not jsonb_path_exists(combatants_live, '$[*].conditions[*] ? (@.type() != "object" || !exists(@.name) || @.name.type() != "string")')
);
