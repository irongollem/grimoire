begin;
set constraints all immediate;

create extension if not exists pgtap with schema extensions;
select plan(61);

-- A Scriptorium document is a book of chapters (#1115 story 13, 20261029222021).
--
-- Pins the three things the move put at risk: who may read and write a chapter (a player
-- never selects one; they read through get_player_handout, which strips what players may
-- not see), that every chapter write keeps its book's word count and updated_at, and that a
-- note (the author's own Inspect note) stays the author's and stays inside its own book.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('98300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc-author@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc-codm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc-holder@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc-bystander@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('98300000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sc-otherdm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000001', 'Ashmouth'),
  ('98300000-0000-4000-8000-000000000011', '98300000-0000-4000-8000-000000000006', 'Elsewhere');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('98300000-0000-4000-8000-000000000030', '98300000-0000-4000-8000-000000000003', '98300000-0000-4000-8000-000000000010', 'Holder', '2014'),
  ('98300000-0000-4000-8000-000000000031', '98300000-0000-4000-8000-000000000004', '98300000-0000-4000-8000-000000000010', 'Bystander', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000001', 'dm', 'Author', null),
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000002', 'dm', 'Co-DM', null),
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000003', 'player', 'Holder', '98300000-0000-4000-8000-000000000030'),
  ('98300000-0000-4000-8000-000000000010', '98300000-0000-4000-8000-000000000004', 'player', 'Bystander', '98300000-0000-4000-8000-000000000031'),
  ('98300000-0000-4000-8000-000000000011', '98300000-0000-4000-8000-000000000006', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

insert into public.npcs (id, user_id, campaign_id, name) values
  ('98300000-0000-4000-8000-000000000020', '98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'Ser Vallis');

-- 80: the shared two-chapter book the holder reads. 81: a draft nobody was given.
-- 82: an account-wide book. 83: another shared book (a foreign chapter id comes from here).
-- 84: a book whose only entity embed is in its SECOND chapter.
-- 85: a book whose only entity embeds sit in a DM-only secret block and a lens pair's Deep half.
insert into public.scriptorium_documents (id, user_id, campaign_id, title, player_visible_to) values
  ('98300000-0000-4000-8000-000000000080', '98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'The Almanac', array['98300000-0000-4000-8000-000000000030']::uuid[]),
  ('98300000-0000-4000-8000-000000000081', '98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'Draft', '{}'::uuid[]),
  ('98300000-0000-4000-8000-000000000082', '98300000-0000-4000-8000-000000000001', null, 'Account-wide', '{}'::uuid[]),
  ('98300000-0000-4000-8000-000000000083', '98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'Other handout', array['98300000-0000-4000-8000-000000000030']::uuid[]),
  ('98300000-0000-4000-8000-000000000084', '98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'Two chapters', '{}'::uuid[]),
  ('98300000-0000-4000-8000-000000000085', '98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000010', 'Hidden embeds', '{}'::uuid[]);

-- The Almanac's second chapter is inserted FIRST, so creation order and position disagree.
insert into public.scriptorium_chapters (id, document_id, position, title, word_count, content) values
  ('98300000-0000-4000-8000-0000000000a2', '98300000-0000-4000-8000-000000000080', 2, 'Second', 5,
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"two"}]}]}'),
  ('98300000-0000-4000-8000-0000000000a1', '98300000-0000-4000-8000-000000000080', 1, 'First', 10,
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"one"}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"HIDDEN"}]}]},{"type":"lensPair","attrs":{"variant":"boxed"},"content":[{"type":"lensBright","content":[{"type":"paragraph","content":[{"type":"text","text":"kind"}]}]},{"type":"lensDeep","content":[{"type":"paragraph","content":[{"type":"text","text":"grim"}]}]}]}]}'),
  ('98300000-0000-4000-8000-0000000000a3', '98300000-0000-4000-8000-000000000081', 0, 'Draft ch', 1,
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"draft text"}]}]}'),
  ('98300000-0000-4000-8000-0000000000a4', '98300000-0000-4000-8000-000000000082', 0, 'Wide ch', 1,
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"wide text"}]}]}'),
  ('98300000-0000-4000-8000-0000000000a5', '98300000-0000-4000-8000-000000000083', 0, 'Elsewhere ch', 1,
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"OTHERBOOK"}]}]}'),
  ('98300000-0000-4000-8000-0000000000a6', '98300000-0000-4000-8000-000000000084', 1, 'Plain', 1,
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"nothing linked here"}]}]}'),
  ('98300000-0000-4000-8000-0000000000a7', '98300000-0000-4000-8000-000000000084', 2, 'Linked', 1,
   '{"type":"doc","content":[{"type":"entityEmbed","attrs":{"entityType":"npc","entityId":"98300000-0000-4000-8000-000000000020","showArt":false,"reveal":null}}]}'),
  ('98300000-0000-4000-8000-0000000000a8', '98300000-0000-4000-8000-000000000085', 0, 'Hidden', 1,
   '{"type":"doc","content":[{"type":"secretBlock","content":[{"type":"entityEmbed","attrs":{"entityType":"npc","entityId":"98300000-0000-4000-8000-000000000020","showArt":false,"reveal":null}}]},{"type":"lensPair","attrs":{"variant":"boxed"},"content":[{"type":"lensBright","content":[{"type":"paragraph","content":[{"type":"text","text":"kind"}]}]},{"type":"lensDeep","content":[{"type":"entityEmbed","attrs":{"entityType":"npc","entityId":"98300000-0000-4000-8000-000000000020","showArt":false,"reveal":null}}]}]}]}');

-- ── The holder: reads through get_player_handout, never from the table ──────

set local role authenticated;
select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select jsonb_path_query_array(public.get_player_handout('98300000-0000-4000-8000-000000000080'), '$.chapters[*].title')),
  '["First", "Second"]'::jsonb,
  'the holder reads the chapter list in position order (fails if it is ordered by creation, or the holder is refused)');

select is(
  public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' ->> 'title',
  'First', 'with no chapter named, the first by position comes back');

select is(
  public.get_player_handout('98300000-0000-4000-8000-000000000080', '98300000-0000-4000-8000-0000000000a2') -> 'chapter' ->> 'title',
  'Second', 'a named chapter of the book comes back');

select ok(
  (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text like '%one%'
  and (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text like '%kind%',
  'the holder gets the ordinary text and the Bright half (positive control for the two withheld checks below)');

select ok(
  (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text not like '%HIDDEN%'
  and (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text not like '%secretBlock%',
  'a DM-only secret block never reaches the holder (fails if the projection stops stripping secretBlock)');

select ok(
  (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text not like '%grim%'
  and (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text not like '%lensDeep%',
  'the Deep half of a lens pair never reaches the holder (fails if the projection stops stripping lensDeep)');

select is(
  public.get_player_handout('98300000-0000-4000-8000-000000000080', '98300000-0000-4000-8000-0000000000a5') -> 'chapter',
  'null'::jsonb,
  'a chapter id from ANOTHER book returns no chapter, never that book''s text (fails if the chapter is looked up by id alone)');

select is_empty(
  $$ select id from public.scriptorium_chapters $$,
  'the holder selects no chapter row at all, the shared book''s included (fails if the select policy admits holders)');

select throws_ok(
  $$ select public.get_player_handout('98300000-0000-4000-8000-000000000081') $$,
  '42501', null, 'a book not given to the holder is refused (fails if the holder check is dropped)');

select throws_ok(
  $$ select public.get_player_handout('98300000-0000-4000-8000-000000000082') $$,
  '42501', null, 'an account-wide book is never a handout');

select throws_ok(
  $$ select public.get_player_handout('98300000-0000-4000-8000-0000000000ff') $$,
  '42501', null, 'an unknown book id is refused alike, not answered with null');

select throws_ok(
  $$ insert into public.scriptorium_chapters (document_id, position) values ('98300000-0000-4000-8000-000000000080', 9) $$,
  '42501', null, 'a holder cannot add a chapter to the book');

select is_empty(
  $$ update public.scriptorium_chapters set title = 'Defaced' returning id $$,
  'a holder cannot rewrite a chapter');

select is_empty(
  $$ delete from public.scriptorium_chapters returning id $$,
  'a holder cannot delete a chapter');

-- ── The bystander (same table, not given the book) and the outsider ─────────

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$ select public.get_player_handout('98300000-0000-4000-8000-000000000080') $$,
  '42501', null, 'a player at the table who was not given the book is refused');

select is_empty($$ select id from public.scriptorium_chapters $$, 'and selects no chapter');

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000005', true);

select throws_ok(
  $$ select public.get_player_handout('98300000-0000-4000-8000-000000000080') $$,
  '42501', null, 'a non-member is refused (fails if membership is not checked)');

select is_empty($$ select id from public.scriptorium_chapters $$, 'a non-member selects no chapter');

select throws_ok(
  $$ insert into public.scriptorium_chapters (document_id, position) values ('98300000-0000-4000-8000-000000000081', 9) $$,
  '42501', null, 'a non-member cannot add a chapter');

-- ── A DM of a different campaign ────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000006', true);

select throws_ok(
  $$ select public.get_player_handout('98300000-0000-4000-8000-000000000080') $$,
  '42501', null, 'a DM of another campaign is refused (fails if any DM is let in)');

select is_empty($$ select id from public.scriptorium_chapters $$, 'and reads no chapter of this campaign, nor the account-wide book of a DM they share no table with');

select throws_ok(
  $$ insert into public.scriptorium_chapters (document_id, position) values ('98300000-0000-4000-8000-000000000080', 9) $$,
  '42501', null, 'and cannot add a chapter');

select is_empty(
  $$ update public.scriptorium_chapters set title = 'Defaced' returning id $$,
  'and cannot rewrite one');

-- ── The co-DM: sees the stripped view, edits, and reads the author's account-wide book ──

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000002', true);

select ok(
  (public.get_player_handout('98300000-0000-4000-8000-000000000081') -> 'chapter' -> 'content')::text like '%draft text%',
  'a DM of the campaign previews even an unshared book through get_player_handout');

select ok(
  (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text not like '%HIDDEN%'
  and (public.get_player_handout('98300000-0000-4000-8000-000000000080') -> 'chapter' -> 'content')::text not like '%grim%',
  'and the DM''s preview is the stripped view players get, not the raw text');

select is(
  (select count(*)::integer from public.scriptorium_chapters where document_id = '98300000-0000-4000-8000-000000000080'),
  2, 'the co-DM reads the book''s chapters from the table');

select lives_ok(
  $$ insert into public.scriptorium_chapters (id, document_id, position, title) values ('98300000-0000-4000-8000-0000000000b1', '98300000-0000-4000-8000-000000000081', 5, 'Co-DM wrote') $$,
  'the co-DM adds a chapter');

select isnt_empty(
  $$ update public.scriptorium_chapters set title = 'Co-DM edited' where id = '98300000-0000-4000-8000-0000000000b1' returning id $$,
  'the co-DM edits a chapter');

select isnt_empty(
  $$ delete from public.scriptorium_chapters where id = '98300000-0000-4000-8000-0000000000b1' returning id $$,
  'and deletes one');

select is(
  (select title from public.scriptorium_chapters where document_id = '98300000-0000-4000-8000-000000000082'),
  'Wide ch', 'the co-DM reads the author''s account-wide book at their shared table');

select is_empty(
  $$ update public.scriptorium_chapters set title = 'Defaced' where document_id = '98300000-0000-4000-8000-000000000082' returning id $$,
  'but cannot rewrite it (read-only library access)');

select throws_ok(
  $$ insert into public.scriptorium_chapters (document_id, position) values ('98300000-0000-4000-8000-000000000082', 9) $$,
  '42501', null, 'nor add to it');

select is_empty(
  $$ delete from public.scriptorium_chapters where document_id = '98300000-0000-4000-8000-000000000082' returning id $$,
  'nor delete from it');

-- ── The author ──────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ insert into public.scriptorium_chapters (id, document_id, position, title) values ('98300000-0000-4000-8000-0000000000b2', '98300000-0000-4000-8000-000000000081', 6, 'Author wrote') $$,
  'the author adds a chapter');

select isnt_empty(
  $$ update public.scriptorium_chapters set title = 'Author edited' where id = '98300000-0000-4000-8000-0000000000b2' returning id $$,
  'the author edits a chapter');

select isnt_empty(
  $$ delete from public.scriptorium_chapters where id = '98300000-0000-4000-8000-0000000000b2' returning id $$,
  'the author deletes a chapter');

-- ── The notes ───────────────────────────────────────────────────────────────

select lives_ok(
  $$ insert into public.scriptorium_notes (id, user_id, document_id, chapter_id, block_id, body)
     values ('98300000-0000-4000-8000-0000000000c1', '98300000-0000-4000-8000-000000000001',
             '98300000-0000-4000-8000-000000000080', '98300000-0000-4000-8000-0000000000a1', 'blk1', 'author note') $$,
  'the author pins a note to a block of a chapter');

select throws_ok(
  $$ insert into public.scriptorium_notes (user_id, document_id, chapter_id, body)
     values ('98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000081',
             '98300000-0000-4000-8000-0000000000a1', 'wrong book') $$,
  '23503', null, 'a note cannot name a chapter of another book (fails if the composite key is plain on chapter_id)');

select throws_ok(
  $$ insert into public.scriptorium_notes (user_id, document_id, chapter_id, body)
     values ('98300000-0000-4000-8000-000000000002', '98300000-0000-4000-8000-000000000080',
             '98300000-0000-4000-8000-0000000000a1', 'as someone else') $$,
  '42501', null, 'a note cannot be written in someone else''s name');

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$ insert into public.scriptorium_notes (id, user_id, document_id, chapter_id, body)
     values ('98300000-0000-4000-8000-0000000000c2', '98300000-0000-4000-8000-000000000002',
             '98300000-0000-4000-8000-000000000080', '98300000-0000-4000-8000-0000000000a1', 'codm note') $$,
  'a co-DM, who may edit the book, makes a note of their own');

select throws_ok(
  $$ update public.scriptorium_notes
        set document_id = '98300000-0000-4000-8000-000000000082', chapter_id = '98300000-0000-4000-8000-0000000000a4'
      where id = '98300000-0000-4000-8000-0000000000c2' $$,
  '42501', null,
  'a co-DM cannot carry their note onto a book they may read but not edit (fails if the update check drops can_edit_book)');

select is(
  (select array_agg(body) from public.scriptorium_notes),
  array['codm note'], 'and sees only their own notes, not the author''s (fails if notes are readable by anyone who edits the book)');

select is_empty(
  $$ update public.scriptorium_notes set body = 'rewritten' where id = '98300000-0000-4000-8000-0000000000c1' returning id $$,
  'and cannot rewrite the author''s note');

select is_empty(
  $$ delete from public.scriptorium_notes where id = '98300000-0000-4000-8000-0000000000c1' returning id $$,
  'or delete it');

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$ insert into public.scriptorium_notes (user_id, document_id, chapter_id, body)
     values ('98300000-0000-4000-8000-000000000003', '98300000-0000-4000-8000-000000000080',
             '98300000-0000-4000-8000-0000000000a1', 'holder note') $$,
  '42501', null, 'a holder, who cannot edit the book, cannot make a note on it (fails if the insert check drops can_edit_book)');

select is_empty($$ select id from public.scriptorium_notes $$, 'and reads no one''s notes');

-- ── The share dry run reads every chapter ───────────────────────────────────

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000001', true);

select is(
  (select jsonb_path_query_array(
     public.share_handout('98300000-0000-4000-8000-000000000084', array['98300000-0000-4000-8000-000000000030']::uuid[], true),
     '$.revealed[*].id')),
  '["98300000-0000-4000-8000-000000000020"]'::jsonb,
  'a dry run reports an NPC embedded only in the book''s second chapter (fails if the reveal reads one chapter)');

select is(
  (select jsonb_path_query_array(
     public.share_handout('98300000-0000-4000-8000-000000000085', array['98300000-0000-4000-8000-000000000030']::uuid[], true),
     '$.revealed[*].id')),
  '[]'::jsonb,
  'an NPC embedded only in a secret block or a Deep half is revealed to nobody (fails if book_body stops stripping)');

-- ── Reordering is one call, by an editor, naming every chapter ──────────────

select lives_ok(
  $$ select public.reorder_scriptorium_chapters('98300000-0000-4000-8000-000000000084',
       array['98300000-0000-4000-8000-0000000000a7', '98300000-0000-4000-8000-0000000000a6']::uuid[]) $$,
  'the author reorders a book''s chapters in one call');

select is(
  (select array_agg(c.title order by c.position) from public.scriptorium_chapters c
    where c.document_id = '98300000-0000-4000-8000-000000000084'),
  array['Linked', 'Plain'],
  'and the chapters take the order given');

select throws_ok(
  $$ select public.reorder_scriptorium_chapters('98300000-0000-4000-8000-000000000084',
       array['98300000-0000-4000-8000-0000000000a7']::uuid[]) $$,
  '22023', null, 'an order that leaves out a chapter is refused as stale, not applied in part');

select set_config('request.jwt.claim.sub', '98300000-0000-4000-8000-000000000005', true);

select throws_ok(
  $$ select public.reorder_scriptorium_chapters('98300000-0000-4000-8000-000000000084',
       array['98300000-0000-4000-8000-0000000000a6', '98300000-0000-4000-8000-0000000000a7']::uuid[]) $$,
  '42501', null, 'an outsider cannot reorder someone else''s book (fails if the editor check goes)');

-- ── Bookkeeping, as the table owner ─────────────────────────────────────────

reset role;

select is(private.book_body('98300000-0000-4000-8000-000000000080') -> 'content' -> 0 -> 'content' -> 0 ->> 'text', 'one',
  'book_body starts with the chapter at the lower position, though it was inserted second');

select is(
  (select jsonb_path_query_array(private.book_body('98300000-0000-4000-8000-000000000080'), 'strict $.**.text')),
  '["one", "kind", "two"]'::jsonb,
  'and joins both chapters in order, as players read them: no secret block, no Deep half (fails if chapters are joined unsorted)');

select is(
  (select word_count from public.scriptorium_documents where id = '98300000-0000-4000-8000-000000000080'),
  15, 'inserting chapters leaves the book''s word count at their sum');

update public.scriptorium_chapters set word_count = 20 where id = '98300000-0000-4000-8000-0000000000a1';
select is(
  (select word_count from public.scriptorium_documents where id = '98300000-0000-4000-8000-000000000080'),
  25, 'updating a chapter''s count updates the book''s');

delete from public.scriptorium_chapters where id = '98300000-0000-4000-8000-0000000000a2';
select is(
  (select word_count from public.scriptorium_documents where id = '98300000-0000-4000-8000-000000000080'),
  20, 'and deleting one takes its words out');

select throws_ok(
  $$ delete from public.scriptorium_chapters where document_id = '98300000-0000-4000-8000-000000000080' $$,
  '23514', 'A book needs at least one chapter.',
  'a book''s last chapter cannot be deleted (fails if keep_one_chapter goes; the client check alone lets two tabs empty a book)');

-- updated_at is now() and constant in a transaction, so set the book's back before the write.
alter table public.scriptorium_documents disable trigger scriptorium_updated_at;
update public.scriptorium_documents set updated_at = '2000-01-01' where id = '98300000-0000-4000-8000-000000000081';
alter table public.scriptorium_documents enable trigger scriptorium_updated_at;
update public.scriptorium_chapters set title = 'Touched' where id = '98300000-0000-4000-8000-0000000000a3';
select ok(
  (select updated_at > '2000-01-02' from public.scriptorium_documents where id = '98300000-0000-4000-8000-000000000081'),
  'a chapter write bumps its book''s updated_at (fails if the touch trigger stops updating the book)');

insert into public.scriptorium_chapters (document_id, position) values ('98300000-0000-4000-8000-000000000081', 1);
insert into public.scriptorium_notes (user_id, document_id, chapter_id, body)
values ('98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000081',
        '98300000-0000-4000-8000-0000000000a3', 'goes with the chapter');
delete from public.scriptorium_chapters where id = '98300000-0000-4000-8000-0000000000a3';
select is(
  (select count(*)::integer from public.scriptorium_notes where document_id = '98300000-0000-4000-8000-000000000081'),
  0, 'deleting a chapter deletes its notes');

insert into public.scriptorium_chapters (id, document_id, position) values ('98300000-0000-4000-8000-0000000000b3', '98300000-0000-4000-8000-000000000084', 3);
insert into public.scriptorium_notes (user_id, document_id, chapter_id, body)
values ('98300000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000084',
        '98300000-0000-4000-8000-0000000000b3', 'goes with the book');
delete from public.scriptorium_documents where id = '98300000-0000-4000-8000-000000000084';
select is(
  (select (select count(*) from public.scriptorium_chapters where document_id = '98300000-0000-4000-8000-000000000084')
        + (select count(*) from public.scriptorium_notes where document_id = '98300000-0000-4000-8000-000000000084'))::integer,
  0, 'deleting a book deletes its chapters and notes');

select * from finish();
rollback;
