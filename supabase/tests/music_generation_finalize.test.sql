begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

-- finalize_music_generation_job lands a generated song in the library
-- (#1136). A job queued before the `misc` category and sounds.page_id went
-- may still carry them; the song must still land, as effects, rather than
-- failing the sounds CHECK on a song the DM already paid for.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('a1c70000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'music-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('a1c70000-0000-4000-8000-000000000010', 'a1c70000-0000-4000-8000-000000000001', 'Songs');

insert into public.ai_generation_jobs (id, user_id, campaign_id, generator_type, status, artifact_url, artifact_storage_path, request_json, billing_context) values
  ('a1c70000-0000-4000-8000-000000000020', 'a1c70000-0000-4000-8000-000000000001', 'a1c70000-0000-4000-8000-000000000010',
   'music', 'settling', 'https://cdn.example.invalid/old.mp3', 'a1c70000-0000-4000-8000-000000000001/ai/old.mp3',
   '{"name": "Old request", "category": "misc", "page_id": "a1c70000-0000-4000-8000-000000000099"}'::jsonb,
   '{"is_byok": true}'::jsonb),
  ('a1c70000-0000-4000-8000-000000000021', 'a1c70000-0000-4000-8000-000000000001', 'a1c70000-0000-4000-8000-000000000010',
   'music', 'settling', 'https://cdn.example.invalid/new.mp3', 'a1c70000-0000-4000-8000-000000000001/ai/new.mp3',
   '{"name": "New request", "category": "music"}'::jsonb,
   '{"is_byok": true}'::jsonb);

select public.finalize_music_generation_job('a1c70000-0000-4000-8000-000000000020');
select public.finalize_music_generation_job('a1c70000-0000-4000-8000-000000000021');

select is(
  (select category from public.sounds where id = 'a1c70000-0000-4000-8000-000000000020'),
  'effects',
  'a job queued with the retired misc category still lands, as effects');
select is(
  (select category from public.sounds where id = 'a1c70000-0000-4000-8000-000000000021'),
  'music',
  'a job with a real category keeps it');

select * from finish();
rollback;
