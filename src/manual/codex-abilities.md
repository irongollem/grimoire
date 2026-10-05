---
title: Abilities Compendium
section: Characters
section_order: 11
order: 3
summary: Manage the pool of individual features that classes and archetypes grant, and what each one does in the app.
keywords: ability, feature, fighting style, metamagic, maneuver, invocation, infusion, class feature, trait, passive, reaction, bonus action, mechanics, uses, rage, ability score improvement
---

The **Abilities** tab (**Character Codex → Abilities**) is the pool of individual features that classes and archetypes grant. Think of it as a library of atomic building blocks: a class assigns abilities to levels, and an archetype adds abilities at its unlocking levels. Feats have their own tab, see [Feats Compendium](#feats-compendium).

## Abilities and feats

An **ability** is something a class, archetype or species *grants* you at a level. A **feat** is something a character *chooses* to take. They live in the same place under the hood but are listed apart, so the Abilities tab shows only the granted ones.

## Official content is read-only

The class features, fighting styles, metamagic, maneuvers, invocations and infusions of the open-licensed books come with the app, so there is nothing to import. They are the same for every account. You can open and read them, and the page names the book each one comes from, but you cannot change or delete them. To change one, make your own ability and use that instead. Only the app's administrator can edit an official ability.

## Creating an ability

Click **New Ability**. Fields:

- **Name**: the large text field at the top.
- **Source**: attribution (for example "PHB" or "Homebrew").
- **Campaign Scope**: this campaign, or all your campaigns.
- **Prerequisite (as written)**: the book's wording, as free text (for example "Dexterity 13 or higher").
- **Tags**: freeform labels for filtering and for your own categories (for example `fighting-style`, `invocation`).
- **Description**: rich text. Write the full rules text here: this is what appears on the player's character sheet.
- **Mechanics**: what the app does with the ability. See below.

Click **Create** to save the new ability. An existing ability saves itself as you type; the line beside the name says **Saving…** and then **Saved**, and **Done** takes you back to reading it.

## Mechanics

The description is the rules text. **Mechanics** is what the character sheet, the dice roller and level-up read. A plain passive feature needs none of it: leave **How it is used** on *Passive*. Everything else is added only when you need it, with the buttons under the section:

- **How it is used**: Passive, Action, Bonus Action, Reaction or Special.
- **Add uses**: how many times it can be used (a fixed number, a number that changes by level, your proficiency bonus, an ability modifier, or a multiple of your class level, and unlimited from a level), when the uses come back (short rest, long rest, the start of your turn, dawn), how many a short rest gives back when it normally needs a long rest, and whether it is a pool you spend in chosen amounts, like Lay on Hands.
- **Spends uses from a pool**: using the ability costs uses from a pool by its key, such as Cutting Words spending Bardic Inspiration.
- **Add a level table**: a value from the class table that grows with level, like Sneak Attack 3d6 or Rage Damage +2.
- **Add a toggle**: a state the player switches on that ends by itself, like Rage.
- **Add a damage rider**: extra damage the player can tick on a damage roll, with the dice, the damage type, what it applies to, whether it is once per turn, and what adding it spends.
- **Add actions it allows**: named things the ability lets you do, listed under the action they take, like Cunning Action's Dash.
- **Add a choice**: something the player picks when they gain the ability, such as a fighting style, invocations, expertise, skills, a feat or an Ability Score Improvement, and how many.
- **Replaces another feature**: marks an optional feature that can be taken instead of another of the same class.

Every part has a **Remove** button. If a part is incomplete (a key left empty, a table with no levels) the red list at the top of the section says what to fix, and autosave waits until it is fixed so nothing half-finished is saved.

Because uses, choices and scaling live on the ability, a class or archetype no longer has its own list of resource pools or level-up prompts. Give the ability the uses or the choice, and assign it to a level.

### Ability Score Improvement

Ability Score Improvement is itself an ability: the official one is granted at the levels a class chooses. See [Creating Custom Classes](#creating-custom-classes) for the shortcut that places it.

## Generating an ability with AI

If AI is switched on for your campaign, **Character Codex → Abilities** has a **Generate** button next to **New Ability**. Describe what the ability does in a sentence or two. You can also pick how it is used, and say which class or species it is for. Grimoire writes the name, rules text, prerequisite and tags, balanced against the published abilities of your campaign's edition, fills in the mechanics it can be sure of, and opens the new ability so you can adjust it. It reads your campaign setting, and each generation costs credits (the cost is shown on the button). Once you edit a generated ability, it is marked as edited.

## How abilities flow to players

1. A **class** or **archetype** assigns ability X to level N.
2. A player's character reaches level N.
3. Ability X appears on the **Features** tab of the player's character sheet, with the full description text. Its uses show as pips that recharge on the rests you set, and any choice it carries is asked during level-up.

## Keeping abilities organised

The list is filterable by:

- **Text search**: matches name and tags.
- **Activation filter**: Passive, Action, Bonus Action, Reaction or Special.

Both filters persist while you navigate away and back, and **Clear** resets them.

## Tips

> Looking for "Class Feature" or "Species Trait" as a filter? That grouping doesn't exist as a field: use **Tags** to build your own categories, and search by tag.

## Related

- [Feats Compendium](#feats-compendium)
- [Character Codex: Overview](#character-codex-overview)
- [Creating Custom Classes](#creating-custom-classes)
- [Species and Backgrounds](#species-and-backgrounds)
