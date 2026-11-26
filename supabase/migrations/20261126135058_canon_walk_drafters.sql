-- "Design it with me" (#1282): the drafters the walk's Enhance runs that `suggest-canon` did not have. Arcs, peoples and
-- a character's DM passages are new modes, each priced on its own row (1 credit) with its own prompt row; the premise
-- helper learns to write only the sections it is asked for (`kinds`, narrowed in code; the line below tells the model
-- why). Habitats wait for the ecology model of #1283.

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_arc_suggestion', 'Arc drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_people_suggestion', 'People drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_backstory_suggestion', 'Backstory passage drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_arcs', 'Arc Drafts', $prompt$You help a Dungeon Master plan the arcs of their campaign: the acts of its story, each asking one dramatic question. Write up to six arcs. Each has a short name, one line of what it is about, the question it asks and what is at stake, both in one line. If a premise theme fits an arc, name it by its id, copied exactly from the lines given; otherwise leave it out.

Rules:
- Fit the premise, tone and truths given. Never repeat an arc the campaign already has.
- Each arc should be able to run on its own for several sessions and end in a way the players can change.
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a steer, follow it.$prompt$),
  ('canon_peoples', 'People Drafts', $prompt$You help a Dungeon Master decide who lives in their world. You are given species the campaign may use, each with an id, and the peoples it already lists with their shares. Propose up to eight peoples, each a species chosen ONLY from those given, by its id copied exactly, with the share of the population it makes up as a whole number from 1 to 100. A people may carry a culture's own name of one or two words, when the DM's steer or the setting suggests one.

Rules:
- Fit the premise, setting and tone given. Never list a species twice under the same name, and never repeat a people already listed.
- Shares are the people's weight in the world, not a ranking. The shares you propose and the ones already listed must not add up to more than 100; leave room for anyone else.
- Plain, concrete choices. No em-dashes.
- If the DM gave a steer, follow it.$prompt$),
  ('canon_backstory', 'Backstory Passage Drafts', $prompt$You help a Dungeon Master write their side of a player character's past. You are given the character's name, what their sheet says, the opening the player wrote (Before play), and the titles of the passages already written. Write up to five passages for the DM: what the character does not know about their own past, people and places from it who could return, and threads the DM can pull in play. Each has a short title and a body of one or two short paragraphs, in plain text.

Rules:
- Build on what the player wrote; never contradict it and never repeat a passage already written. Add, do not replace.
- Each passage must give the DM something to do at the table, not only something to know.
- Leave the player's choices to the player: say what is true, not what the character feels or does about it.
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a steer, follow it.$prompt$)
on conflict (generator_type) do nothing;

update public.ai_system_prompts
   set content = content || E'\n\nWhen the DM names sections, write only those. The DM''s words are rough notes, not the finished text: develop them into full, specific entries that build on the pitch and everything the canon already holds, with concrete names, places and details, and never hand the notes back reworded.'
 where generator_type = 'canon_premise' and content not like '%When the DM names sections%';
