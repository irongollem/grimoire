-- Canvases are a Pro limit (#1181, migration 20261112184945): a free account keeps one picture with paint
-- layers. There is no canvas table; the count reads the paint steps inside the caller's own books, both as
-- JSON in a chapter's image node and as escaped JSON text in a page's art props. Each assertion names the bug
-- it fails on.

begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('11810000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'paint-free@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11810000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'paint-pro@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

update public.user_subscriptions set plan_id = 'pro', status = 'active'
 where user_id = '11810000-0000-4000-8000-000000000002';

-- The free user's book: one canvas in a chapter (a node attr), one on the page (art props as JSON text),
-- one picture with a recipe but no paint step, and a demo copy holding a canvas.
insert into public.scriptorium_documents (id, user_id, page_furniture)
values
  ('11810000-0000-4000-8000-0000000000d1', '11810000-0000-4000-8000-000000000001',
   jsonb_build_array(jsonb_build_object('kind', 'art', 'props', jsonb_build_object(
     'illuminate', '{"v":1,"seed":1,"steps":[{"type":"paint","width":100,"height":100,"paper":null,"layers":[]}]}')))),
  ('11810000-0000-4000-8000-0000000000d2', '11810000-0000-4000-8000-000000000002',
   '[]'::jsonb);
insert into public.scriptorium_documents (id, user_id, page_furniture, demo_source)
values ('11810000-0000-4000-8000-0000000000d3', '11810000-0000-4000-8000-000000000001',
        jsonb_build_array(jsonb_build_object('props', jsonb_build_object(
          'illuminate', '{"steps":[{"type":"paint","width":10,"height":10,"paper":null,"layers":[]}]}'))),
        'demo-template');

insert into public.scriptorium_chapters (document_id, position, content)
values ('11810000-0000-4000-8000-0000000000d1', 0, jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
  jsonb_build_object('type', 'scriptoriumImage', 'attrs', jsonb_build_object('illuminate', jsonb_build_object(
    'v', 1, 'seed', 1, 'steps', jsonb_build_array(jsonb_build_object('type', 'paint', 'width', 50, 'height', 50, 'paper', 'rough', 'layers', '[]'::jsonb))))),
  jsonb_build_object('type', 'scriptoriumImage', 'attrs', jsonb_build_object('illuminate', jsonb_build_object(
    'v', 1, 'seed', 1, 'steps', jsonb_build_array(jsonb_build_object('type', 'grade', 'options', '{}'::jsonb))))),
  -- A DM who types the marker into their text is writing prose, not painting.
  jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
    jsonb_build_object('type', 'text', 'text', 'the recipe said "type": "paint" and nothing else'))))));

select is(
  (select quotas ->> 'paint_canvases' from public.plans where id = 'free'), '1',
  'free accounts keep one canvas (fails if the plan key is missing: free would be unlimited)'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (public.check_quota('paint_canvases') ->> 'current')::int, 2,
  'a canvas counts in a chapter node and in page art, a plain recipe and a demo copy do not'
);
select is(
  (public.check_quota('paint_canvases') ->> 'allowed')::boolean, false,
  'a free user with two canvases may not start a third (fails if the limit is not applied)'
);
select is(
  (select count(*)::int from public.scriptorium_chapters
    where document_id = '11810000-0000-4000-8000-0000000000d1' and content::text like '%\"paint\"%'), 1,
  'the typed marker is in the chapter, escaped, and still did not count above (fails if the chapter pattern accepts escaped quotes)'
);
select is(
  (public.check_all_quotas() -> 'paint_canvases' ->> 'current')::int, 2,
  'check_all_quotas counts canvases the same way (fails if the two quota functions drift)'
);
select throws_ok(
  $$ select private.count_paint_canvases('11810000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'a signed-in user cannot call the count for another account directly'
);

-- The user flattens the page canvas: the art keeps a picture but loses its paint step.
reset role;
update public.scriptorium_documents
   set page_furniture = jsonb_build_array(jsonb_build_object('kind', 'art', 'props', jsonb_build_object('src', 'x')))
 where id = '11810000-0000-4000-8000-0000000000d1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (public.check_quota('paint_canvases') ->> 'current')::int, 1,
  'flattening a canvas frees its slot (fails if counts are cached or read from elsewhere)'
);
select is(
  (public.check_quota('paint_canvases') ->> 'allowed')::boolean, false,
  'one canvas is still the free limit, so a second is refused'
);

set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (public.check_quota('paint_canvases') ->> 'unlimited')::boolean, true,
  'Pro is unlimited (fails if the key is added to the Pro plan)'
);
select is(
  (public.check_all_quotas() -> 'paint_canvases' ->> 'allowed')::boolean, true,
  'Pro may always start a canvas'
);

select * from finish();
rollback;
