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

Where a discipline lists more than one tool, a character with proficiency in **any** of them qualifies, and having **any** of them in inventory satisfies the tools requirement. The workspace bonus applies when the character has access to an appropriate workspace (a full forge, a proper kitchen, a scriptorium, etc.) rather than improvising in the field; its exact label is shown as a checkbox in the roll dialog (e.g. "Full forge available" for Smithing).

Herbalism, Poisoncraft, and Forgery key off kits rather than a named artisan's tool: that's deliberate, a Charlatan's Forgery Kit is as real a qualification as a smith's hammer.

## Recipes and DC

Each recipe has a **Crafting DC** that the player rolls against using the discipline's ability score. Only a success spends the ingredients: the listed outputs are added to the player's backpack and every ingredient is used up. A failure costs nothing but the time, and a critical failure ruins just the *primary* ingredient (see below).

**Crafting time** is listed in minutes, hours, or days and represents active work, not passive waiting.

## When a craft goes wrong

A roll that misses the DC by less than 5 is a **failure**: the hours are gone and nothing is used up, but the *primary* ingredient (the first one on the recipe) drops one quality step, for example from Standard to Poor. Only the units the recipe would have used are affected; the rest of the stack keeps its quality.

A **natural 1**, or a total 5 or more below the DC, is a **critical failure**. The primary ingredient is spent and comes back as a Ruined item of the same name. Every other ingredient is untouched. After either result the player can press **Try again** as long as they still hold what the recipe needs.

## Ingredient quality

Every stack in the pack has a quality: Ruined, Poor, Standard, Fine or Masterwork. Standard is the usual case and shows no marker. The stacks a craft will spend add to the roll: Poor is -2, Fine is +1 and Masterwork is +2. When the stacks differ, the roll uses their average, weighted by how many units are spent and rounded toward the worse. The bench lists the materials behind it in "Your situation", for example "Poor leather, fine ingots", and says nothing when everything is Standard. The player chooses which stack to use first in the ingredient picker.

A roll that beats the DC by 10 or more makes a **Fine** result: every item the recipe makes comes out Fine. Masterwork is never crafted by a roll; it comes from the DM or from loot. A Ruined stack can never be used in a craft. When the world says the leather is poor, the DM changes that stack's quality.

## Generating a recipe with AI

When AI is enabled for your campaign, the **Generate** button beside **New Recipe** builds a whole recipe from a short concept: the name, discipline, DC, crafting time, flavour text, two to five tag-based ingredients, up to two conditional modifiers, and the item it produces. Describe what you want ("a smoky draught that lets the drinker breathe fire once") and, if you like, pick a discipline or an output item you already have. Leave the output empty and the AI invents one.

Nothing is saved straight away. After generating, the panel lists what it is about to create: the recipe, and either **Uses** an item you already own or from the shared library (matched by exact name), or **Creates a new item** if there is no match. Choose **Create** to save it and open the recipe, or **Back** to change your concept and try again.

The recipe is grounded in your campaign setting and your ruleset, and its DC and time are scaled to the output's rarity. It costs credits, shown on the button, and you can edit anything afterwards. Ingredients are tags, so any matching item in a player's inventory will do; see the tag reference below.

## Ingredient matching

Recipes use **tag-based ingredients** by default: any item in the player's inventory that carries all the required tags satisfies the slot. A recipe can also require one **specific** item instead. See [Crafting: Ingredient Tags](#crafting-ingredient-tags) for the full tag reference; every built-in starter recipe uses tag-based ingredients exclusively.

## Player visibility and recipe discovery

By default every recipe (including imported starter recipes) is **hidden from players**. You control who sees it:

- The audience control on each recipe card (an eye-style icon and a label: **Hidden**, a player count, or **All players**) opens a picker of party members: check who should see this recipe.
- **Reveal All** (top right, shown only once players have joined the campaign) sets every recipe visible to every current player in one click.

Players only see recipes revealed to them. A hidden recipe shows no DC or ingredient requirements to them at all.

## Importing starter recipes

Click **Import Starter Recipes** to seed your campaign with about 165 pre-built recipes across all fifteen disciplines. The importer:

- Skips recipes you already have (safe to re-run after updates).
- Creates any missing output items in your Vault automatically.

Starter recipes are all hidden from players on import: reveal them individually or use **Reveal All**.

## Experimenting

A player can also find a recipe they were never shown. On a discipline's tab in the Workshop they open **Experiment**: an empty bench where they lay items from their own pack (or the party stash) into dishes, up to eight, and press **Experiment**.

- **Only recipes you mark discoverable can be found.** In the recipe editor, use the search toggle in the action bar. A recipe stays secret unless you turn it on.
- **The set must be exact.** Every ingredient covered by its own dish, and nothing extra, so emptying a pack onto the bench finds nothing. One stack can fill several dishes, one per item it holds, so a recipe asking for an iron ingot and any metal is found by laying ingots twice. Equipped, ruined and container items are never offered.
- **Only the character's own player experiments.** Someone minding the character for a session cannot reveal recipes on it.
- **A match** adds the recipe to that character's recipes, posts a line in the chat so you see it, and offers "Attempt it now". Finding it needs no roll; the craft attempt that follows is the test.
- **No match** costs an hour that is stated, not tracked. Nothing is ever used up by experimenting.
- **Near-miss hints.** When a set is one ingredient short of a discoverable recipe, or has one item too many, the player is told they are close, never what is missing. Switch this off with the **Near-miss hints** rule in Campaign Settings, under Rules.

## Inventing something new

A player who wants something no recipe covers can **Invent** it. The button sits beside Experiment on each craft's tab in the Workshop, and opens the inventor's notebook for that craft. It is available when the **AI invention** rule is on and AI is enabled for the campaign. There are two ways in:

- **Describe it.** In the notebook the player writes what they want to make. The AI drafts a recipe and the item it makes.
- **Ask the bench.** After an experiment that finds nothing, or comes close, the player can press **Ask what these could make**. The AI looks at the materials laid out and suggests what they could become, or says that nothing comes to mind.

Rarity and value are paid for in materials. A draft can never be worth more than the materials it asks for, and an item is never rarer than the rarest ingredient. Magic needs rare materials and real skill: a magic recipe asks for a high DC and proficiency with the craft's tools, and takes days to make. A mundane item stays cheap and quick.

- **The DM approves every draft.** The player reviews the draft, can **Revise** it with a short note (a new draft, paid again), then **Send to your DM**. Nothing is created until you approve it. You can send it back with a note, and the player revises it. When you approve, the recipe is shared with that character, and any new item or material is added to the campaign.
- **The rules check the draft first.** Anything the AI invents is held to the craft's item types and to a power budget for its rarity. Where the description carries effects the rules did not recognise, you are warned in the draft.
- **It costs credits.** Each draft and each revision costs one credit, paid by the player who asks. Sending, withdrawing and clearing are free.

## Sounds

Each bench makes the sound of its craft while you roll, a hammer on the anvil, a pot on the boil, a loom at work, and a short sting tells you how it went. Players can turn them off with **Workshop sounds** in their settings, beside the dice sounds. On an iPhone or iPad older than iOS 18.4 the sounds cannot play, and the setting says so.

## Item vault integration

Importing items in the **Vault** seeds provisions including crafting ingredients and outputs: rough gems, ore, herbs, and other crafting materials. Importing items before importing recipes isn't required, but it means players will already have something to pick up and spend.

## What your players see

Players craft from their own **Crafting** page in the Player Portal: see [Cooking & Food Items](#cooking-food-items) and [Crafting: Ingredient Tags](#crafting-ingredient-tags) for what that page shows them and how the attempt roll works.

## Tips

> A recipe you just created is invisible to every player until you reveal it: new recipes don't default to visible.

- Turning the Crafting optional rule off doesn't delete your recipes; it just hides the Workshop nav item and the player Crafting page until you turn it back on.
- Leathercraft, Woodcraft, Jewel Crafting, Tinkering, Scribing, and Weaving each accept more than one tool for proficiency: check a player's actual tool proficiencies before assuming a recipe is locked to them.

## Related

- [Crafting: Ingredient Tags](#crafting-ingredient-tags)
- [Cooking & Food Items](#cooking-food-items)
- [Vault: Overview](#vault-overview)
- [Item Tags Overview](#item-tags-overview)
