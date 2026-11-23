---
title: Party Tracker
section: Running the Table
section_order: 1
order: 4
summary: Track your heroes' and companions' HP, conditions, and passive skills, roll death saves, and keep a shared group portrait.
keywords: party, party tracker, tracker, hp, health, damage, heal, temp hp, initiative, passive, passive perception, companion, familiar, pet, mount, hero, add character, death saves, dead, revive, conditions, curse, inspiration, level up, milestone, xp, experience, deeds, portrait, group portrait, awareness, approval
---

Use the Party Tracker to keep an eye on your players' characters at the table: who is hurt, who is poisoned, who has the best passive Perception, and who is ready to level up. It is your roster of player characters and companions, with the running HP, conditions and passive-skill numbers you need between and during sessions. Find it under **Campaign → Party** in the sidebar. It is hidden in a Generic campaign, which has no characters.

## Key ideas

| Term | Meaning |
| --- | --- |
| Hero | A full party member: the complete character sheet (abilities, inventory, spells, proficiencies). |
| Companion | A lighter entry for an animal companion, hireling or familiar: HP, AC, speed and conditions, but no initiative tracking or full sheet. |
| Durable character | A hero a player owns and can bring between campaigns. Detach it here to let the player take it elsewhere; attaching or cloning one is done from the player's own side (their portal Home), not here. |

## Adding characters

1. Click **Add Hero** (at the top right, or **Add first hero** on an empty page) to create a full party member and open its editor. Players can also build their own characters from the Player Portal and join through your invite: see [Inviting Players](#inviting-players).
2. Click **Add Companion** (or **+ Add Companion** / **+ Add** on a hero's card) to create a lighter-weight entry: pick a **companion type** (Familiar, Animal Companion, Mount, Ally, Sidekick, Pet) and give it HP, AC and speed. A companion can optionally be built **From Monster**, **From NPC** or **Custom**, and is marked **With the party** (it joins new encounters) or **Elsewhere** (it sits out; click the **With Party** / **Elsewhere** switch on its card to change it). A **Pet** is a small, loved creature that lives with a character. It has stats so you can answer what happens to it, but it ignores combat: it never joins an encounter, never counts toward difficulty, and nobody commands it, not even its owner.
3. A companion nests under its owning hero's card once you assign one; an unowned companion sits in its own "Unassigned Companions" section.

Note: the tracker sorts by rolled initiative once **every** member has one recorded; until then it falls back to the order you've arranged. There's no roll-all-initiative control on this page. Roll initiative from the character sheet or the encounter runner, and it will be reflected here.

## Tracking HP and conditions

On each character's card:

1. Enter an amount in the numeric field and click **Damage** or **Heal** to adjust current HP (damage draws from temporary HP first). **Heal** also clears recorded death saves.
2. Click **+Temp** to grant temporary HP: it takes whichever is higher, the existing amount or the new one, rather than stacking them.
3. When a character drops to 0 HP, three success pips and three failure pips appear: click them to record death saves. Three successes shows **Stable**. Three failures shows **Dead** with two buttons: **Revive**, and **Mark as fallen…**, which opens the Hall of the Fallen dialog. Nobody is marked fallen on their own: see [Hall of the Fallen](#hall-of-the-fallen). A **Critical hit** checkbox appears beside the HP controls while a character is at 0 HP, so a hit that counts double adds two failures.
4. Click **Condition** to open the list of conditions not already applied, and add one. Pick **Cursed…** from the bottom of that list to name a custom curse and add it as its own chip.
5. Toggle **Inspiration** with the sparkle icon on the card.
6. Under the character's name, a **with [name]** tag shows when another player is looking after the character for the evening, and the eye icon previews the player's view (see [Inviting Players](#inviting-players)).

Passive skills (AC, Speed, Perception, Insight, Investigation, Arcana, History, Nature, Religion) and any saving-throw proficiencies are shown read-only on the card: they're calculated from the character sheet, not edited here.

## Editing a character

Click a hero's name to open their character sheet, the same sheet the player sees plus your own **DM notes** box, the character's connections and everything that mentions them. From there **Edit** opens the full editor across four tabs: **Identity**, **Stats**, **Proficiencies**, **Persona** (**Export Sheet** prints it, and the **⋯** menu has **Retire…** and **Mark as fallen…**). The Stats tab is where you set ability scores, max/current/temp HP, AC, speed, initiative bonus, a carry-capacity override, and spell slots.

- Save with **Save Changes** (editing) or **Add to Party** (creating).
- **Detach from party** appears instead of **Remove from party** when the character is a durable one a player owns: detaching hands it back to them rather than deleting it.

## Characters waiting for your approval

When a player's character joins with something this table does not have (their own homebrew, a book you have not enabled, or content you have blocked), a **Waiting for your approval** box appears above the roster. The character stays benched until you decide. Each line says why, with **View** to read it where there is something to read, and choices to allow it for this table or remove it from the character. Content made at another table cannot be approved here and has to be changed by the player. The **Members & Invites** tab in Campaign Settings shows a count while any are waiting.

## Levels and deeds

Unless the campaign uses the **Experience Points** rule, the party levels by milestone, and the **Levels** card below the roster is where you say when. A milestone reads "The party reaches level 4 when any 3 of these are done": pick the quests, or single objectives inside a quest, that should count, and how many of them it takes. They count in whatever order the party does them, so a level that comes after "three of the five big quests" needs no planning of which three.

When the count is reached the milestone shows **reached**, the **party level** rises to it, and the table hears it in chat. Every character below the party level gets **Ready to level up** on their sheet, and the player levels up their own character through the usual Level Up. You do it yourself only for a character nobody plays. The party level never drops by itself; set it by hand at the top of the card, for example to start the campaign at level 3. Your players never see the milestones or the quests they wait on, only the level they bring.

With the **Experience Points** rule on instead, there is no Levels card: when you end a fight the party won, the XP of the foes brought down is shared equally among the characters who were in it, and the table hears it in chat. A quest with a **Worth** set pays it by itself the first time it is completed, shared the same way. Use **Award** at the top of the roster only for XP nothing else gives: a quest with no Worth, a clever escape, good roleplay.

**Deeds** are separate: what the party has earned along the way, such as renown, a title or a promise. A quest's **Deed** payoff adds one, or you add one by hand.

## Group Portrait

Below the roster, the **Group Portrait** card lets you **Upload** a photo, or **Generate**/**Regenerate** an AI-illustrated shot of the whole party, billed in credits like any other AI generation, on every plan, once the campaign's AI Assistant is on. Reference it with `@Party` inside Chronicler scenes (Scriptorium) instead of dropping in every individual portrait: it saves both tokens and effort when illustrating group scenes.

## What your players see

Players see and manage their own character through the Player Portal's character sheet, not this tracker: the Party Tracker itself is a DM-only page. Damage, healing, conditions and death saves you record here are reflected on their own view.

## The Hall of the Fallen

The **Hall of the Fallen** button at the top of the page opens the memorial wall for characters who fell or retired: see [Hall of the Fallen](#hall-of-the-fallen).

## Awareness rolls

With the **Awareness Rolls** rule on (Campaign Settings, Rules), every character gets a secret Perception roll when a session starts. It shows as a small number beside passive Perception, on the Party page and on the Dashboard's Party widget, and only you can see it. The number is the die plus the character's current Perception bonus.

When a Perception check is due, click the number instead of asking the player to roll. It is used, a notice shows what it was for a few seconds, and a new one is rolled for that character straight away. **Use all awareness** does the same for the whole party. The number is read as the character stands when you look: a level-up is picked up, a Poisoned or Frightened character (or an exhausted one under the 2014 rules) gets the lower of two dice rolled for that, and 2024 Exhaustion takes its penalty. Hover the number to see how it is made. Continuing a session keeps the numbers; starting a new one rolls fresh ones.

## Tips

> Companions don't track initiative: if you need one to act in combat order, add it as a combatant in the Encounter Builder instead.

- A character's current location isn't edited here: it's set by moving them at a location, a calendar travel event, or "Rejoin the party" elsewhere in the app.
- Online presence (a dot showing which players are currently connected) shows on the Dashboard's Party widget, not on this page.

## Related

- [Character Codex: Overview](#character-codex-overview): the full character-build side of a party member.
- [Scriptorium: Document Publisher](#scriptorium-document-publisher): where `@Party` and individual portrait references are used.
- [Dashboard](#dashboard): Party and Table Vitals widgets summarize this roster.
- [Encounter Builder](#encounter-builder): where companions act as combatants.
