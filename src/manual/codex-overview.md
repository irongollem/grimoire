---
title: Character Codex — Overview
section: Characters
section_order: 11
order: 0
summary: The compendium of species, backgrounds, classes, archetypes, and abilities your players build characters from — plus where characters themselves actually live.
keywords: codex, character codex, species, background, class, archetype, ability, feat, compendium, adventurer's rest, character pool, durable character, attach, detach, clone
---

The **Character Codex** (**Compendium → Character Codex** in the sidebar, `/codex`) is the rulebook behind character creation for your table. It holds every species, background, class, archetype, and ability your players can pick from. You build and curate it here; players read it — and pick from it — while creating or levelling their own characters.

## Key ideas

| Term | Meaning |
| --- | --- |
| Species | A playable race, with optional subraces/variants |
| Background | A starting package of proficiencies, equipment, and a signature feature |
| Class | A base class — SRD (read-only) or one you design from scratch |
| Archetype | A subclass attached to a base class |
| Ability | An individual feature, feat, or option that classes/archetypes/species reference |
| Campaign scope | Whether a piece of custom content appears in one campaign or all of yours |

## The five tabs

The Codex has five tabs — **Species**, **Backgrounds**, **Classes**, **Archetypes** and **Abilities** — and each has its own address, so you can bookmark the one you use most.

| Tab | What it contains |
| --- | --- |
| Species | Player races and their subraces/variants |
| Backgrounds | Character backgrounds with proficiencies and features |
| Classes | SRD classes (read-only) and custom classes you design |
| Archetypes | Subclasses — SRD and custom |
| Abilities | Individual features, feats, fighting styles, invocations, and similar options |

## How they connect

1. **Classes** and **Archetypes** reference **Abilities** — each level assigns one or more abilities from the Abilities list, and those appear on the player's character sheet Features tab once they reach that level.
2. **Archetypes** attach to a base class — one of the SRD classes or one of your own custom classes — and add their own features and (for casters) granted spells from their unlocking level onward.
3. **Species** determine whether a character can use the shapeshifter disguise system (see [Species and Backgrounds](#species-and-backgrounds)).
4. Character sheets pull from all five tabs during character creation and levelling — see [Creating Custom Classes](#creating-custom-classes) for the level-up side.

## Importing shared content

Each tab has its own **Import from Open5e** / **Sync from Open5e** button that pulls in ready-made options from Open5e's open-licence library:

1. **Species** — click **Import from Open5e** to open the import panel, pick a source, and import.
2. **Backgrounds** — click **Sync from Open5e** (or open the sources picker next to it to limit which sourcebooks are pulled in). The button reports how many entries were added and updated.
3. **Classes** — click **Import from Open5e** to sync the SRD classes into the read-only classes list.
4. **Archetypes** — click **Import from Open5e** to import SRD subclasses; their features are linked automatically.
5. **Abilities** — click **Sync from Open5e** to import features, feats, fighting styles, and similar options, and to backfill descriptions on any built-in entries that are still name-only.

All of these are idempotent — safe to re-run without duplicating entries, and a re-import never overwrites fields you filled in by hand (notes, custom art, hand-tuned mechanics).

## Custom content scope

Species, custom classes, archetypes, and custom abilities each carry a **Campaign Scope**: a specific campaign, or **All my campaigns**. A new piece of custom content defaults to your active campaign rather than "all my campaigns" — so homebrew written for one dark, grimdark table doesn't quietly show up in a lighter one. Editing existing content never changes its scope, no matter which campaign you have active when you save. Disabling a species or class for a campaign (Campaign Settings) hides it from pickers but never erases it from characters who already picked it.

## Where characters live — the Adventurer's Rest

A character belongs to its **player**, not to a campaign. Every player has a personal pool of characters, reachable from their Player Portal home (**Adventurer's Rest**) — every character they've made, attached to a campaign or resting unattached. A character can be attached to at most one campaign at a time, because its progression (level, XP, HP, inventory, gold) lives on that one character.

- **Continue** — jump straight into an attached character's campaign.
- **Detach** — return an attached character to the resting pool. Their current location and initiative clear; everything else (level, inventory, notes) travels with them.
- **Clone** — copy the character's full sheet, classes, and known spells into a new, unattached character in the same pool. Companions, party inventory, tracker state, and notes do **not** copy — the clone starts fresh at the table.
- **Attach** (unattached characters only) — pick one of the player's campaigns to bring the character into.
- **Edit** / **Delete** (unattached characters only) — edit the sheet without a campaign context, or permanently remove the character.

Wanting the same character at two different tables means cloning it — the two copies diverge from that point on, on purpose. A player can also have more than one character **attached to the same campaign** at once (a backup character, say); the **Champions** view lists all of a player's characters in the current campaign and lets them **Set Active** to change which one is linked to their seat at the table.

## What your players see

Players read the Codex from their own Reliquary (**Reliquary → Codex** tab in the Player Portal) — a read-only browser over **Species**, **Backgrounds**, **Classes** (with archetypes/subclasses nested inside each class card), and **Deities**. Abilities aren't browsed as their own list on the player side; players see them attached to the class features, species traits, or background feature they're actually reading. Deities come from the Pantheon feature, not the DM's Character Codex — see [Pantheon — Gods & Deities](#pantheon-gods-deities), and only deities you've revealed to a given character appear for them.

Character creation and levelling themselves happen outside the Codex, in the player's own portal (**New Character** from Adventurer's Rest, and **Level Up** from their character sheet) — see [Creating Custom Classes](#creating-custom-classes) for what a player sees during level-up.

## Tips

- Run these imports once per new campaign so players have the full standard option set before you start adding homebrew on top.
- Disabling a class or species for a campaign (**Campaign Settings → Classes** / **Species**) is reversible and doesn't touch characters who already picked the disabled option.

## Related

- [Creating Custom Classes](#creating-custom-classes)
- [Species and Backgrounds](#species-and-backgrounds)
- [Abilities Compendium](#abilities-compendium)
- [Hall of Heroes](#hall-of-heroes)
- [Character Sheet Export](#character-sheet-export)
- [Party Tracker](#party-tracker)
