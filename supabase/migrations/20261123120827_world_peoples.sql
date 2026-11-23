-- The peoples of the world (#1255 item 30; maintainer, 23 Nov 2026).
--
-- Generated NPCs came out mostly human: the generator's species list was fifteen hard-coded names, and a species left
-- blank was the model's to choose, which chooses humans. Nothing in the canon said who lives in the world.
--
-- `campaigns.peoples` says it as percentages, so a world where elves are 80% of the people makes an elf 80% of the
-- time: an array of { "name": text, "percent": number }, in the DM's order. The roll is made in code and handed to
-- the generator as a constraint, never left to the model, which cannot sample. What the percentages leave over (a list
-- that sums to 70) is "anyone else": a people the DM did not list.
--
-- It lives on the campaign row beside the calendar, the climate and the coins ("How the world works"), which every
-- member may read: who lives in a world is not a secret. An empty list is "not said", and every generator behaves as
-- it did before.

create function private.valid_peoples(p_peoples jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_p jsonb;
  v_total numeric := 0;
begin
  if p_peoples is null or jsonb_typeof(p_peoples) <> 'array' or jsonb_array_length(p_peoples) > 40 then return false; end if;

  for v_p in select e from jsonb_array_elements(p_peoples) e loop
    if jsonb_typeof(v_p) <> 'object'
       or jsonb_typeof(v_p->'name') is distinct from 'string'
       or char_length(btrim(v_p->>'name')) not between 1 and 60
       or jsonb_typeof(v_p->'percent') is distinct from 'number' then
      return false;
    end if;
    -- A separate step: the cast is only safe once the value is known to be a number.
    if (v_p->>'percent')::numeric < 0 or (v_p->>'percent')::numeric > 100 then return false; end if;
    v_total := v_total + (v_p->>'percent')::numeric;
  end loop;

  -- One name, one share: a people listed twice would be rolled at the sum of two numbers the DM never saw added.
  return v_total <= 100
    and (select count(distinct lower(btrim(e->>'name'))) from jsonb_array_elements(p_peoples) e) = jsonb_array_length(p_peoples);
end;
$$;

alter table public.campaigns
  add column peoples jsonb not null default '[]'::jsonb,
  add constraint campaigns_peoples_valid check (private.valid_peoples(peoples));

comment on column public.campaigns.peoples is
  'Who lives in the world, as percentages: [{ "name", "percent" }]. Empty when the DM has not said. Rolled in code when a generator invents a person (#1255).';
