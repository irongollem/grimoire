---
title: Crafting: Ingredient Tags
section: Workshop
section_order: 2
order: 1
summary: How recipes match ingredients by tag — and when to use exact items instead.
keywords: crafting, recipe, ingredient, tag, workshop, cook, smith, brew, alchemy, herbalism, wood, ore, cloth
---

## Two ways to specify an ingredient

Each ingredient slot in a recipe is either:

- **Tag-based** — accepts any item whose tags include the required tag(s). Flexible and setting-agnostic.
- **Exact item** — requires a specific vault item. Use this when the ingredient has no meaningful equivalent (e.g. a named magical component). Select it from the item picker in the recipe editor.

The pre-loaded starter recipes use tags throughout because exact item IDs differ per campaign database. Your own recipes can freely mix both approaches.

## Single-tag vs. multi-tag matching (AND logic)

A tag ingredient can require **one tag** or **multiple tags at once**. When multiple tags are given, the item must carry *all of them* — it's AND logic, not OR.

- `meat` → any item tagged `meat` (Raw Meat, Cured Ham, any custom meat item)
- `meat, raw` → only items tagged both `meat` AND `raw` — excludes already-cooked or cured meats
- `ore, silver` → only silver ore specifically, not iron ore or silver ingots

In the recipe editor, enter multiple tags for one slot by separating them with commas in the tag field.

## Common tags used in pre-loaded recipes

The table below lists tags used by the built-in starter recipes. It is *not* a closed set — you can invent any tag you like and build recipes around it.

| Tag(s) | Discipline | Example items |
|---|---|---|
| `meat` | Cooking | Raw Meat, Dried Meat, Salted Pork |
| `meat, raw` | Cooking | Raw Meat only |
| `fish` | Cooking | Raw Fish, Smoked Herring |
| `vegetable` | Cooking | Vegetables, Root Vegetables |
| `grain` / `flour` | Cooking | Grain, Flour, Oats |
| `salt` | Cooking | Salt |
| `water` | Cooking | Waterskin (full), Flask of Water |
| `fruit` | Cooking / Brewing | Summer Berries, Autumn Fruits |
| `sweetener` | Cooking / Brewing | Honey (jar), Sugar (cone), Syrup (vial) |
| `herb` | Herbalism / Alchemy | Medicinal Herbs, Dried Herbs |
| `ore` | Smithing | Iron Ore, Mithral Ore, Steel Ingot |
| `silver` | Smithing | Silver Ingot, Silver Ore |
| `wood` | Woodcraft | Hardwood Timber, Branch, Yew Wood |
| `cloth` | Woodcraft / Weaving | Cloth, Canvas, Linen Bolt |
| `oil` | Woodcraft / Alchemy | Flask of Oil, Linseed Oil |
| `hide` / `leather` | Leathercraft | Animal Hide, Tanned Leather |
| `gem` | Jewel Crafting | Gemstone, Uncut Ruby, Diamond Dust |
| `venom` | Poisoncraft | Giant Spider Venom, Snake Venom Sac |
| `alcohol` | Brewing / Alchemy | Ale (Gallon), Wine (pitcher) |
| `fuel` / `brimstone` | Alchemy | Brimstone, Charcoal |

## Inventing your own tags

Tags are freeform. Create any tag that makes sense for your campaign — `dragon-scale`, `moonlit`, `shadowfell` — and build recipes around it. Players carrying items with that tag will automatically satisfy those ingredient slots.
