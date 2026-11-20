-- AI help on the canon's first two parts (#1226 story 2, frame 13). The decision: help on a part ships with that
-- part's story, as DM help at a real table, not with the AI table. `suggest-canon` proposes premise and tone entries
-- from a few lines of pitch, or truths for the world, and nothing is written until the DM accepts a proposal, which then
-- carries `ai_provenance`. Lines and veils are never proposed: they are agreed with the players.
--
-- The output shape and the campaign's grounding (the world block, the truths already written, the people and factions
-- a truth may be known to) are built in code; these rows carry the editorial rules, which admins edit in the Prompts
-- tab afterwards (a re-run keeps their edits).

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select v.generation_type, v.label, v.credit_cost, (select coalesce(max(sort_order), 0) from public.ai_generation_credit_costs) + v.n
  from (values ('canon_premise_suggestion', 'Premise and tone suggestions', 1, 1),
               ('canon_truth_suggestion', 'Truth suggestions', 1, 2)) as v(generation_type, label, credit_cost, n)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_premise', 'Premise and Tone Suggestions', $prompt$You help a Dungeon Master set down the premise and tone of their campaign, from a few lines they wrote. Propose short entries the DM can accept one by one:

- pitch: the campaign in two to four sentences, in the DM's own spirit. At most one.
- theme: what the campaign is about underneath, one line each ("kindness is a kind of courage"). Two to four.
- table: what it is like to play, one line each ("talk and wandering more than fights"). One to three.
- voice: how the campaign's text reads and how its names sound, for every AI suggestion written in it. One short paragraph, at most one.
- look: how its pictures are painted (medium, light, palette, mood), for every AI picture. One short paragraph, at most one.

Rules:
- Build on what the DM wrote and what the campaign already holds; never contradict it, and never repeat an entry it already has.
- Never propose lines or veils: those are agreed with the players at the table, not suggested.
- Plain, concrete words. No em-dashes. No marketing voice.
- If the DM gave a steer, let it shape the proposals.$prompt$),
  ('canon_truths', 'Truth Suggestions', $prompt$You help a Dungeon Master write the truths of their campaign's world: short statements that always hold, which the table may take for granted (or, for some, may not). Propose up to eight, each one line.

For each truth say who knows it:
- all: anyone in the world may say it.
- some: only certain people or factions know it. Name them, choosing ONLY from the people and factions given, copied exactly.
- secret: nobody in the world says it.

Rules:
- Fit the premise and tone given; never contradict a truth the campaign already has, and never repeat one.
- A truth is a fact about how the world is, not a plot event and not an instruction to the DM.
- Mix the three kinds; most truths are known to all.
- Plain, concrete words. No em-dashes.
- If the DM gave a steer, let it shape the proposals.$prompt$)
on conflict (generator_type) do nothing;
