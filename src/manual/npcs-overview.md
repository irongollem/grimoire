---
title: "NPC Tracker: Overview"
section: NPC Tracker
section_order: 4
order: 0
summary: The NPC record, the roster, the detail sheet's tabs, and how NPCs tie into the rest of the campaign.
keywords: npc, npcs, tracker, roster, overview, character, person, stat block, portrait, disguise, alter ego, connections, relations, family, faction, memory, voice coach, spoken voice, voice, read aloud, accent, language, inventory, party stance, relationship, status, favour, populate, bulk, move, copy
---

The NPC Tracker is the roster of every named person in your campaign: allies, enemies, merchants, sages, mysterious strangers. Every NPC is a rich record: identity, roleplaying notes, an optional full D&D 5e stat block, faction memberships, family and other connections, per-player visibility, inventory, a memory of what was said, and an AI Voice Coach for improvising dialogue at the table. Find it under **NPCs** in the sidebar.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Relationship** | The NPC's stance toward the party, on a six-step scale: Hostile, Unfriendly, Indifferent, Friendly, Helpful, or Unknown. |
| **Status** | Alive, Dead, Missing, or Unknown. |
| **Alter Ego** | An NPC's optional hidden identity: a separate name and portrait shown to players while the true form is concealed. |
| **Reveal** | The single control (eye icon, on every NPC surface) that decides who can see an NPC and which of its fields they see. |
| **Connection** | A tie between this NPC and a person, faction, place, deity, item or quest: a mentor, a rival, a membership with a role, a home. Family is kept separately, in its own block. |
| **Favour** | Something an NPC owes the party, tracked per NPC, settled by the DM when it's paid off. |

## Finding NPCs

The list is a responsive card grid (1 column on phones, up to 4 on wide desktop screens). A layout toggle at the end of the header buttons switches between cards and compact rows. Each card shows the portrait, name, a status dot, a relationship badge, species/occupation, location, and up to 3 tags. Two icon buttons sit over the portrait: **Edit** and the reveal (eye) button.

The filter bar offers:

- **Search NPCs…**: matches name, disguise name, species, occupation, location, and tags.
- **Status** and **Relationship** toggle groups.
- An **All locations** combobox (includes NPCs in child locations of the one you pick).
- A **Connected to…** combobox: shows only NPCs with a per-player connection note for the chosen party member.
- **Sort**, by Location or by Name.

On a phone the search box sits on top and the other filters open from the filter button beside it, with **Clear all** and a **Show N** button at the foot. The header buttons sit in a **More actions** menu.

A **Clear** button appears once any filter is active. Filters persist for the session.

### Header actions

- **Sets**: opens [NPC Sets](#npc-sets).
- **Web**: opens the [World Web](#world-web).
- **Populate Setting**: shown only for campaigns using a recognised published setting (e.g. Forgotten Realms). Bulk-inserts that setting's canonical NPCs, skipping any already added by name, and reports how many were added.
- **Generate**: opens the [NPC Generator](#npc-generator).
- **Select**: turns on bulk-selection mode, letting you move or copy selected NPCs to another campaign.
- **New NPC**: creates a blank NPC (blocked by a paywall if your NPC quota is used up).

When older family links still say just "Family", a notice above the list asks "Which way do your families go?" See [Family trees](#family-trees).

## The detail sheet

Click a card to open the sheet as a panel over the grid (a full-screen page on phones). The panel's header has the reveal (eye) control and **Edit**. Names of family and connections open in the same panel, and a back arrow walks you back along the trail. Click **Edit** to open the full editor. In the editor, **Save Changes** saves and takes you back to the NPC list, which is the confirmation that it landed; a new NPC opens on its own page after **Create NPC** so you can add connections straight away. **Cancel** leaves without saving. **Delete**, **Send to…** (Scriptorium, or a copy to another campaign) and **Generate** (AI, when it is on) sit beside them.

### Identity and portrait

The editor's left column holds the portrait in three tabs, **True Form**, **Cutout** (a cut-out figure of the true form, for tokens and scenes) and **Alter Ego**, each with its own image upload, focal-point picker and AI generation. The right column holds Name, Disguise Name, Species, Alignment (10 D&D alignments plus Unaligned), Size, Age (description), Born, Died, Occupation, and Location. A **Born** date replaces the age description on the sheet and works the age out from the campaign's calendar; when the NPC's status is Dead, **Died** appears too. **Size** (Medium unless you change it) sets how many squares the NPC's token covers on the battle map.

Also on the left: the **Party Stance** wheel (the five 5e attitudes, Hostile through Helpful; Unknown is simply the unset state, not a sixth option), four **Status** toggle buttons (Alive/Dead/Missing/Unknown), and a **Tags** field.

On an existing NPC the editor shows the **Connections** and **Family** blocks between Identity and the tabs, the same ones as on the Relations tab below, plus **Party Notes** at the top once the NPC is shared with a player. The editor's own tabs are **Lore**, **Inventory** and **Combat**.

### DM notes

Every NPC has a **DM notes** box on its page, in view and edit mode alike. It is private, saves as you type, and is no longer a field on the Lore tab. See [DM Notes and the Scratchpad](#dm-notes-and-the-scratchpad).

### Tabs

| Tab | Edit mode | View mode | Contents |
| --- | --- | --- | --- |
| **Lore** | Yes | Yes | Appearance, Personality, Backstory: each a rich-text field, hidden when empty in view mode. The sheet also lists anything else in the campaign that mentions the NPC, and the **Canon here** clues and passages that belong to them. |
| **With the party** | No | Yes | What each player character knows about this NPC. See below. |
| **Memory** | No | Yes | What this NPC and the party have told each other, session by session. |
| **Inventory** | Yes | Yes | Items carried by this NPC. |
| **Relations** | No | Yes | Family, Connections (including faction memberships) and favours owed: see below. |
| **Combat** | Yes | Yes | The stat block. |
| **Voice** | No | Yes | The NPC's spoken voice and the AI Voice Coach. |

**Inventory**: pick an item in the **Search vault items…** box and click **Add** to give the NPC an item from your Vault. Each carried item shows quantity, an optional note, a **Vault** link back to the source item, a drop-to-chat button (hands the item to the party as a loot drop and removes it from the NPC), and a remove button.

**With the party** (its own tab): one row per character in the party, with a count of how many have been shown this NPC. Each row says whether they can see this NPC (**Share** / **Shared** toggles it, exactly like the reveal popover), when they met them, and their **connection**: pick a type under **Their connection…**, such as "Contact" or "Mentor", and write a note. The note is labelled with whose it is ("Wren reads this") because that player sees it on their People page as "Your connection"; it saves as you type, and clearing it removes it. Beside the rows sit the disguise, with **Reveal true self**, and **When shared, they see**, the fields a share shows.

**Memory**: the answer to "what did Bram already admit last session?" Each line is one thing worth remembering, of one of six kinds: **Told the party** (what they let slip or admitted), **Heard from the party** (what the party told them), **Promise**, **Deception** (a lie told and believed, either way), **Attitude** (how they feel about the party now) and **Happened**. The add row sits at the top so you can log a line in the middle of a scene: pick the kind, type the line, press Enter. Optionally mark **who was there** and tick **Players see this** to share the line with them (with everyone present, or the whole party when nobody is marked); it then shows on their People page under "What we know". A line files under the running session, or the last one played when no session is running, and you can pick another. Below, the timeline groups every line by session, newest session first, each with **Edit** and **Delete**. Adding a line also puts the NPC on your scratchpad's "This session" list. When the line gives away one of your DM-only passages, click **Discloses a secret…** and pick it: the list shows every DM-only passage in the campaign's notes, places, factions, items and puzzles, searchable by its text or where it lives. The line then names the secret and links to it, and the passage itself is labelled with who told the party and when.

**Relations** (view mode only, but every section on it owns its own save, so you never have to flip into the edit form to use it):

- **Family**: parents, spouse, siblings and children, with **Add relative** and **Open tree**. See [Family trees](#family-trees).
- **Connections**: everything else this NPC is tied to, grouped as people, factions, places, deities, items and quests. Press **Add connection**, search for the other thing and pick what they are to each other. A faction membership is added here too, and keeps its role (Leader, Officer, Member, Agent and so on) and status, changeable in place on the row. Retired, Defected, Expelled or Deceased memberships are dimmed. Each row has an eye for which players are told, and a `...` menu for its note and the line players read. **In the web** opens the [World Web](#world-web) on this NPC, and with AI on, **Suggest** proposes connections for you to accept or dismiss.
- **Favours owed**: free-text entries ("What do they owe the party…") with **Add favour**. Each shows how long ago it was recorded and, if a quest set it, links to that quest. **Settle** marks it paid; settled favours move to a struck-through **Settled** list with a delete button. A quest's "owe a favour" consequence can add one of these automatically.

**Combat**: toggle **Include stat block** to attach one. Two ways to fill it in:

1. **From template**: a grouped dropdown of preset NPC templates; applying one fills every numeric field and trait list.
2. **From Bestiary**: search your campaign's monsters; picking one imports its full stat block, portrait, alignment, and tags. A custom monster keeps a link back to the Bestiary entry ("View in Bestiary →"); a shared monster's data just copies in, with no link back. If the NPC has no linked monster yet, a **Promote to Monster** button creates one from the NPC's current stats and takes you there.

Stat block fields: Armor Class, Hit Points (as a dice expression, e.g. `8d8+16`), Speed (Walk/Fly with Hover/Swim/Climb/Burrow), the six ability scores (with computed modifiers shown), Challenge Rating, Proficiency Bonus, Saving Throws, Skills, Damage Resistances/Immunities, Condition Immunities, Senses, Languages, Special Abilities, Spellcasting, Actions, and Legendary Actions. A **How it fights** section sets how the app plays the NPC in a fight; it works as described in Creating Custom Monsters in the Bestiary manual.

**Voice**: two parts, shown in campaigns with AI switched on.

**Spoken voice** is the voice that reads this NPC aloud at the AI table. Until you pick one it says **Cast at the table**: the table chooses a fitting voice the first time the NPC speaks and keeps it. **Change** opens the voices to pick from, each with **Listen**, and the choice saves at once. Either way the choice is written on the NPC, so they sound the same every sitting; only **Change** gives them another. Player characters and people with no NPC record keep a voice of their own too, worked out from their name each time.

What the NPC keeps is a kind of voice ("Old woman, frail", "Shady guy"). If Grimoire's own voice for that kind is ever replaced by a better one, everyone of that kind gets the new one together.

A voice is a sound, not a language: every voice reads whatever language the line is written in, so a voice with a German or Chinese accent speaks English lines in English, with that accent. The accent belongs to the voice, so pick a voice with the accent you want. Each spoken line can also carry a short cue for how it is said (whispered, furious, laughing), which the character chooses as it speaks; that shapes the delivery of the line, not who the voice is. If the NPC should actually speak Dutch or German, the line itself has to be in that language.

The **Voice Coach** has a one-line situation box (500 characters) and **Suggest lines** returns 2–3 short in-character replies to read aloud. The coach reads the NPC's newest **Memory** lines, so what it suggests stays consistent with what has already been said. Nothing is kept unless you press **Said it** on a line, which adds it to the Memory tab as something they told the party (private until you share it there). **Ask again** re-rolls. If the NPC has an unrevealed alter ego, its true name is never sent to the AI at all: only the disguise persona.

### The Alter Ego (disguise system)

Give an NPC a **Disguise Name** and/or an Alter Ego portrait and it gains a parallel identity. The **SEEN AS** control (part of the reveal button on every NPC surface: list card, sheet header, mobile bars) switches between **Alter ego** and **True form**; this is what your own grid card and page title render, independent of whether any player can see the NPC at all. While concealed, every player-facing surface (portal card, chat announcements, the Voice Coach) shows the alter ego only: the real name is withheld, not merely hidden. See [NPC Visibility Controls](#npc-visibility-controls) for the full reveal control and how it announces in chat.

## Creating an NPC

Click **New NPC** for a blank record, or use the [NPC Generator](#npc-generator) for quick-create or AI generation.

## Links to quests, encounters, and locations

- **Location**: set an NPC's Location field and it appears there in the Atlas under **People in the Area**; a location's **People here** switch in its Reveal control can share every NPC at that spot with players in one step (see [NPC Visibility Controls](#npc-visibility-controls)).
- **Quests**: a quest can name an NPC as its giver, and a quest beat can attach an NPC so the party (and the DM, at the table) has it to hand; the "owe a favour" quest consequence can write straight into an NPC's Favours owed list.
- **Encounters**: an NPC with a stat block can be spawned as a combatant in the Encounter Runner, which reads its portrait, abilities, and full stat block directly from the NPC record.
- **Bestiary**: link an NPC to a monster (import its stats) or promote an NPC to a full Bestiary entry, in either direction.
- **Card Forge / Scriptorium**: from the editor's **Send to…** menu, send an NPC to the Scriptorium as a formatted document, or use [NPC Sets](#npc-sets) to send a whole cast to the Card Forge at once.

## What your players see

Players never see an NPC by default. Once you share one (see [NPC Visibility Controls](#npc-visibility-controls)), it appears under **People** in their Party view, showing only the fields you've chosen and the disguise identity if one is active and unrevealed. Party connections and favours are DM-only; a player's own personal note about an NPC is private to them.

## Tips

> The generator, quick create, and Populate Setting all create NPCs the same way you'd expect: nothing about a generated NPC is locked or different from a hand-built one.

- Deleting an NPC removes its portrait images from storage along with the record. This can't be undone.
- An NPC's faction memberships, connections, and inventory travel with it when you move or copy it to another campaign (a general "make available everywhere" copy isn't offered for NPCs, because inventory rows require a campaign).

## Related

- [NPC Visibility Controls](#npc-visibility-controls)
- [World Web](#world-web)
- [NPC Sets](#npc-sets)
- [NPC Generator](#npc-generator)
- [Factions](#factions)
- [Bestiary: Overview](#bestiary-overview)
