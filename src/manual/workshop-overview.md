---
title: Workshop Overview
section: Workshop
section_order: 8
order: 0
summary: How crafting disciplines, recipes, and player discovery work in the Workshop.
keywords: crafting, workshop, recipe, discipline, dc, player, discovery, reveal, import, starter, optional rule
---

The **Workshop** (**Workshop** in the sidebar's Campaign group, `/crafting`) is Grimoire's crafting system. As DM you create recipes; players roll against them from their own Crafting page. Each recipe belongs to one **discipline** that determines the tool used and the ability score rolled.

Workshop only appears in the sidebar while the **Crafting** optional rule is enabled for the active campaign (it's on by default). To check or change it, go to **Campaign → Settings → Rules** and toggle **Crafting**.

## Disciplines

| Discipline | Tool(s) | Ability | Workspace bonus |
| --- | --- | --- | --- |
| Alchemy | Alchemist's Supplies | INT | +2 |
| Smithing | Smith's Tools | STR | +3 |
| Leathercraft | Leatherworker's Tools *or* Cobbler's Tools | DEX | +2 |
| Woodcraft | Woodcarver's, Carpenter's, *or* Shipwright's Tools | DEX | +2 |
| Jewel Crafting | Jeweler's Tools *or* Gemcutter's Tools | DEX | +2 |
| Herbalism | Herbalism Kit | WIS | +2 |
| Poisoncraft | Poisoner's Kit | INT | +2 |
| Tinkering | Tinker's Tools *or* Glassblower's Tools | INT | +2 |
| Cooking | Cook's Utensils | WIS | +2 |
| Scribing | Calligrapher's Supplies, Bookbinder's Tools, Scribe's Supplies, *or* Cartographer's Tools | INT | +2 |
| Forgery | Forgery Kit | DEX | +2 |
| Brewing | Brewer's Supplies | WIS | +2 |
| Weaving | Weaver's Tools *or* Tailor's Tools | DEX | +2 |
| Masonry | Mason's Tools | STR | +3 |
| Painting | Painter's Supplies | DEX | +2 |

Where a discipline lists more than one tool, a character with proficiency in **any** of them qualifies — and having **any** of them in inventory satisfies the tools requirement. The workspace bonus applies when the character has access to an appropriate workspace (a full forge, a proper kitchen, a scriptorium, etc.) rather than improvising in the field; its exact label is shown as a checkbox in the roll dialog (e.g. "Full forge available" for Smithing).

Herbalism, Poisoncraft, and Forgery key off kits rather than a named artisan's tool — that's deliberate, a Charlatan's Forgery Kit is as real a qualification as a smith's hammer.

## Recipes and DC

Each recipe has a **Crafting DC** that the player rolls against using the discipline's ability score. On a success the listed outputs are added to the player's backpack; on a failure or a critical failure the ingredients are still consumed (a critical failure additionally ruins the *primary* ingredient — see below).

**Crafting time** is listed in minutes, hours, or days and represents active work, not passive waiting.

## Ingredient matching

Recipes use **tag-based ingredients** by default — any item in the player's inventory that carries all the required tags satisfies the slot. A recipe can also require one **specific** item instead. See [Crafting: Ingredient Tags](#crafting-ingredient-tags) for the full tag reference; every built-in starter recipe uses tag-based ingredients exclusively.

## Player visibility and recipe discovery

By default every recipe (including imported starter recipes) is **hidden from players**. You control who sees it:

- The audience control on each recipe card (an eye-style icon and a label — **Hidden**, a player count, or **All players**) opens a picker of party members — check who should see this recipe.
- **Reveal All** (top right, shown only once players have joined the campaign) sets every recipe visible to every current player in one click.

Players only see recipes revealed to them. A hidden recipe shows no DC or ingredient requirements to them at all.

## Importing starter recipes

Click **Import Starter Recipes** to seed your campaign with about 165 pre-built recipes across all fifteen disciplines. The importer:

- Skips recipes you already have (safe to re-run after updates).
- Creates any missing output items in your Vault automatically.

Starter recipes are all hidden from players on import — reveal them individually or use **Reveal All**.

## Item vault integration

Importing items in the **Vault** seeds provisions including crafting ingredients and outputs — rough gems, ore, herbs, and other crafting materials. Importing items before importing recipes isn't required, but it means players will already have something to pick up and spend.

## What your players see

Players craft from their own **Crafting** page in the Player Portal — see [Cooking & Food Items](#cooking-food-items) and [Crafting: Ingredient Tags](#crafting-ingredient-tags) for what that page shows them and how the attempt roll works.

## Tips

> A recipe you just created is invisible to every player until you reveal it — new recipes don't default to visible.

- Turning the Crafting optional rule off doesn't delete your recipes; it just hides the Workshop nav item and the player Crafting page until you turn it back on.
- Leathercraft, Woodcraft, Jewel Crafting, Tinkering, Scribing, and Weaving each accept more than one tool for proficiency — check a player's actual tool proficiencies before assuming a recipe is locked to them.

## Related

- [Crafting: Ingredient Tags](#crafting-ingredient-tags)
- [Cooking & Food Items](#cooking-food-items)
- [Vault — Overview](#vault-overview)
- [Item Tags Overview](#item-tags-overview)
