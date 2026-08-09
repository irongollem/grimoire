begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select has_column('public', 'quest_beats', 'read_aloud', 'beats store read-aloud content once for inspector and page');
select has_column('public', 'quest_beats', 'how_it_plays', 'beats store play guidance independent of combat encounters');
select has_column('public', 'quest_beats', 'outcomes', 'beats store authored outcomes');
select has_column('public', 'quest_beats', 'consequences', 'beats store delayed consequences');

select * from finish();
rollback;
