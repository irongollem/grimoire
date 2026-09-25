---
title: "NPC Tracker: Overview"
section: NPC Tracker
section_order: 4
order: 0
summary: The NPC record, the roster, the detail sheet's tabs, and how NPCs tie into the rest of the campaign.
keywords: npc, tracker, overview, character, stat block, portrait, disguise, alter ego, connections
---

The NPC Tracker is the roster of every named person in your campaign: allies, enemies, merchants, sages, mysterious strangers. Every NPC is a rich record: identity, roleplaying notes, an optional full D&D 5e stat block, faction memberships, inter-NPC relationships, per-player visibility, inventory, and an AI Voice Coach for improvising dialogue at the table. Find it under **NPCs** in the sidebar (`/npcs`).

## Key ideas

| Term | Meaning |
| --- | --- |
| **Relationship** | The NPC's stance toward the party, on a six-step scale: Hostile, Unfriendly, Indifferent, Friendly, Helpful, or Unknown. |
| **Status** | Alive, Dead, Missing, or Unknown. |
| **Alter Ego** | An NPC's optional hidden identity: a separate name and portrait shown to players while the true form is concealed. |
| **Reveal** | The single control (eye icon, on every NPC surface) that decides who can see an NPC and which of its fields they see. |
| **Connection** | A directional relationship between two NPCs (or an NPC and a party member), drawn from a 15-type taxonomy. |
| **Favour** | Something an NPC owes the party, tracked per NPC, settled by the DM when it's paid off. |

## Finding NPCs

The list is a responsive card grid (1 column on phones, up to 4 on wide desktop screens) with infinite scroll. Each card shows the portrait, name, a status dot, a relationship badge, species/occupation, location, and up to 3 tags. Two icon buttons sit over the portrait: **Edit** and the reveal (eye) button.

The filter bar offers:

- **Search NPCs…**: matches name, disguise name, species, occupation, location, and tags.
- **Status** and **Relationship** toggle groups.
- A **location** combobox (includes NPCs in child locations of the one you pick).
- A **Connected to…** combobox: shows only NPCs with a per-player connection note for the chosen party member.
- **Sort** by Name or Location.

A **Clear** button appears once any filter is active. Filters persist for the session.

### Header actions

- **Sets**: opens [NPC Sets](#npc-sets).
- **Web**: opens the [NPC Relationship Web](#npc-relationship-web).
- **Populate Setting**: shown only for campaigns using a recognised published setting (e.g. Forgotten Realms). Bulk-inserts that setting's canonical NPCs, skipping any already added by name, and reports how many were added.
- **Generate**: opens the [NPC Generator](#npc-generator).
- **Select**: turns on bulk-selection mode, letting you move or copy selected NPCs to another campaign.
- **New NPC**: creates a blank NPC (blocked by a paywall if your NPC quota is used up).

## The detail sheet

Click a card to open the sheet as a panel over the grid (a full-screen page on phones). Click **Edit** to open the full editor. Saving returns you to the sheet with the NPC's changes visible: the grid underneath is the "you're done" confirmation.

### Identity and portrait

The editor's left column holds two **Portrait** tabs, **True Form** and **Alter Ego**, each with its own image upload and focal-point picker. The right column holds Name, Disguise Name, Species, Alignment (10 D&D alignments plus Unaligned), Age, Occupation, and Location. **Factions** appears here too on an existing NPC, but the fuller faction view (role and status) lives on the Relations tab described below.

Also on the left: the **Party Stance** wheel (the five 5e attitudes, Hostile through Helpful; Unknown is simply the unset state, not a sixth option), four **Status** toggle buttons (Alive/Dead/Missing/Unknown), and a **Tags** field.

**NPC Connections** sits between Identity and the tab bar: click **Add**, pick another NPC and a relationship type, and optionally add a note. Each connection links straight to the other NPC's sheet.

### Tabs

| Tab | Edit mode | View mode | Contents |
| --- | --- | --- | --- |
| **Lore** | Yes | Yes | Appearance, Personality, Backstory, DM Notes: each a rich-text field, hidden when empty in view mode. |
| **Inventory** | Yes | Yes | Items carried by this NPC. |
| **Relations** | No | Yes | NPC connections, faction memberships, party connections, and favours owed: see below. |
| **Combat** | Yes | Yes | The stat block. |
| **Voice** | No | Yes | The AI Voice Coach. |

**Inventory**: pick an item in the **Search vault items…** box and click **Add** to give the NPC an item from your Vault. Each carried item shows quantity, an optional note, a **Vault** link back to the source item, a drop-to-chat button (hands the item to the party as a loot drop and removes it from the NPC), and a remove button.

**Relations** (view mode only, but every section on it owns its own save, so you never have to flip into the edit form to use it):

- **NPC connections**: the same add/edit/delete list as the Identity-column widget above.
- **Factions**: every faction this NPC belongs to, as a chip: the faction's name (links to its page), a **role** dropdown (Leader, Officer, Enforcer, Member, Initiate, Associate, Agent, Informant, Unknown) you can change in place, and a status label. Retired, Defected, Expelled, or Deceased memberships are dimmed and labelled; Active ones show no badge. Add a new membership from the **Add faction…** picker.
- **Party connections**: a per-party-member note (rich text) tagged with a relationship type, editable inline. See [NPC Visibility Controls](#npc-visibility-controls) for how each player sees only their own note.
- **Favours owed**: free-text entries ("What do they owe the party…") with **Add favour**. Each shows how long ago it was recorded and, if a quest set it, links to that quest. **Settle** marks it paid; settled favours move to a struck-through **Settled** list with a delete button. A quest's "owe a favour" consequence can add one of these automatically.

**Combat**: toggle **Include stat block** to attach one. Two ways to fill it in:

1. **From template**: a grouped dropdown of preset NPC templates; applying one fills every numeric field and trait list.
2. **From Bestiary**: search your campaign's monsters; picking one imports its full stat block, portrait, alignment, and tags. A custom monster keeps a link back to the Bestiary entry ("View in Bestiary →"); a shared monster's data just copies in, with no link back. If the NPC has no linked monster yet, a **Promote to Monster** button creates one from the NPC's current stats and takes you there.

Stat block fields: Armor Class, Hit Points (as a dice expression, e.g. `8d8+16`), Speed (Walk/Fly with Hover/Swim/Climb/Burrow), the six ability scores (with computed modifiers shown), Challenge Rating, Proficiency Bonus, Saving Throws, Skills, Damage Resistances/Immunities, Condition Immunities, Senses, Languages, Special Abilities, Spellcasting, Actions, and Legendary Actions.

**Voice**: a one-line situation box (500 characters) and **Suggest lines** returns 2–3 short in-character replies to read aloud. Nothing here is saved; navigate away and it's gone. **Ask again** re-rolls. If the NPC has an unrevealed alter ego, its true name is never sent to the AI at all: only the disguise persona.

### The Alter Ego (disguise system)

Give an NPC a **Disguise Name** and/or an Alter Ego portrait and it gains a parallel identity. The **SEEN AS** control (part of the reveal button on every NPC surface: list card, sheet header, mobile bars) switches between **Alter ego** and **True form**; this is what your own grid card and page title render, independent of whether any player can see the NPC at all. While concealed, every player-facing surface (portal card, chat announcements, the Voice Coach) shows the alter ego only: the real name is withheld, not merely hidden. See [NPC Visibility Controls](#npc-visibility-controls) for the full reveal control and how it announces in chat.

## Creating an NPC

Click **New NPC** for a blank record, or use the [NPC Generator](#npc-generator) for quick-create or AI generation.

## Links to quests, encounters, and locations

- **Location**: set an NPC's Location field and it appears there in the Atlas; a location's **Share linked NPCs** toggle can share every NPC at that spot with players in one step (see [NPC Visibility Controls](#npc-visibility-controls)).
- **Quests**: a quest can name an NPC as its giver, and a quest beat can attach an NPC so the party (and the DM, at the table) has it to hand; the "owe a favour" quest consequence can write straight into an NPC's Favours owed list.
- **Encounters**: an NPC with a stat block can be spawned as a combatant in the Encounter Runner, which reads its portrait, abilities, and full stat block directly from the NPC record.
- **Bestiary**: link an NPC to a monster (import its stats) or promote an NPC to a full Bestiary entry, in either direction.
- **Card Forge / Scriptorium**: from the edit form's **Send to…** menu, send an NPC to the Scriptorium as a formatted document, or use [NPC Sets](#npc-sets) to send a whole cast to the Card Forge at once.

## What your players see

Players never see an NPC by default. Once you share one (see [NPC Visibility Controls](#npc-visibility-controls)), it appears under **People** in their Party view, showing only the fields you've chosen and the disguise identity if one is active and unrevealed. Party connections and favours are DM-only; a player's own personal note about an NPC is private to them.

## Tips

> The generator, quick create, and Populate Setting all create NPCs the same way you'd expect: nothing about a generated NPC is locked or different from a hand-built one.

- Deleting an NPC removes its portrait images from storage along with the record. This can't be undone.
- An NPC's faction memberships, connections, and inventory travel with it when you move or copy it to another campaign (a general "make available everywhere" copy isn't offered for NPCs, because inventory rows require a campaign).

## Related

- [NPC Visibility Controls](#npc-visibility-controls)
- [NPC Relationship Web](#npc-relationship-web)
- [NPC Sets](#npc-sets)
- [NPC Generator](#npc-generator)
- [Factions](#factions)
- [Bestiary: Overview](#bestiary-overview)
