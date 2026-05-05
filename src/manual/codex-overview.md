---
title: Character Codex — Overview
section: Character Codex
section_order: 9
order: 0
summary: The compendium of species, backgrounds, classes, archetypes, and abilities your players use to build characters.
keywords: codex, character codex, species, background, class, archetype, ability, feat, compendium
---

The **Character Codex** (`/codex`) is the rulebook behind character creation. It holds every species, background, class, archetype, and ability available in your campaign. Players see it in read-only form via the Reliquary; you build and customise it here.

## Five tabs

| Tab         | What it contains                                                    |
| ----------- | ------------------------------------------------------------------- |
| Species     | Player races and their subraces/variants                            |
| Backgrounds | Character backgrounds with proficiencies and features               |
| Classes     | SRD classes (read-only) and custom classes you design               |
| Archetypes  | Subclasses — SRD and custom                                         |
| Abilities   | Individual features, feats, fighting styles, maneuvers, invocations |

## How they connect

1. **Classes** reference **Abilities** — each class level assigns one or more abilities from the Abilities list.
2. **Classes** can have **Archetypes** — subclasses that modify or extend the base class.
3. **Character sheets** pull from all five tabs during character creation and levelling.
4. **Species** determine whether a character can use the **disguise/Alter Ego** system (shapeshifter flag).

## Importing SRD content

Each tab has an **Import from Open5e** button (or equivalent) that syncs official SRD content. Run these when setting up a new campaign so players have access to standard options:

- **Species** — imports all SRD species and subraces.
- **Backgrounds** — imports SRD backgrounds with proficiencies and features.
- **Classes** — syncs SRD classes (stored in a read-only `system_classes` table).
- **Abilities** — syncs SRD features and backfills descriptions for system features.

All imports are idempotent — safe to re-run without duplicating entries.

## Players and the Codex

Players access the Codex read-only from the Reliquary section of the Player Portal (`/play/rules` → Codex tab). They see all species, backgrounds, and classes — useful reference while building characters or choosing level-up options. Players cannot create or edit Codex content.

## Custom content scope

Custom classes and archetypes can be scoped to a specific campaign or made available across all your campaigns. Campaign-scoped content only appears in that campaign's character creation flow.
