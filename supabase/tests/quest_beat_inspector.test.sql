begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select has_column('public', 'quest_beats', 'read_aloud', 'beats store read-aloud content once for inspector and page');
select has_column('public', 'quest_beats', 'how_it_plays', 'beats store play guidance independent of combat encounters');
-- `outcomes` and `consequences` are gone (20260908210320): the system had no
-- verb for the thing they held prose for, and now it does — a route IS its
-- outcome (#795) and quest_consequences IS the delayed-consequence engine
-- (#794). Their text was folded into how_it_plays under a bold label first.
select hasnt_column('public', 'quest_beats', 'outcomes', 'authored outcomes are the route itself, not a prose column');
select hasnt_column('public', 'quest_beats', 'consequences', 'delayed consequences live in quest_consequences, not a prose column');

select * from finish();
rollback;
