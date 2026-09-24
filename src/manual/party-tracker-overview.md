---
title: Party Tracker
section: Running the Table
section_order: 1
order: 4
summary: Track your heroes' and companions' HP, conditions, and passive skills, roll death saves, and keep a shared group portrait.
keywords: party, tracker, hp, initiative, passive, companion, hero, death saves, conditions, curse, inspiration, portrait
---

The Party Tracker is your roster of player characters and companions, with the running HP, conditions and passive-skill numbers you need between and during sessions. Find it under **Campaign → Party** in the sidebar (`/party`).

## Key ideas

| Term | Meaning |
| --- | --- |
| Hero | A full party member — the complete character sheet (abilities, inventory, spells, proficiencies). |
| Companion | A lighter entry for an animal companion, hireling or familiar — HP, AC, speed and conditions, but no initiative tracking or full sheet. |
| Durable character | A hero a player owns and can bring between campaigns. Detach it here to let the player take it elsewhere; attaching or cloning one is done from the player's own side (their portal Home), not here. |

## Adding characters

1. Click **Add Hero** to create a full party member and open its editor.
2. Click **Add Companion** to create a lighter-weight entry — pick a **companion type** (Familiar, Animal Companion, Mount, Ally, Sidekick) and give it HP, AC and speed. A companion can optionally link to a source monster or NPC stat block.
3. A companion nests under its owning hero's card once you assign one; an unowned companion sits in its own "Unassigned Companions" section.

Note: the tracker sorts by rolled initiative once **every** member has one recorded; until then it falls back to the order you've arranged. There's no roll-all-initiative control on this page — roll initiative from the character sheet or the encounter runner, and it will be reflected here.

## Tracking HP and conditions

On each character's card:

1. Enter an amount in the numeric field and click **Damage** or **Heal** to adjust current HP (damage draws from temporary HP first). **Heal** also clears recorded death saves.
2. Click **+Temp** to grant temporary HP — it takes whichever is higher, the existing amount or the new one, rather than stacking them.
3. When a character drops to 0 HP, three success pips and three failure pips appear — click them to record death saves. Three failures marks the character dead; three successes stabilizes them.
4. Click **Condition** to open the list of conditions not already applied, and add one. Pick **Cursed…** from the bottom of that list to name a custom curse and add it as its own chip.
5. Toggle **Inspiration** with the sparkle icon on the card.

Passive skills (AC, Speed, Perception, Insight, Investigation, Arcana, History, Nature, Religion) and any saving-throw proficiencies are shown read-only on the card — they're calculated from the character sheet, not edited here.

## Editing a character

Click a hero to open its full editor, across four tabs: **Identity**, **Stats**, **Proficiencies**, **Persona**. The Stats tab is where you set ability scores, max/current/temp HP, AC, speed, initiative bonus, a carry-capacity override, and spell slots.

- Save with **Save Changes** (editing) or **Add to Party** (creating).
- **Detach from party** appears instead of **Remove from party** when the character is a durable one a player owns — detaching hands it back to them rather than deleting it.

## Group Portrait

Below the roster, **Upload** a photo, or **Generate**/**Regenerate** an AI-illustrated shot of the whole party, billed in credits — this one is available on Free as well as Pro. Reference it with `@Party` inside Chronicler scenes (Scriptorium) instead of dropping in every individual portrait — it saves both tokens and effort when illustrating group scenes.

## What your players see

Players see and manage their own character through the Player Portal's character sheet, not this tracker — the Party Tracker itself is a DM-only page. Damage, healing, conditions and death saves you record here are reflected on their own view.

## Tips

> Companions don't track initiative — if you need one to act in combat order, add it as a combatant in the Encounter Builder instead.

- A character's current location isn't edited here — it's set by moving them at a location, a calendar travel event, or "Rejoin the party" elsewhere in the app.
- Online presence (a dot showing which players are currently connected) shows on the Dashboard's Party widget, not on this page.

## Related

- [Character Codex — Overview](#character-codex-overview) — the full character-build side of a party member.
- [Scriptorium — Document Publisher](#scriptorium-document-publisher) — where `@Party` and individual portrait references are used.
- [Dashboard](#dashboard) — Party and Table Vitals widgets summarize this roster.
- [Encounter Builder](#encounter-builder) — where companions act as combatants.
