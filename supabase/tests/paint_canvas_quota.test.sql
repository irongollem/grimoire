-- Canvases are a Pro limit (#1181, migrations 20261112184945 and 20261112232850): a free account keeps one picture
-- with paint layers. There is no canvas table; the count reads the paint steps of every recipe in the caller's own
-- books, in a chapter's image nodes and in a page's art, whether the recipe is held as an object or as JSON text.
-- Each assertion names the bug it fails on.

begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

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
   jsonb_build_array(
     jsonb_build_object('kind', 'art', 'props', jsonb_build_object(
       'illuminate', '{"v":1,"seed":1,"steps":[{"type":"paint","width":100,"height":100,"paper":null,"layers":[]}]}')),
     -- Page art as the Illuminator writes it: the recipe as an object.
     jsonb_build_object('kind', 'art', 'props', jsonb_build_object(
       'illuminate', jsonb_build_object('v', 1, 'seed', 2, 'steps', jsonb_build_array(
         jsonb_build_object('type', 'paint', 'width', 80, 'height', 80, 'paper', null, 'layers', '[]'::jsonb))))),
     -- A text box whose prose reads like the marker is writing, not painting.
     jsonb_build_object('kind', 'text', 'props', jsonb_build_object('text', 'the recipe said "type": "paint" here')))),
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
  -- A picture moved from the page into the text keeps its recipe as JSON text.
  jsonb_build_object('type', 'scriptoriumImage', 'attrs', jsonb_build_object('illuminate',
    '{"v":1,"seed":3,"steps":[{"type":"paint","width":40,"height":40,"paper":null,"layers":[]}]}')),
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
  (public.check_quota('paint_canvases') ->> 'current')::int, 4,
  'a canvas counts in a chapter node and in page art, as an object or as JSON text; a plain recipe, typed text and a demo copy do not'
);
select is(
  (public.check_quota('paint_canvases') ->> 'allowed')::boolean, false,
  'a free user with several canvases may not start another (fails if the limit is not applied)'
);
select is(
  (select count(*)::int from public.scriptorium_chapters
    where document_id = '11810000-0000-4000-8000-0000000000d1' and content::text like '%\"paint\"%'), 1,
  'the typed marker is in the chapter, escaped, and still did not count above (fails if the chapter pattern accepts escaped quotes)'
);
select is(
  (public.check_all_quotas() -> 'paint_canvases' ->> 'current')::int, 4,
  'check_all_quotas counts canvases the same way (fails if the two quota functions drift)'
);
select throws_ok(
  $$ select private.count_paint_canvases('11810000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'a signed-in user cannot call the count for another account directly'
);

-- The user flattens the page canvas: the art keeps a picture but loses its paint step.
reset role;
select is(
  private.recipe_paint_count('{"v":1,"steps":[{"type":"paint"}]}'::jsonb), 1,
  'a recipe held as an object counts (fails if only JSON text is read: page art as the Illuminator writes it escapes the limit)'
);
select is(
  private.recipe_paint_count(to_jsonb('{"v":1,"steps":[{"type":"paint"}]}'::text)), 1,
  'a recipe held as JSON text counts (fails if only objects are read: a picture moved between text and page escapes the limit)'
);

update public.scriptorium_documents
   set page_furniture = jsonb_build_array(jsonb_build_object('kind', 'art', 'props', jsonb_build_object('src', 'x')))
 where id = '11810000-0000-4000-8000-0000000000d1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11810000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (public.check_quota('paint_canvases') ->> 'current')::int, 2,
  'flattening the page canvases frees their slots (fails if counts are cached or read from elsewhere)'
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
