-- A people has words of its own (#1267, the author's review of the rebuilt Canon, 24 Nov 2026).
--
-- The Peoples chapter promised "the world's peoples and cultures: where they live and how", and held only a share of the
-- population for the NPC generator. Nothing let a DM write what a people is like: its customs, what it believes, how it
-- gets on with its neighbours. `body` is that text, rich text as a canon entry's body is (a tiptap document as text),
-- written by the campaign's DMs under the table's existing policies. Null is "nothing written yet".
--
-- The view the client reads gains the column at its end. It is replaced with `security_invoker` said again in the same
-- statement: a `create or replace view` without it silently runs the view as its owner (view_security_invoker.test.sql).

alter table public.campaign_peoples add column body text;

create or replace view public.campaign_peoples_named
with (security_invoker = true) as
select p.id, p.campaign_id, p.percent, p.sort_order,
       case when p.species_id is not null or p.library_species_id is not null then 'species' else 'creature' end as kind,
       coalesce(p.species_id::text, p.library_species_id, p.monster_id::text, p.library_monster_id) as record_id,
       p.species_id is null and p.monster_id is null as from_library,
       coalesce(s.name, ls.name, m.name, lm.name) as name,
       p.body
  from public.campaign_peoples p
  left join public.species s on s.id = p.species_id
  left join public.library_species ls on ls.id = p.library_species_id
  left join public.monsters m on m.id = p.monster_id
  left join public.library_monsters lm on lm.id = p.library_monster_id;
