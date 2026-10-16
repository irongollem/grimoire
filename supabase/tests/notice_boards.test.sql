begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

-- notice_boards (20261015234112, #1064): the DM pins notices to a board; players read a revealed board only through
-- get_player_notice_boards, which shows a pin's face and keeps its quest and handout back until it is taken; and while
-- the DM presents the board, any player with a character can take a notice, which reveals its quest and shares its
-- handout with the whole party. A second taker gets an answer, not an error.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10640000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10640000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-wren@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10640000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-tomas@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10640000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10640000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'board-seatless@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000001', 'The Rusty Flagon'),
  ('10640000-0000-4000-8000-000000000011', '10640000-0000-4000-8000-000000000004', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10640000-0000-4000-8000-000000000020', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'Wren', '2014'),
  ('10640000-0000-4000-8000-000000000021', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'Tomas', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000002', 'player', 'Wren', '10640000-0000-4000-8000-000000000020'),
  ('10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000003', 'player', 'Tomas', '10640000-0000-4000-8000-000000000021'),
  ('10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000005', 'player', 'Seatless', null),
  ('10640000-0000-4000-8000-000000000011', '10640000-0000-4000-8000-000000000004', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.quests (id, user_id, campaign_id, title, status) values
  ('10640000-0000-4000-8000-000000000030', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'The Ratcatcher''s Bounty', 'undiscovered'),
  ('10640000-0000-4000-8000-000000000031', '10640000-0000-4000-8000-000000000004', '10640000-0000-4000-8000-000000000011', 'Theirs', 'undiscovered');

insert into public.scriptorium_documents (id, user_id, campaign_id, title) values
  ('10640000-0000-4000-8000-000000000040', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'Writ of Bounty');

-- Session 12 is running.
insert into public.campaign_sessions (id, campaign_id, user_id, number, started_at) values
  ('10640000-0000-4000-8000-000000000050', '10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000001', 12, now());

-- The party knows the Flagon; the cellar is still undiscovered.
insert into public.locations (id, user_id, campaign_id, name, player_visible_to) values
  ('10640000-0000-4000-8000-000000000060', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'The Rusty Flagon',
   array['10640000-0000-4000-8000-000000000020', '10640000-0000-4000-8000-000000000021']::uuid[]),
  ('10640000-0000-4000-8000-000000000062', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'The cellar', '{}'),
  ('10640000-0000-4000-8000-000000000061', '10640000-0000-4000-8000-000000000004', '10640000-0000-4000-8000-000000000011', 'Their inn', '{}');

-- Wren's own campaign-less quest: the same-campaign trigger lets a pin name it (its owner is a member), so the take
-- itself must refuse to touch it.
insert into public.quests (id, user_id, campaign_id, title, status) values
  ('10640000-0000-4000-8000-000000000032', '10640000-0000-4000-8000-000000000002', null, 'Wren''s private errand', 'undiscovered');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM builds a board ─────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.notice_boards (id, user_id, campaign_id, name) values
    ('10640000-0000-4000-8000-000000000070', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'The Flagon''s board'),
    ('10640000-0000-4000-8000-000000000071', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', 'The back room')
$$, 'the DM puts up two boards');

select lives_ok($$
  insert into public.notice_board_pins (id, user_id, campaign_id, board_id, style, headline, body, reward, quest_id, handout_id, status) values
    ('10640000-0000-4000-8000-000000000080', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000070',
     'poster', 'Grell Ashmantle', 'Wanted for the burning of the miller''s barn.', '50 gold crowns',
     '10640000-0000-4000-8000-000000000030', '10640000-0000-4000-8000-000000000040', 'up'),
    ('10640000-0000-4000-8000-000000000081', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000070',
     'note', 'LOST: one goat', 'Answers to Gerald.', null, null, null, 'up'),
    ('10640000-0000-4000-8000-000000000082', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000070',
     'note', 'Masked ball', 'Not for the board yet.', null, '10640000-0000-4000-8000-000000000030', null, 'draft')
$$, 'the DM pins a wanted poster, a lost goat and a draft');

select throws_ok($$
  insert into public.notice_board_pins (user_id, campaign_id, board_id, style, quest_id) values
    ('10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010', '10640000-0000-4000-8000-000000000070', 'note',
     '10640000-0000-4000-8000-000000000031')
$$, '23514', null, 'a notice cannot offer another campaign''s quest');

select lives_ok($$
  insert into public.location_placements (user_id, location_id, notice_board_id) values
    ('10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000060', '10640000-0000-4000-8000-000000000070')
$$, 'the board hangs at the Flagon');

select lives_ok($$
  insert into public.location_placements (user_id, location_id, notice_board_id) values
    ('10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000062', '10640000-0000-4000-8000-000000000070')
$$, 'and a copy hangs in the undiscovered cellar');

select throws_ok($$
  insert into public.location_placements (user_id, location_id, notice_board_id) values
    ('10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000061', '10640000-0000-4000-8000-000000000070')
$$, '42501', null, 'a board cannot hang at a place in another campaign');

select throws_ok($$
  insert into public.location_placements (user_id, location_id, notice_board_id, library_trap_id) values
    ('10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000060', '10640000-0000-4000-8000-000000000071', 'any')
$$, '23514', null, 'a placement naming a board and a trap is refused');

-- ── Before it is revealed, a player sees nothing ──────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000002', true);

select is_empty($$ select id from public.notice_boards $$, 'a player cannot read the boards table');
select is_empty($$ select id from public.notice_board_pins $$, 'a player cannot read the pins table');
select is(public.get_player_notice_boards('10640000-0000-4000-8000-000000000010'), '[]'::jsonb, 'an unrevealed board is not projected');

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000001', true);
select lives_ok($$ update public.notice_boards set is_revealed = true where id = '10640000-0000-4000-8000-000000000070' $$, 'the DM reveals the board');
select throws_ok($$ update public.notice_boards set presented_at = now() where id = '10640000-0000-4000-8000-000000000071' $$,
  '23514', null, 'an unrevealed board cannot be presented');

-- ── A revealed board: faces, never links ──────────────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000002', true);

select is(jsonb_array_length(public.get_player_notice_boards('10640000-0000-4000-8000-000000000010') -> 0 -> 'pins'), 2,
  'the player sees the two pins that are up, not the draft');
select is((select (p ->> 'offers')::boolean and p -> 'quest_id' = 'null'::jsonb and p -> 'handout_id' = 'null'::jsonb
             from jsonb_array_elements(public.get_player_notice_boards('10640000-0000-4000-8000-000000000010') -> 0 -> 'pins') p
            where p ->> 'id' = '10640000-0000-4000-8000-000000000080'),
  true, 'the poster says it offers something, and not what');
select is(public.get_player_notice_boards('10640000-0000-4000-8000-000000000010') -> 0 -> 'location_ids',
  '["10640000-0000-4000-8000-000000000060"]'::jsonb, 'the projection says where the board hangs, and only where the party has been');
select throws_ok($$ select public.take_notice_board_pin('10640000-0000-4000-8000-000000000080') $$,
  '42501', 'The board is not in front of the party', 'nothing can be taken until the DM presents the board');

-- ── Who may not ───────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000004', true);
select throws_ok($$ select public.get_player_notice_boards('10640000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'someone outside the campaign cannot read its boards');
select throws_ok($$ select public.take_notice_board_pin('10640000-0000-4000-8000-000000000080') $$,
  '42501', 'Not authorized', 'someone outside the campaign cannot take a notice');
select throws_ok($$ select public.take_notice_board_pin('10640000-0000-4000-8000-0000000000ff') $$,
  '42501', 'Not authorized', 'and cannot tell a pin that does not exist from one that does');

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000005', true);
select throws_ok($$ select public.take_notice_board_pin('10640000-0000-4000-8000-000000000080') $$,
  '42501', 'Not authorized', 'a player without a character cannot take a notice');

-- ── One board in front of the party at a time ─────────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000001', true);
select lives_ok($$ update public.notice_boards set presented_at = now() where id = '10640000-0000-4000-8000-000000000070' $$, 'the DM presents the board');
select lives_ok($$ update public.notice_boards set is_revealed = true, presented_at = now() where id = '10640000-0000-4000-8000-000000000071' $$,
  'the DM presents the back room');
select is((select presented_at is null from public.notice_boards where id = '10640000-0000-4000-8000-000000000070'), true,
  'presenting the back room takes the first board down');
select lives_ok($$ update public.notice_boards set presented_at = now() where id = '10640000-0000-4000-8000-000000000070' $$, 'the DM presents the first board again');
select is((select presented_at is null from public.notice_boards where id = '10640000-0000-4000-8000-000000000071'), true,
  'and the back room comes down');

-- ── Taking ────────────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.take_notice_board_pin('10640000-0000-4000-8000-000000000082') $$,
  'P0002', 'Notice not found', 'a draft cannot be taken: it is not on the board');
select throws_ok($$ select public.take_notice_board_pin('10640000-0000-4000-8000-000000000081') $$,
  '22023', 'This notice offers nothing to take', 'a notice that offers nothing stays on the board');
select is(public.take_notice_board_pin('10640000-0000-4000-8000-000000000080') ->> 'outcome', 'taken', 'Wren takes the wanted poster');

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000003', true);
select is(public.take_notice_board_pin('10640000-0000-4000-8000-000000000080') ->> 'outcome', 'already_taken',
  'Tomas, a moment late, is answered, not refused');
select is(public.take_notice_board_pin('10640000-0000-4000-8000-000000000080') ->> 'handout_id', '10640000-0000-4000-8000-000000000040',
  'and is handed the same handout to open');

-- ── What the take did ─────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000001', true);
select is((select status::text from public.quests where id = '10640000-0000-4000-8000-000000000030'), 'active', 'the quest has begun');
select is((select player_visible_to @> array['10640000-0000-4000-8000-000000000020', '10640000-0000-4000-8000-000000000021']::uuid[]
             from public.quests where id = '10640000-0000-4000-8000-000000000030'), true, 'the whole party sees the quest');
select is((select player_visible_to @> array['10640000-0000-4000-8000-000000000020', '10640000-0000-4000-8000-000000000021']::uuid[]
             from public.scriptorium_documents where id = '10640000-0000-4000-8000-000000000040'), true, 'the whole party has the handout');
select is((select taken_session_number from public.notice_board_pins where id = '10640000-0000-4000-8000-000000000080'), 12,
  'the stub remembers it was session 12');
select is((select count(*)::int from public.campaign_messages
            where campaign_id = '10640000-0000-4000-8000-000000000010' and type = 'system'
              and message = '📌 Wren took the wanted poster for Grell Ashmantle from The Flagon''s board.'), 1, 'the table hears who took it');
select throws_ok($$ update public.notice_board_pins set status = 'up' where id = '10640000-0000-4000-8000-000000000080' $$,
  '23514', 'new row for relation "notice_board_pins" violates check constraint "notice_board_pins_taken_has_time"',
  'pinning a notice back up clears its take, or is refused');
select throws_ok($$ update public.notice_board_pins set quest_id = null where id = '10640000-0000-4000-8000-000000000080' $$,
  '23514', 'A taken notice keeps what it offered', 'a taken notice cannot be re-pointed at another quest');

-- A pin naming Wren's private quest: taking it reveals nothing of it.
select lives_ok($$
  insert into public.notice_board_pins (id, user_id, campaign_id, board_id, style, headline, quest_id) values
    ('10640000-0000-4000-8000-000000000083', '10640000-0000-4000-8000-000000000001', '10640000-0000-4000-8000-000000000010',
     '10640000-0000-4000-8000-000000000070', 'note', 'An errand', '10640000-0000-4000-8000-000000000032')
$$, 'the DM pins a notice naming a member''s campaign-less quest');

select set_config('request.jwt.claim.sub', '10640000-0000-4000-8000-000000000002', true);
select is((select p ->> 'quest_id' from jsonb_array_elements(public.get_player_notice_boards('10640000-0000-4000-8000-000000000010')) b,
                 jsonb_array_elements(b -> 'pins') p
            where p ->> 'id' = '10640000-0000-4000-8000-000000000080'), '10640000-0000-4000-8000-000000000030',
  'once taken, the projection names the quest');
select is((select p ->> 'taken_by_name' from jsonb_array_elements(public.get_player_notice_boards('10640000-0000-4000-8000-000000000010')) b,
                 jsonb_array_elements(b -> 'pins') p
            where p ->> 'id' = '10640000-0000-4000-8000-000000000080'), 'Wren', 'and who took it');
select is(public.take_notice_board_pin('10640000-0000-4000-8000-000000000083') ->> 'outcome', 'taken', 'Wren takes the errand notice');
select is((select status::text || ':' || cardinality(player_visible_to)::text from public.quests
            where id = '10640000-0000-4000-8000-000000000032'), 'undiscovered:0',
  'and her private quest outside the campaign is left exactly as it was');

select * from finish();
rollback;
