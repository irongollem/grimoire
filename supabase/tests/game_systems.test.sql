-- #934 stories 1-2: a campaign plays a game system, every system is its own, and
-- compatibility (declared, not special-cased) decides switching and seating.
--
--   1 Dana (DM)   2 Pat (player, owns a 2014 and a 2024 character)

begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('93500000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'game-systems-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('93500000-0000-4000-8000-0000000000c1', '93500000-0000-4000-8000-000000000001', 'Five-fourteen', 'dnd5e-2014'),
  ('93500000-0000-4000-8000-0000000000c2', '93500000-0000-4000-8000-000000000001', 'Neutral ground', 'generic');

-- ── The registry ────────────────────────────────────────────────────────────
select is(private.game_systems_compatible('dnd5e-2014', 'dnd5e-2024'), true,
  '5e 2014 and 5e 2024 are compatible');
select is(private.game_systems_compatible('dnd5e-2014', 'generic'), false,
  'Generic is compatible with no 5e system');
-- Bug: an authorization-style predicate that answers null lets a negated check fall through.
select is(private.game_systems_compatible(null, 'dnd5e-2014'), false,
  'compatibility is total: an unknown system is compatible with nothing (never null)');
select is(private.game_system_edition('dnd5e-2024'), '2024', 'a 5e system names its edition');
-- Bug: 5e code reached from a Generic campaign quietly played 2014.
select throws_ok($$ select private.game_system_edition('generic') $$, '22023', null,
  'asking a Generic campaign for a 5e edition fails loudly, it never falls back to 2014');

-- ── The column ──────────────────────────────────────────────────────────────
select throws_ok($$
  insert into public.campaigns (user_id, name, game_system)
  values ('93500000-0000-4000-8000-000000000001', 'Typo', 'dnd5e')
$$, '23514', null, 'a game system the registry does not know is refused');
select throws_ok($$
  update public.campaigns set allows_mixed_rulesets = true where id = '93500000-0000-4000-8000-0000000000c2'
$$, '23514', null, 'a Generic campaign cannot take characters of another system: it has no compatible one');
select is(not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'campaigns' and column_name = 'ruleset'),
  true, 'campaigns.ruleset is gone: the system is the only record of what a campaign plays');

-- ── Switching ───────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"93500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  update public.campaigns set game_system = 'dnd5e-2024' where id = '93500000-0000-4000-8000-0000000000c1'
$$, 'a 5e 2014 campaign may move to the compatible 5e 2024');
select is((select game_system from public.campaigns where id = '93500000-0000-4000-8000-0000000000c1'), 'dnd5e-2024',
  'and the move is kept');
select throws_ok($$
  update public.campaigns set game_system = 'generic' where id = '93500000-0000-4000-8000-0000000000c1'
$$, '22023', null, 'a 5e campaign cannot switch to Generic, an incompatible system');
select throws_ok($$
  update public.campaigns set game_system = 'dnd5e-2014' where id = '93500000-0000-4000-8000-0000000000c2'
$$, '22023', null, 'a Generic campaign cannot switch to 5e either');
reset role;

-- ── Seating ─────────────────────────────────────────────────────────────────
select throws_ok($$ select private.assert_ruleset_admissible('2014', '93500000-0000-4000-8000-0000000000c1') $$,
  'RS001', null, 'a 2014 character is bounced from a 5e 2024 table that takes no other system');
update public.campaigns set allows_mixed_rulesets = true where id = '93500000-0000-4000-8000-0000000000c1';
select lives_ok($$ select private.assert_ruleset_admissible('2014', '93500000-0000-4000-8000-0000000000c1') $$,
  'with mixed seating on, a 5e 2024 table takes a 2014 character: the systems are compatible');
select throws_ok($$ select private.assert_ruleset_admissible('2014', '93500000-0000-4000-8000-0000000000c2') $$,
  'RS001', 'This table plays no rules system and does not take 2014 characters',
  'a Generic table seats no 5e character at all');
select is(private.campaign_seats_edition('dnd5e-2014', true, null), false,
  'a character with no edition is seated nowhere (never null)');

select * from finish();
rollback;
