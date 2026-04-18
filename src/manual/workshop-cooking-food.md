---
title: Cooking & Food Items
section: Workshop
section_order: 2
order: 2
summary: The cooking discipline and food tags. Note — mechanical hunger tracking is not yet implemented.
keywords: cooking, food, meal, ration, hunger, provision, cook
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

## Food / hunger tracking

*Not yet implemented.* There is currently no automated hunger or starvation mechanic. Food items sit in the inventory and can be consumed manually by removing them, but Grimoire does not track daily ration consumption or apply exhaustion for missed meals. This is a planned feature.
