begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

-- Secret blocks carry ids, and an NPC memory names the one it discloses
-- (20261012233859, #1053).

-- ── Stamping ─────────────────────────────────────────────────────────────────

select ok(
  (private.stamp_secret_ids('{"type":"doc","content":[{"type":"secretBlock","content":[{"type":"paragraph"}]}]}')::jsonb
     #>> '{content,0,attrs,secretId}') ~* '^[0-9a-f-]{36}$',
  'a block without an id gets one'
);

select is(
  private.stamp_secret_ids('{"type":"doc","content":[{"type":"secretBlock","attrs":{"secretId":"11111111-1111-4111-8111-111111111111"},"content":[{"type":"paragraph"}]}]}'),
  '{"type":"doc","content":[{"type":"secretBlock","attrs":{"secretId":"11111111-1111-4111-8111-111111111111"},"content":[{"type":"paragraph"}]}]}',
  'a document whose blocks already have their own ids comes back byte for byte'
);

select results_eq(
  $$ select (b #>> '{attrs,secretId}') = '11111111-1111-4111-8111-111111111111'
       from jsonb_path_query(private.stamp_secret_ids(
         '{"type":"doc","content":[
            {"type":"secretBlock","attrs":{"secretId":"11111111-1111-4111-8111-111111111111"},"content":[{"type":"paragraph"}]},
            {"type":"blockquote","content":[{"type":"secretBlock","attrs":{"secretId":"11111111-1111-4111-8111-111111111111"},"content":[{"type":"paragraph"}]}]}]}')::jsonb,
         'strict $.** ? (@.type == "secretBlock")') b $$,
  $$ values (true), (false) $$,
  'a copied block, nested or not, gets a fresh id and the first keeps its own'
);

select is(private.stamp_secret_ids('<p>secretBlock in old HTML</p>'), '<p>secretBlock in old HTML</p>', 'legacy HTML passes through');
select is(private.stamp_secret_ids('{"type":"doc", secretBlock'), '{"type":"doc", secretBlock', 'an unparseable value passes through');

-- ── Fixture ──────────────────────────────────────────────────────────────────

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10530000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'secret-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10530000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'secret-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10530000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'secret-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10530000-0000-4000-8000-000000000010', '10530000-0000-4000-8000-000000000001', 'Kept'),
  ('10530000-0000-4000-8000-000000000011', '10530000-0000-4000-8000-000000000003', 'Elsewhere');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10530000-0000-4000-8000-000000000010', '10530000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('10530000-0000-4000-8000-000000000010', '10530000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('10530000-0000-4000-8000-000000000011', '10530000-0000-4000-8000-000000000003', 'dm', 'Other DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Written without an id, as an importer would.
insert into public.locations (id, user_id, campaign_id, name, description) values
  ('10530000-0000-4000-8000-000000000020', '10530000-0000-4000-8000-000000000001', '10530000-0000-4000-8000-000000000010', 'The Chapel',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"A quiet chapel."}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"The vault is under the altar."}]}]}]}'),
  ('10530000-0000-4000-8000-000000000021', '10530000-0000-4000-8000-000000000003', '10530000-0000-4000-8000-000000000011', 'Their Tower',
   '{"type":"doc","content":[{"type":"secretBlock","attrs":{"secretId":"22222222-2222-4222-8222-222222222222"},"content":[{"type":"paragraph","content":[{"type":"text","text":"Theirs."}]}]}]}');

insert into public.npcs (id, user_id, campaign_id, name) values
  ('10530000-0000-4000-8000-000000000030', '10530000-0000-4000-8000-000000000001', '10530000-0000-4000-8000-000000000010', 'Bram');

select ok(
  (select (description::jsonb #>> '{content,1,attrs,secretId}') ~* '^[0-9a-f-]{36}$'
     from public.locations where id = '10530000-0000-4000-8000-000000000020'),
  'a write without an id is stamped by the trigger'
);

-- Updating some other column leaves the id alone.
update public.locations set name = 'The Old Chapel' where id = '10530000-0000-4000-8000-000000000020';
create temporary table chapel_secret on commit drop as
  select (description::jsonb #>> '{content,1,attrs,secretId}')::uuid as id
    from public.locations where id = '10530000-0000-4000-8000-000000000020';
update public.locations set description = description where id = '10530000-0000-4000-8000-000000000020';
select is(
  (select (description::jsonb #>> '{content,1,attrs,secretId}')::uuid from public.locations where id = '10530000-0000-4000-8000-000000000020'),
  (select id from chapel_secret),
  'saving the same text again keeps the id'
);

select is_empty(
  $$ select 1 from public.locations
      where id = '10530000-0000-4000-8000-000000000020'
        and private.withhold_secret_blocks(description) like '%secretBlock%' $$,
  'the stripper still removes a block that carries an id'
);

grant select on chapel_secret to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM's list ────────────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10530000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select entity_type, entity_name, field, secret_id, excerpt
       from public.list_campaign_secrets('10530000-0000-4000-8000-000000000010') $$,
  $$ select 'location'::text, 'The Old Chapel'::text, 'description'::text, id, 'The vault is under the altar.'::text from chapel_secret $$,
  'the DM lists the campaign''s secrets with an excerpt, and no other campaign''s'
);

select set_config('request.jwt.claim.sub', '10530000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.list_campaign_secrets('10530000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'a player cannot list the secrets'
);

select set_config('request.jwt.claim.sub', '10530000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$ select * from public.list_campaign_secrets('10530000-0000-4000-8000-000000000010') $$,
  'Not authorized', 'nor can another campaign''s DM'
);

-- ── A memory names the secret it discloses ──────────────────────────────────

select set_config('request.jwt.claim.sub', '10530000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$ insert into public.npc_memories (id, npc_id, kind, body, secret_entity_type, secret_entity_id, secret_id)
     select '10530000-0000-4000-8000-000000000040', '10530000-0000-4000-8000-000000000030', 'revealed',
            'Bram told them the vault is under the altar.', 'location', '10530000-0000-4000-8000-000000000020', id
       from chapel_secret $$,
  'a memory names the chapel''s secret'
);

select is(
  (select secret_id from public.npc_memories where id = '10530000-0000-4000-8000-000000000040'),
  (select id from chapel_secret),
  'and keeps it'
);

select throws_ok(
  $$ insert into public.npc_memories (npc_id, kind, body, secret_entity_type, secret_entity_id)
     values ('10530000-0000-4000-8000-000000000030', 'revealed', 'Half a reference', 'location', '10530000-0000-4000-8000-000000000020') $$,
  '23514', null, 'a reference is all three columns or none'
);

select throws_ok(
  $$ insert into public.npc_memories (npc_id, kind, body, secret_entity_type, secret_entity_id, secret_id)
     values ('10530000-0000-4000-8000-000000000030', 'revealed', 'Their secret', 'location',
             '10530000-0000-4000-8000-000000000021', '22222222-2222-4222-8222-222222222222') $$,
  'P0001', 'A memory can only disclose a secret from its own campaign', 'a secret from another campaign is refused'
);

select throws_ok(
  $$ insert into public.npc_memories (npc_id, kind, body, secret_entity_type, secret_entity_id, secret_id)
     values ('10530000-0000-4000-8000-000000000030', 'revealed', 'Wrong kind', 'faction',
             '10530000-0000-4000-8000-000000000020', '22222222-2222-4222-8222-222222222222') $$,
  'P0001', 'A memory can only disclose a secret from its own campaign', 'the entity must be of the type it is said to be'
);

select lives_ok(
  $$ update public.npc_memories set secret_entity_type = null, secret_entity_id = null, secret_id = null
      where id = '10530000-0000-4000-8000-000000000040' $$,
  'the DM can take the reference off again'
);

select * from finish();
rollback;
