---
title: Cooking & Food Items
section: Workshop
section_order: 8
order: 2
summary: The cooking discipline and food tags. Note — mechanical hunger tracking is not yet implemented.
keywords: cooking, food, meal, ration, hunger, provision, cook, attempt craft, ingredient
---

## Cooking as a crafting discipline

Cooking uses *Cook's Utensils* and a **Wisdom** roll. With a proper kitchen available, the character gets a +2 workspace bonus to the roll. Recipes in this discipline produce meals and provisions tagged with `food`.

## Food tags

Provisions and cooked meals carry the `food` tag (and often a second tag describing the food type). These tags currently serve two purposes:

- **Crafting ingredient matching** — some advanced recipes may call for prepared food as an ingredient.
- **Organisation** — players can filter their inventory by the `food` tag to find rations quickly.

| Tag | Example items |
|---|---|
| `food` | Rations, Bread (loaf), Meat (chunk), Banquet |
| `ration` | Rations (1 day) |
| `drink` | Ale (mug), Wine (pitcher), Waterskin |
| `alcohol` | Ale, Wine, Spirits |
| `meal` | Banquet (per person) |

## Attempting a cooking recipe

Cooking works exactly like every other discipline — see [Workshop Overview](#workshop-overview) for how DC, proficiency, tools, and reveal-to-players all work, and [Crafting: Ingredient Tags](#crafting-ingredient-tags) for how ingredients match. There's nothing cooking-specific about the roll itself; only its tool (Cook's Utensils), ability (WIS), and the `food` tag on its outputs set it apart.

## What your players see

A player crafts from their own **Crafting** page (`/play/crafting`) in the Player Portal. Once you've revealed at least one Cooking recipe to them, a **Cooking** tab appears alongside any other discipline they have recipes for. Each recipe card shows the DC, crafting time, expected outputs, and a green/red checkmark per ingredient against what the character is actually carrying (party stash counts too). Clicking **Attempt Craft** opens a dialog showing the ingredient slots, any proficiency/tools warnings, optional modifier checkboxes (workspace bonus, poor-quality ingredients, any recipe-specific bonus), and finally the roll itself — success adds the outputs to their backpack, a failure or critical failure still consumes the ingredients (a critical failure additionally ruins the primary one), and the outcome is posted to the campaign chat automatically.

## Food / hunger tracking

*Not yet implemented.* There is currently no automated hunger or starvation mechanic. Food items sit in the inventory and can be consumed manually by removing them, but Grimoire does not track daily ration consumption or apply exhaustion for missed meals. This is a planned feature.

## Related

- [Workshop Overview](#workshop-overview)
- [Crafting: Ingredient Tags](#crafting-ingredient-tags)
- [Vault — Overview](#vault-overview)
