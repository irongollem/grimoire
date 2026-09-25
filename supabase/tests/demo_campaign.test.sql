-- The demo campaign (#912, migration 20260925002215).
--
-- Two halves. The structural half pins the table classification against the
-- live catalogue: a campaign-scoped table the demo list does not mention, or a
-- new foreign-key cycle nobody deferred, fails here rather than in every new
-- user's first minute. The behavioural half publishes a small template with each
-- awkward shape in it -- a room inside a site, the locations <-> npcs and notes
-- <-> calendar_events cycles, a quest whose entry beat points back at it, an
-- attachment whose reference is a text column no foreign key describes -- and
-- checks that a Free user's copy is complete, correctly rewired, quota-free,
-- tamper-proof, resettable and removable without leaving anything behind.

begin;

create extension if not exists pgtap with schema extensions;
select plan(57);

-- ── Structure ───────────────────────────────────────────────────────────────

select is_empty(
  $$
    select c.table_name::text
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'campaign_id'
    except
    select table_name from private.demo_campaign_tables where tier = 1
  $$,
  'every campaign-scoped table is classified for the demo copy -- add a new one to private.demo_campaign_tables'
);

select is_empty(
  $$
    select d.table_name
      from private.demo_campaign_tables d
     where not exists (select 1 from information_schema.tables t
                        where t.table_schema = 'public' and t.table_name = d.table_name and t.table_type = 'BASE TABLE')
        or (d.tier = 1 and not exists (select 1 from information_schema.columns c
                                        where c.table_schema = 'public' and c.table_name = d.table_name
                                          and c.column_name = 'campaign_id'))
  $$,
  'every classified table exists, and every tier-1 table has a campaign_id'
);

-- A table without campaign_id that points at a copied row is part of the
-- campaign too: copy it through its parent, or say why not.
select is_empty(
  $$
    select distinct src.relname::text
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid and src.relnamespace = 'public'::regnamespace and src.relkind = 'r'
      join pg_class dst on dst.oid = con.confrelid
     where con.contype = 'f'
       and dst.relname in (select table_name from private.demo_campaign_tables where copy)
       and dst.relnamespace = 'public'::regnamespace
       and src.relname <> 'campaigns'
       and not exists (select 1 from information_schema.columns c
                        where c.table_schema = 'public' and c.table_name = src.relname and c.column_name = 'campaign_id')
    except
    select table_name from private.demo_campaign_tables where tier = 2
  $$,
  'every table hanging off a copied table is classified as tier 2'
);

select is_empty(
  $$
    select d.table_name
      from private.demo_campaign_tables d
     where d.tier = 2
       and not exists (
         select 1
           from pg_constraint con
           join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
          where con.contype = 'f'
            and con.conrelid = format('public.%I', d.table_name)::regclass
            and con.confrelid = format('public.%I', d.parent_table)::regclass
            and a.attname = d.parent_column
       )
  $$,
  'each tier-2 parent_column is a real foreign key to its parent_table'
);

select is_empty(
  $$
    select d.table_name
      from private.demo_campaign_tables d
     where d.tier = 2 and d.copy
       and d.parent_table not in (select table_name from private.demo_campaign_tables where tier = 1 and copy)
  $$,
  'a copied tier-2 table hangs off a copied tier-1 table'
);

select is_empty(
  $$
    select d.table_name || '.' || col
      from private.demo_campaign_tables d, unnest(d.defer_columns) col
     where not exists (select 1 from information_schema.columns c
                        where c.table_schema = 'public' and c.table_name = d.table_name
                          and c.column_name = col and c.is_nullable = 'YES')
  $$,
  'every deferred column exists and is nullable, since it goes in null'
);

-- The copy inserts in passes, so any foreign-key cycle among copied tables that
-- is not broken by a deferred column would stall it.
select is_empty(
  $$
    with recursive
    copied as (
      select table_name, defer_columns from private.demo_campaign_tables where copy
    ),
    edges as (
      select distinct src.relname::text as src, dst.relname::text as dst
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid and src.relnamespace = 'public'::regnamespace
        join pg_class dst on dst.oid = con.confrelid and dst.relnamespace = 'public'::regnamespace
        join copied cs on cs.table_name = src.relname
        join copied cd on cd.table_name = dst.relname
       where con.contype = 'f'
         and src.oid <> dst.oid
         and not exists (select 1 from pg_attribute a
                          where a.attrelid = src.oid and a.attnum = any (con.conkey)
                            and a.attname = any (cs.defer_columns))
    ),
    reach (src, dst) as (
      select src, dst from edges
      union
      select r.src, e.dst from reach r join edges e on e.src = r.dst
    )
    select src from reach where src = dst
  $$,
  'the foreign keys among copied tables, minus deferred columns, have no cycle'
);

select is_empty(
  $$
    select p.proname::text
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('load_demo_campaign', 'get_demo_status', 'publish_demo_version')
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  'anon cannot reach any demo RPC'
);

select is_empty(
  $$
    select p.proname::text
      from pg_proc p
     where p.pronamespace = 'private'::regnamespace
       and p.proname in ('copy_demo_template', 'purge_demo_campaign')
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  $$,
  'authenticated cannot call the private copy or purge directly'
);

-- ── Fixture: an author (admin), a newcomer on Free, and a would-be player ───

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('91200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo-author@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb),
  ('91200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo-newcomer@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('91200000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'demo-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

-- A developer's stack may hold a published template (the seed is a production
-- dump); this test publishes its own. Unpublished here, restored by rollback.
update public.campaigns set demo_template = false, demo_version = null where demo_template;

insert into public.campaigns (id, user_id, name)
values ('91200000-0000-4000-8000-000000000010', '91200000-0000-4000-8000-000000000001', 'Sugarwell');

insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('91200000-0000-4000-8000-000000000020', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'The Understage', 'dungeon');
insert into public.locations (id, user_id, campaign_id, parent_id, name, location_type) values
  ('91200000-0000-4000-8000-000000000021', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', '91200000-0000-4000-8000-000000000020', 'The Well', 'room');

insert into public.npcs (id, user_id, campaign_id, name, location_id, portrait_url) values
  ('91200000-0000-4000-8000-000000000030', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'Fondant', '91200000-0000-4000-8000-000000000021',
   'https://cdn.example.invalid/npc-portraits/91200000-0000-4000-8000-000000000001/fondant.webp');
update public.locations set npc_owner_id = '91200000-0000-4000-8000-000000000030'
 where id = '91200000-0000-4000-8000-000000000020';
insert into public.npc_embeddings (npc_id, embedding, embedding_model, source_hash)
values ('91200000-0000-4000-8000-000000000030', array_fill(0.01::real, array[1536])::extensions.vector,
        'text-embedding-3-small', 'fondant-hash');

insert into public.quests (id, user_id, campaign_id, title) values
  ('91200000-0000-4000-8000-000000000040', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'The Locked Workshop');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('91200000-0000-4000-8000-000000000041', '91200000-0000-4000-8000-000000000040', '91200000-0000-4000-8000-000000000010', 'A door that hums'),
  ('91200000-0000-4000-8000-000000000042', '91200000-0000-4000-8000-000000000040', '91200000-0000-4000-8000-000000000010', 'Inside');
insert into public.quest_beat_edges (id, quest_id, campaign_id, source_beat_id, target_beat_id) values
  ('91200000-0000-4000-8000-000000000043', '91200000-0000-4000-8000-000000000040', '91200000-0000-4000-8000-000000000010',
   '91200000-0000-4000-8000-000000000041', '91200000-0000-4000-8000-000000000042');
insert into public.quest_objectives (id, quest_id, description, status) values
  ('91200000-0000-4000-8000-000000000044', '91200000-0000-4000-8000-000000000040', 'Open the workshop', 'pending');
insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id) values
  ('91200000-0000-4000-8000-000000000041', '91200000-0000-4000-8000-000000000040', '91200000-0000-4000-8000-000000000010',
   'npc', '91200000-0000-4000-8000-000000000030');
update public.quests set entry_beat_id = '91200000-0000-4000-8000-000000000041'
 where id = '91200000-0000-4000-8000-000000000040';

insert into public.notes (id, user_id, campaign_id, title) values
  ('91200000-0000-4000-8000-000000000050', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'Sugarwell at a glance');
insert into public.calendar_events (id, user_id, campaign_id, title, harptos_year, linked_note_id) values
  ('91200000-0000-4000-8000-000000000051', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'The Gathering', 1495, '91200000-0000-4000-8000-000000000050');
update public.notes set linked_calendar_event_id = '91200000-0000-4000-8000-000000000051'
 where id = '91200000-0000-4000-8000-000000000050';

insert into public.factions (id, user_id, campaign_id, name) values
  ('91200000-0000-4000-8000-000000000060', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'The Crew');
insert into public.faction_npcs (user_id, faction_id, npc_id) values
  ('91200000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000060', '91200000-0000-4000-8000-000000000030');

insert into public.soundboard_pages (id, user_id, campaign_id, name) values
  ('91200000-0000-4000-8000-000000000070', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'Sugarwell');
insert into public.sounds (id, user_id, campaign_id, name, file_url, page_id) values
  ('91200000-0000-4000-8000-000000000071', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'The Crew Round', 'https://cdn.example.invalid/sound-files/demo/crew-round.mp3',
   '91200000-0000-4000-8000-000000000070');
insert into public.soundboard_playlists (id, user_id, campaign_id, name, playlist_type, page_id) values
  ('91200000-0000-4000-8000-000000000072', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'Understage', 'music', '91200000-0000-4000-8000-000000000070');
insert into public.soundboard_playlist_tracks (playlist_id, sound_id) values
  ('91200000-0000-4000-8000-000000000072', '91200000-0000-4000-8000-000000000071');

insert into public.party_members (id, user_id, campaign_id, name) values
  ('91200000-0000-4000-8000-000000000080', '91200000-0000-4000-8000-000000000001',
   '91200000-0000-4000-8000-000000000010', 'Pregen Pip');

update public.campaigns set current_location_id = '91200000-0000-4000-8000-000000000020', ai_enabled = true
 where id = '91200000-0000-4000-8000-000000000010';

-- ── Publishing ──────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"91200000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.publish_demo_version('91200000-0000-4000-8000-000000000010') $$,
  'Not authorized',
  'a non-admin cannot publish the demo'
);

select is(
  (public.get_demo_status() ->> 'published')::boolean, false,
  'before publishing, the app is told there is no demo to offer'
);

set local request.jwt.claims to
  '{"sub":"91200000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';

select lives_ok(
  $$ select public.publish_demo_version('91200000-0000-4000-8000-000000000010') $$,
  'the author publishes their campaign as the demo'
);

reset role;

select is(
  (select count(*)::int from public.campaigns where demo_source is null and name = 'Sugarwell'
     and user_id = '91200000-0000-4000-8000-000000000001'),
  1,
  'the publish dry run left no copy behind'
);

-- A client cannot flip the flag itself, admin or not.
set local role authenticated;
set local request.jwt.claims to '{"sub":"91200000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.campaigns (id, user_id, name, demo_template, demo_version, demo_source)
values ('91200000-0000-4000-8000-0000000000e1', '91200000-0000-4000-8000-000000000002', 'Hijack', true, 'x', 'x');
reset role;

select is(
  (select row(demo_template, demo_version, demo_source)::text from public.campaigns
    where id = '91200000-0000-4000-8000-0000000000e1'),
  row(false, null::text, null::text)::text,
  'a client insert cannot mark a campaign as the template or as a demo copy'
);
delete from public.campaigns where id = '91200000-0000-4000-8000-0000000000e1';

-- ── Loading, as a Free newcomer ─────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"91200000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok($$ select public.load_demo_campaign() $$, 'a Free newcomer loads the demo');

select is(
  (select count(*)::int from public.campaigns where user_id = '91200000-0000-4000-8000-000000000002' and demo_source is not null),
  1,
  'the newcomer owns exactly one demo campaign, visible through their own RLS'
);

select is(
  public.get_demo_status() ->> 'loaded_version',
  public.get_demo_status() ->> 'version',
  'the status reports the copy as current'
);

reset role;

create temp table demo_ids as
select
  (select id from public.campaigns where user_id = '91200000-0000-4000-8000-000000000002' and demo_source is not null) as campaign,
  (select id from public.locations l where l.user_id = '91200000-0000-4000-8000-000000000002' and l.location_type = 'dungeon') as site,
  (select id from public.locations l where l.user_id = '91200000-0000-4000-8000-000000000002' and l.location_type = 'room') as room,
  (select id from public.npcs n where n.user_id = '91200000-0000-4000-8000-000000000002') as npc,
  (select id from public.quests q where q.user_id = '91200000-0000-4000-8000-000000000002') as quest,
  (select id from public.notes n where n.user_id = '91200000-0000-4000-8000-000000000002') as note;
grant select on demo_ids to authenticated;

select isnt((select campaign from demo_ids), '91200000-0000-4000-8000-000000000010'::uuid, 'the copy is a new campaign');

select is(
  (select ical_token from public.campaigns where id = (select campaign from demo_ids))
    = (select ical_token from public.campaigns where id = '91200000-0000-4000-8000-000000000010'),
  false,
  'the copy has its own iCal token, not the author''s feed'
);

select is(
  (select ai_enabled from public.campaigns where id = (select campaign from demo_ids)),
  null,
  'the author turned AI on, but the copy asks its new owner: AI Act consent is not inherited'
);

select is(
  (select current_location_id from public.campaigns where id = (select campaign from demo_ids)),
  (select site from demo_ids),
  'the party position points at the copied site'
);

select is(
  (select count(*)::int from public.campaign_members
    where campaign_id = (select campaign from demo_ids) and user_id = '91200000-0000-4000-8000-000000000002' and role = 'dm'),
  1,
  'the newcomer is the DM of the copy'
);

select is(
  (select count(*)::int from public.campaign_enabled_sources where campaign_id = (select campaign from demo_ids)),
  (select count(*)::int from public.campaign_enabled_sources where campaign_id = '91200000-0000-4000-8000-000000000010'),
  'the content sources match the template''s, without duplicates from the insert trigger'
);

select is(
  (select parent_id from public.locations where id = (select room from demo_ids)),
  (select site from demo_ids),
  'the room sits inside the copied site'
);

select is(
  (select npc_owner_id from public.locations where id = (select site from demo_ids)),
  (select npc from demo_ids),
  'the deferred site owner was restored to the copied NPC'
);

select is(
  (select location_id from public.npcs where id = (select npc from demo_ids)),
  (select room from demo_ids),
  'the NPC stands in the copied room'
);

-- The author's id is rewritten where it is an owner, and left alone where it is
-- the folder a file lives in -- otherwise every copied portrait would 404.
select is(
  (select row(user_id, portrait_url)::text from public.npcs where id = (select npc from demo_ids)),
  row('91200000-0000-4000-8000-000000000002'::uuid,
      'https://cdn.example.invalid/npc-portraits/91200000-0000-4000-8000-000000000001/fondant.webp')::text,
  'the copy belongs to the newcomer but still shows the author''s uploaded portrait'
);

select is(
  (select b.title from public.quests q join public.quest_beats b on b.id = q.entry_beat_id where q.id = (select quest from demo_ids)),
  'A door that hums',
  'the quest''s entry beat is the copied first beat'
);

select is(
  (select count(*)::int from public.quest_beats where quest_id = (select quest from demo_ids)),
  2,
  'both beats were copied'
);

select is(
  (select count(*)::int from public.quest_beat_edges e
     join public.quest_beats s on s.id = e.source_beat_id
     join public.quest_beats t on t.id = e.target_beat_id
    where e.quest_id = (select quest from demo_ids) and s.quest_id = e.quest_id and t.quest_id = e.quest_id),
  1,
  'the route between them joins the copied beats'
);

select is(
  (select count(*)::int from public.quest_threads where quest_id = (select quest from demo_ids)),
  1,
  'the quest has one Main thread -- the template''s, not a second from the insert trigger'
);

select is(
  (select count(*)::int from public.quest_objectives where quest_id = (select quest from demo_ids)),
  1,
  'the objective came along through its quest'
);

select is(
  (select ref_id from public.quest_beat_attachments where quest_id = (select quest from demo_ids)),
  (select npc from demo_ids)::text,
  'an attachment''s text reference, which no foreign key describes, points at the copied NPC'
);

select is(
  (select count(*)::int from public.quest_refs where quest_id = (select quest from demo_ids)),
  (select count(*)::int from public.quest_refs where quest_id = '91200000-0000-4000-8000-000000000040'),
  'quest refs match the template''s, without duplicates from the attachment trigger'
);

select is(
  (select c.linked_note_id from public.notes n join public.calendar_events c on c.id = n.linked_calendar_event_id
    where n.id = (select note from demo_ids)),
  (select note from demo_ids),
  'the note <-> calendar event cycle is rebuilt between the copies'
);

select is(
  (select fn.npc_id from public.faction_npcs fn join public.factions f on f.id = fn.faction_id
    where f.campaign_id = (select campaign from demo_ids)),
  (select npc from demo_ids),
  'the faction membership links the copied faction to the copied NPC'
);

select is(
  (select s.file_url from public.soundboard_playlist_tracks t
     join public.soundboard_playlists p on p.id = t.playlist_id
     join public.sounds s on s.id = t.sound_id
    where p.campaign_id = (select campaign from demo_ids) and s.campaign_id = p.campaign_id),
  'https://cdn.example.invalid/sound-files/demo/crew-round.mp3',
  'the playlist track joins the copied playlist to the copied sound, which still plays the shared file'
);

select is(
  (select source_hash from public.npc_embeddings where npc_id = (select npc from demo_ids)),
  'fondant-hash',
  'the NPC''s embedding came with it, so the demo is searchable by the AI tools from the start'
);

select is(
  (select count(*)::int from public.party_members where campaign_id = (select campaign from demo_ids)),
  1,
  'the pre-made party came along'
);

select is(
  (select count(*)::int from public.npcs where campaign_id = '91200000-0000-4000-8000-000000000010'),
  1,
  'the template itself is untouched'
);

-- ── Quotas ──────────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"91200000-0000-4000-8000-000000000002","role":"authenticated"}';

select is((public.check_quota('campaigns') ->> 'current')::int, 0, 'the demo does not occupy the Free campaign slot');
select is((public.check_quota('npcs') ->> 'current')::int, 0, 'demo NPCs do not count');
select is(((public.check_all_quotas() -> 'locations') ->> 'current')::int, 0, 'check_all_quotas agrees for locations');

select lives_ok(
  $$ insert into public.campaigns (id, user_id, name)
     values ('91200000-0000-4000-8000-0000000000c2', '91200000-0000-4000-8000-000000000002', 'My own table') $$,
  'with the demo loaded, a Free user can still create their own first campaign'
);

insert into public.npcs (id, user_id, campaign_id, name, demo_source) values
  ('91200000-0000-4000-8000-0000000000a1', '91200000-0000-4000-8000-000000000002',
   (select campaign from demo_ids), 'My own addition', 'forged');
select is((public.check_quota('npcs') ->> 'current')::int, 1, 'an NPC the user adds inside the demo counts, forged marker or not');

update public.npcs set demo_source = null where id = (select npc from demo_ids);
select isnt(
  (select demo_source from public.npcs where id = (select npc from demo_ids)), null,
  'a client cannot clear the marker to launder a row'
);

update public.campaigns set demo_template = true where id = (select campaign from demo_ids);
select is(
  (select demo_template from public.campaigns where id = (select campaign from demo_ids)), false,
  'a client cannot promote its copy to the template'
);

select throws_ok(
  $$ select public.load_demo_campaign() $$,
  '23505', null,
  'a second load without reset is refused'
);

-- ── Reset and removal ───────────────────────────────────────────────────────

select lives_ok($$ select public.load_demo_campaign(true) $$, 'reset replaces the demo');

reset role;

select isnt(
  (select id from public.campaigns where user_id = '91200000-0000-4000-8000-000000000002' and demo_source is not null),
  (select campaign from demo_ids),
  'the reset demo is a fresh campaign'
);

select is(
  (select count(*)::int from public.npcs where user_id = '91200000-0000-4000-8000-000000000002'),
  1,
  'reset left no orphans: only the fresh copy''s NPC remains, and the user''s addition went with the old demo'
);

select is(
  (select count(*)::int from public.notes where user_id = '91200000-0000-4000-8000-000000000002' and campaign_id is null),
  0,
  'no demo note fell back into general scope'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"91200000-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok(
  $$ select public.delete_campaign_with_homebrew(
       (select id from public.campaigns where user_id = '91200000-0000-4000-8000-000000000002' and demo_source is not null),
       'promote') $$,
  'Danger Zone deletes the demo'
);

reset role;

select is(
  (select count(*)::int from public.npcs where user_id = '91200000-0000-4000-8000-000000000002')
  + (select count(*)::int from public.locations where user_id = '91200000-0000-4000-8000-000000000002')
  + (select count(*)::int from public.notes where user_id = '91200000-0000-4000-8000-000000000002')
  + (select count(*)::int from public.sounds where user_id = '91200000-0000-4000-8000-000000000002'),
  0,
  'deleting the demo removes its content instead of promoting it into the account'
);

select is(
  (select count(*)::int from public.campaigns where user_id = '91200000-0000-4000-8000-000000000002'),
  1,
  'the user''s own campaign survives'
);

-- ── A template that would leak is refused ───────────────────────────────────

update public.party_members set owner_user_id = '91200000-0000-4000-8000-000000000003'
 where id = '91200000-0000-4000-8000-000000000080';

set local role authenticated;
set local request.jwt.claims to '{"sub":"91200000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.load_demo_campaign() $$,
  'The demo template references another account; remove its players and invites first',
  'a template carrying a player''s account is never copied'
);

set local request.jwt.claims to
  '{"sub":"91200000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"admin"}}';

select throws_ok(
  $$ select public.publish_demo_version('91200000-0000-4000-8000-000000000010') $$,
  'The demo template references another account; remove its players and invites first',
  'and publishing it is refused, with the reason'
);

reset role;

select * from finish();
rollback;
