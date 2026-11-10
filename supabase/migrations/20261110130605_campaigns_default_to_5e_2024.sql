-- A campaign that names no game system is a 5e 2024 campaign (#934, the
-- maintainer, 7 Nov 2026). 20261106093841 kept the old ruleset column's 2014
-- default; the New Campaign form now starts on 5e 2024 and the client reads an
-- unloaded campaign as 5e 2024 (`DEFAULT_GAME_SYSTEM` in src/systems/registry.ts),
-- so the column says the same. Existing campaigns keep the system they have.
-- gameSystemsMirror.test.ts holds this default equal to the client's.
alter table public.campaigns
  alter column game_system set default 'dnd5e-2024';
