begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

select col_not_null('public', 'quest_beats', 'title', 'beat titles remain required');

select throws_ok(
  $$ insert into public.quest_beats (quest_id, campaign_id, title)
     values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '   ') $$,
  '23514',
  null,
  'whitespace-only beat titles are rejected before foreign-key evaluation'
);

select throws_ok(
  $$ insert into public.quest_beats (quest_id, campaign_id)
     values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001') $$,
  '23514',
  null,
  'the former empty default can no longer create an unnamed beat'
);

select * from finish();
rollback;
