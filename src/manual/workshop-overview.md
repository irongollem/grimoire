---
title: Workshop Overview
section: Workshop
section_order: 2
order: 0
summary: How crafting disciplines, recipes, and player discovery work in the Workshop.
keywords: crafting, workshop, recipe, discipline, dc, player, discovery, reveal, import, starter
---

## What the Workshop is

The Workshop is Grimoire's crafting system. As DM you create recipes; players roll against them during downtime or rests. Each recipe belongs to one **discipline** that determines the tool used and the ability score rolled.

## Disciplines

| Discipline     | Tool                  | Ability | Workspace bonus |
| -------------- | --------------------- | ------- | --------------- |
| Alchemy        | Alchemist's Supplies  | INT     | +2              |
| Brewing        | Brewer's Supplies     | WIS     | +2              |
| Cooking        | Cook's Utensils       | WIS     | +2              |
| Herbalism      | Herbalism Kit         | WIS     | +3              |
| Jewel Crafting | Jeweler's Tools       | DEX     | +2              |
| Leathercraft   | Leatherworker's Tools | DEX     | +2              |
| Masonry        | Mason's Tools         | STR     | +3              |
| Painting       | Painter's Supplies    | DEX     | +2              |
| Poisoncraft    | Poisoner's Kit        | INT     | +3              |
| Smithing       | Smith's Tools         | STR     | +3              |
| Woodcraft      | Woodcarver's Tools    | DEX     | +2              |

The workspace bonus applies when the character has access to an appropriate workshop (forge, kitchen, laboratory, etc.) rather than improvising in the field.

## Recipes and DC

Each recipe has a **DC** (Difficulty Class) that the player rolls against using the relevant ability score. On a success they produce the listed outputs; on a failure they still consume the ingredients. The DM can optionally allow partial successes (e.g. half output on a roll 1–4 below DC).

**Crafting time** is listed in hours or days and represents active work, not passive waiting.

## Ingredient matching

Recipes use **tag-based ingredients** — any item in the player's inventory that carries all the required tags satisfies the slot. This means a recipe for "Cut Gem" that requires `gem, rough` will accept any rough gemstone, not one specific item. See _Crafting: Ingredient Tags_ for the full tag reference.

## Player visibility and recipe discovery

By default every recipe (including imported starter recipes) is **hidden from players**. You control which recipes players can see:

- The **eye icon** on each recipe row toggles visibility — click it to reveal or hide the recipe for specific players.
- The **Reveal All** button (top right, visible only when players have joined the campaign) sets every recipe to visible for all current players at once. Use this if you don't want to manage discovery one recipe at a time.

Players only see recipes that have been revealed to them. They cannot see DC values or ingredient requirements for hidden recipes.

## Importing starter recipes

Click **Import Starter Recipes** to seed your campaign with ~170 pre-built recipes across all disciplines. The importer:

- Skips recipes you already have (safe to re-run after updates)
- Creates any missing output items in your item vault automatically

Starter recipes are all hidden from players on import — reveal them individually or use _Reveal All_.

## Item vault integration

The **item vault import** (in the Items section) seeds the full provisions list including crafting ingredients and outputs. Rough gems, ore, herbs, and other crafting materials all appear there. Importing items before importing recipes is not required, but it means players will already have something to pick up and spend.
