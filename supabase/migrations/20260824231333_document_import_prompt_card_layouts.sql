-- Migration: document_import_prompt_card_layouts
--
-- Teaches the extraction prompt (#353) about multi-page-per-entity layouts.
-- Calibrated against a real document rather than imagined: a four-page
-- "printable cards" PDF holding two creatures, each as a card front (art, name,
-- type line, AC/HP/speed, ability scores) and a card back (saves, resistances,
-- senses, challenge, traits, actions).
--
-- ── What the original prompt got wrong ───────────────────────────────────────
--
-- It assumed one entity sits in one place, and the only multi-page case it
-- named was a stat block "cut off by a page break" — which it told the model to
-- mark `partial`. A card deck is not that. Nothing is cut off; the layout is
-- deliberately split, and the correct answer is one complete creature, not two
-- half-creatures or a `partial` flag on a stat block that is entirely present.
--
-- Left unaddressed, the plausible failure is four entities from four pages: two
-- with ability scores and no actions, two with actions and no name. Every one
-- of them would import "successfully", and the DM would have to notice and
-- clean up four wrong rows.
--
-- ── The other three are layout, not structure ────────────────────────────────
--
-- Card fronts also print things in ways prose statblocks do not:
--   * ability scores as *graphics* — a number in a box with its modifier in a
--     circle beneath and STR/DEX/CON/INT/WIS/CHA as a label. There is often no
--     text layer at all, so this is vision work and worth naming explicitly.
--   * unlabelled boxes: "AC. 14 | 38 (6d8 + 12) | 30 ft." — only the first
--     carries a label, and the other two have to be recognised by shape.
--   * a combined type line: "Medium fey, neutral" carries size, creature type
--     and alignment in one string.
--
-- ── Why this is a prompt change and not a code change ────────────────────────
--
-- All four are the model reading a page. No amount of post-processing recovers
-- a creature that came back as two fragments, because the association between
-- the fragments is exactly what was lost. The mapper cannot re-join them.
--
-- This is the calibration loop the feature was always going to need. It is a
-- config row on purpose: the next real document that reads badly should produce
-- another one of these, not a deploy.
update ai_system_prompts
   set content = content || $$

## Layouts where one entity spans several pages

An entity is not always confined to one page. Card decks, spreads and reference
sheets routinely split a single creature across a front and a back: the front
carries the art, the name, the type line and the core numbers, and the back
carries saving throws, resistances, senses, challenge, traits and actions.

**Merge them.** That is one creature, and it should come back as one entity with
everything from both pages, marked "complete". Do not return the front and the
back as two entities, and do not mark it "partial" — nothing is missing, it is
just laid out across two sides. Use the name, the art and the running order to
decide which back belongs to which front; in a deck the back almost always
immediately follows its own front.

Reserve "partial" for what it means: information that is genuinely absent or
unreadable.

## Reading a card front

Card fronts print things differently from a prose statblock:

- **Ability scores are usually graphics**, not text — a number in a box, its
  modifier in a small circle beneath, and STR / DEX / CON / INT / WIS / CHA
  labelled underneath. Read the large number as the score. If the score and the
  modifier disagree, trust the score.
- **Not every box is labelled.** A row like "AC. 14 | 38 (6d8 + 12) | 30 ft."
  labels only the armour class; the dice expression is hit points and the
  distance is speed. Assign them by shape, not by hoping for a label.
- **The type line combines three fields.** "Medium fey, neutral" is size
  "Medium", creature type "fey", alignment "neutral". "Large construct,
  unaligned" is size "Large", type "construct", alignment "unaligned". Return
  each in its own field.$$,
       updated_at = now()
 where generator_type = 'document_import';
