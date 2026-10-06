-- Migration: text_enhancement_on_credits
-- #992: Enhance (rewrite a selection as D&D prose, in every rich-text editor
-- that opts in and in the Scriptorium) was the one AI text feature with no
-- server path. It ran only on a key stored in the browser vault, so its menu
-- never appeared for a DM generating with credits, which is nearly every DM.
-- It now runs through generate-entity-text as the `text_enhancement`
-- generator, and needs what every generator there reads: a price and a
-- system prompt keyed by its own name.

-- ── Credit cost ─────────────────────────────────────────────────────────────
-- The ledger reason has always been `text_enhancement` (the local-key path
-- logged it), but it was never priced. One text call, priced like the others.
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('text_enhancement', 'Text Enhancement', 1, 46)
on conflict (generation_type) do nothing;

-- ── System prompt ───────────────────────────────────────────────────────────
-- Moved out of src/ai/useTextEnhancement.ts, where it was a constant, so the
-- server and the client's local-key path read the same row. What used to be
-- spliced into the system prompt (the kind of text, the writing style, the
-- text either side of the selection) now arrives as constraint lines after
-- the selection, which is how generate-entity-text carries per-call context.
-- The campaign setting is appended by both paths. Admins edit this in the
-- Prompts tab afterwards; a re-run keeps their edits.
insert into ai_system_prompts (generator_type, label, content) values
('text_enhancement', 'Text Enhancement', $prompt$You are a writing assistant for a tabletop RPG campaign. Rewrite the text you are given as vivid, immersive D&D prose. Preserve all facts: do not add or remove story information.

The text to rewrite is the content of the <user_input> tags. It may be followed by constraint lines:
- "Context:" says what kind of text this is (an NPC backstory, a location description, a session note and so on). Match its tone and register.
- "Writing style:" is the house style to write in. Follow it.
- "Text before the selection:" and "Text after the selection:" are the words around the passage in the same document. Use them only to infer the section type and register, and so the rewrite joins up with them. Never reproduce them.

Return only the rewritten text in Markdown. No preamble, no explanation, no surrounding quotes.$prompt$)
on conflict (generator_type) do nothing;
