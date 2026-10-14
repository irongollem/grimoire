begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- The news opt-in (20261014210515). Consent is the legal basis for every news
-- email, so the tests pin the three things that make it worth anything: it is
-- only ever given by the ticked box, its timestamp is the server's, and
-- withdrawing it takes effect at once.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at)
values
  ('10140000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'news-yes@example.invalid', '', '{"provider":"email"}'::jsonb, '{"product_news":"true"}'::jsonb, now()),
  ('10140000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'news-no@example.invalid',  '', '{"provider":"email"}'::jsonb, '{}'::jsonb, now()),
  ('10140000-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'news-admin@example.invalid', '', '{"provider":"email","role":"admin"}'::jsonb, '{}'::jsonb, now());

select is(
  (select email_product_news and product_news_consented_at is not null
     from public.notification_preferences where user_id = '10140000-0000-4000-8000-000000000101'),
  true,
  'a ticked box at signup records the opt-in, with a consent time');

select is(
  (select coalesce(bool_or(email_product_news), false)
     from public.notification_preferences where user_id = '10140000-0000-4000-8000-000000000102'),
  false,
  'an unticked box at signup records nothing: no consent');

-- ── The owner's own row ──────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10140000-0000-4000-8000-000000000102","role":"authenticated"}', true);

insert into public.notification_preferences (user_id, email_product_news, product_news_consented_at)
values ('10140000-0000-4000-8000-000000000102', true, '2001-01-01');
select is(
  (select product_news_consented_at > now() - interval '1 minute'
     from public.notification_preferences where user_id = '10140000-0000-4000-8000-000000000102'),
  true,
  'opting in from settings stamps the server''s time, not a backdated one the client sent');

update public.notification_preferences set product_news_consented_at = '2001-01-01'
 where user_id = '10140000-0000-4000-8000-000000000102';
select is(
  (select product_news_consented_at > now() - interval '1 minute'
     from public.notification_preferences where user_id = '10140000-0000-4000-8000-000000000102'),
  true,
  'the consent time cannot be rewritten while the consent stands');

update public.notification_preferences set email_product_news = false
 where user_id = '10140000-0000-4000-8000-000000000102';
select is(
  (select product_news_consented_at
     from public.notification_preferences where user_id = '10140000-0000-4000-8000-000000000102'),
  null,
  'withdrawing clears the consent time');

update public.notification_preferences set email_product_news = false
 where user_id = '10140000-0000-4000-8000-000000000101';
reset role;
select is(
  (select email_product_news from public.notification_preferences where user_id = '10140000-0000-4000-8000-000000000101'),
  true,
  'another user''s write cannot reach this row (RLS), so their consent stands');

-- ── The admin list ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"10140000-0000-4000-8000-000000000103","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', true);
select is(
  (select product_news from public.get_admin_users() where user_id = '10140000-0000-4000-8000-000000000101'),
  true,
  'the admin list shows an opted-in account as getting news');
select is(
  (select product_news from public.get_admin_users() where user_id = '10140000-0000-4000-8000-000000000102'),
  false,
  'and a withdrawn one as not');
reset role;

select * from finish();
rollback;
