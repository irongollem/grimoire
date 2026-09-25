---
title: NPC Generator
section: NPC Tracker
section_order: 4
order: 4
summary: Create NPCs by hand or with AI: quick fields, faction and associate links, and optional alter-ego art.
keywords: npc, generator, ai, quick create, alter ego, portrait, concept, credits
---

The NPC Generator is a slide-in panel for creating NPCs faster than the full editor, either by filling a handful of fields yourself, or by describing a concept and letting AI write the rest. Open it from the NPC Tracker's **Generate** header button.

## Key ideas

- **Quick Create** works with or without AI turned on: it's always available.
- **Generate with AI** needs your campaign's AI generation switched on (in Campaign Settings) and enough credits to cover the cost: it works the same on every plan.
- Everything you type in **Quick options** is used as a constraint the AI is told to respect, not just a starting point it might ignore.

## Quick Create

1. Optionally fill in any of: **Name** (auto-generated from a name table if left blank), **Species** (a preset list of 15 common races, or leave it "Any"), **Alignment**, **Relationship** (party stance), **Faction** and, once one is picked, **Role in faction**, **Location**, **Stat block template** (grouped by category), and **Known associate**: an existing NPC, plus the **Relationship type** to them once picked.
2. Optionally write something in the **Concept** box: for Quick Create this is saved as the new NPC's DM notes rather than sent to AI.
3. Click **Quick Create NPC**.

Picking a faction or an associate here creates that membership or connection automatically the moment the NPC is created, so you don't need a second trip to the Relations tab.

## AI Generation

Requires your campaign's AI generation to be turned on and enough credits to cover the cost: the button works the same on every plan; if AI is off for the campaign, it points you at the toggle instead of running.

1. Write a **Concept**: a free-text description (required for AI generation). Example placeholder: "A mysterious tiefling bard who works as a city informant and hides a dark past…"
2. Fill in any **Quick options** you want to lock in: they're injected into the AI prompt as constraints the model is told to honour "unless the concept explicitly conflicts."
3. Toggle **Generate portrait art** (on by default) to also generate a portrait image.
4. Toggle **Generate Alter Ego** (only available once portrait art is on) to additionally generate a disguised identity: a separate name and a second portrait, seeded from the true-form portrait. This uses twice the image-generation credits; the panel warns you inline when it's on.
5. The button shows its cost before you confirm: a line under **Generate with AI** reads the credit cost and your current balance, and the button disables if you can't afford it.
6. Click **Generate with AI**.

On completion you're taken straight to the new NPC's detail page, with every AI-returned field applied: name, species, alignment, age, occupation, status, relationship, tags, appearance, personality, backstory, notes, portrait, and (if requested) the alter ego's name and portrait.

### Running in the background

While a generation is in progress, click **Continue in background** to close the panel and keep working: a badge appears when it finishes. Only one AI generation can run at a time app-wide; the button disables with a tooltip if another one is already in flight.

## What your players see

Players never see the generator: it's a DM-only creation tool. Once you save or generate an NPC, its visibility to players is exactly what you set afterward (see [NPC Visibility Controls](#npc-visibility-controls)); nothing is shared automatically.

## Tips

> The Concept box is useful even without AI: for Quick Create it's saved straight into the NPC's DM Notes, so jotting a reminder there before you fill in the fields isn't wasted.

- A generated NPC's disguise starts unrevealed even when you asked for an alter ego. Reveal it from the sheet when you're ready for players to meet the true form.

## Related

- [NPC Tracker: Overview](#npc-tracker-overview)
- [NPC Visibility Controls](#npc-visibility-controls)
- [AI Generation & Credits](#ai-generation-credits)
