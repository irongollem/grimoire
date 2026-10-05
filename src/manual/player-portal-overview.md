---
title: "Player Portal: Overview"
section: Player Portal
section_order: 15
order: 0
summary: What the player portal is, how players join it, how it's laid out, and what stays hidden from them by default.
keywords: player, portal, overview, visibility, share, real time, sync, navigation, invite, join, preview
---

The Player Portal is a completely separate interface from the app you use as DM: not a stripped-down copy of your screens, but its own mobile-first client built around what a player needs at the table. Players are taken there automatically the moment they sign in, and they can never reach your DM screens: typing the address of one just sends them back to their own.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Player** | An account that has joined a campaign in the player role. |
| **Linked character** | The party member row a player's account currently controls. A player can own several (see Champions), but only one is active at a time. |
| **Share** | The unit of control you have: almost nothing is visible in the portal until you explicitly mark it shared, per entity. |
| **DM Preview Mode** | You browsing the portal as a specific player, without a second account. Covered in full on [Previewing as a Player](#previewing-as-a-player). |

## How players join

You generate an invite link in **Campaign Settings → Invites**: links carry a role (currently always player), an optional label, an expiry date, and a maximum use count. A player who opens the link signs up or signs in, and Grimoire validates the token, adds them as a member of the campaign, and drops them straight into the portal. See [Inviting Players](#inviting-players) for the full walkthrough of generating and managing those links.

A player with no campaign membership at all (they haven't joined anything yet) sees a single tab, **Home**: the cross-campaign character pool, their campaign list, and a join-by-code box.

## Navigation

The portal's layout is built for a phone: a fixed **bottom bar** rather than a sidebar, with iOS safe-area support and PWA installability. It carries up to **4 tabs on a phone** and **7 on a tablet**; anything past that slot count lives in a **More** sheet. Players can drag-reorder their own tabs in Settings to promote what they use most into the quick bar.

The full set of tabs (in default order), each hidden entirely if you've switched off its optional rule:

| Tab | What it's for |
| --- | --- |
| Hearth | The player's home: everything they need at a glance, before and during a game (below) |
| Character | The active character sheet |
| Spellbook | Prepared/known spells, slots, browsing |
| Journal | Personal journal, Quest Log, Puzzles, DM Notes, document tomes |
| Inventory | Gear, paper doll, coin purse, containers |
| Calendar | Read-only campaign date + timeline |
| People | Other party members + NPCs you've shared |
| Workshop | DM-shared crafting recipes, hidden unless the **Crafting** rule is on |
| Interlude | Downtime draws, hidden unless **The Interlude** rule is on |
| Atlas | Locations you've shared |
| Bestiary | Discovered monsters, Wild Forms |
| Reliquary | Rules reference, Compendium, Codex, House Rules, Licenses |
| Factions | Shared factions |
| Home | Cross-campaign character pool + campaign switcher |

Beyond the bar, a **hamburger menu** (top right) opens Campaigns (switch or create), a light/dark mode toggle, **Settings**, **Report a bug**, and **Sign Out**. A **chat bubble** icon opens Campaign Chat over the current page; a **dice** icon is a built-in roller always in reach.

A few surfaces aren't tabs at all. They're reached from inside another page: **Champions** ("My Characters" on the character sheet), **Character Sheet export** ("Export Sheet" on the character sheet), and the **Level-Up wizard** (from Champions or the character sheet). See [Character, Inventory & Spells](#character-inventory-spells).

## Hearth: the player's home

**Hearth** is where a player lands when they sign in or join, and the first tab in their bar. It answers what a player wants to know at a glance, and it changes on its own when you start and end a session; the player never switches it.

**Between sessions** it shows:

- **In the realm**: today's in-game date and the current tenday (or week), with days that have a shared event marked, and the next two events.
- **Their character**: portrait, level and class, hit points, AC, speed, initiative and passive Perception, any conditions and the spell slots left. A tap away from the full sheet.
- **Next session**: the next date on the schedule, how many players are coming, and their own **I'm in** / **Can't make it** answer, right there.
- **New for you**: handouts, quests, puzzles and notes you've shared that they haven't opened yet. It reads the same "unread" as the red dot on the Journal tab, so the two always agree.
- **Your quests**: each active quest with what is happening on it right now.
- **Your notes**: the notes and journal entries they wrote most recently.

**While a session is running** it becomes the table view:

- An oxblood band says the session is live and for how long. In a fight it adds the round and where they stand ("You're up after the Bandit Captain"; a monster you've hidden is never named) with a **Join the fight** button.
- **Vitals**: big hit points with the same damage, heal and temp controls as the sheet, and AC, initiative, speed and passive Perception.
- **Spellcasting**: what they're concentrating on and their slots, tap to spend. Hidden for characters without either.
- **Checks**: your six abilities, a Save button under each, and all eighteen skills. Tap one to roll it, or hold it to roll with advantage or disadvantage. It rolls exactly as the character sheet does, so Wild Shape, conditions and exhaustion are already counted. Attacks stay on the encounter page and spells on the Spellbook.
- **Waiting for you**: handouts you've just shared, and any loot drop, chest or offer from this session that is still up for grabs. Loot is still claimed in chat, race and all: **To the drop** opens the chat at that drop.
- **Right now**: the quest step the party is on.
- **Session notes**: a note for this session that saves itself as they type, private unless they tick **Share with DM**.

A player with no character yet gets a welcome instead: make a character (or claim one you prepared), answer the first session date, and a list of what will gather on Hearth once you start sharing.

## Real-time sync

Everything you share syncs live over Supabase Realtime. Reveal a hint, edit an NPC's status, or drop loot to chat, and it appears on a connected player's device without a refresh. During a live encounter, HP changes, condition updates, monster reveals, and turn notifications all land the same way: see [Journal, Party & Live Play](#journal-party-live-play).

## What you control

Almost nothing in the portal is visible by default. You share content per entity, and often per field:

- **NPCs**: visible-to list, plus which individual fields (portrait, name, status…) show.
- **Quests**: visible-to list; objectives and references are gated per row.
- **Locations**: visible-to list, with description, NPC list, store inventory, and map each toggled independently.
- **Factions**: visible-to list; members of a faction auto-see it.
- **Monsters**: revealed per player on discovery; stat block visibility is separate from discovery itself.
- **Puzzles**: a share toggle, plus hints revealed one at a time.
- **Recipes**: revealed per player.
- **Session notes**: a per-note list of which players can see it.

Each of those controls lives on the owning feature's own manual page (NPCs, Quests, Atlas, and so on): this section covers the portal itself, not each feature's visibility toggle.

## Related

- [Inviting Players](#inviting-players): generating and managing invite links.
- [Previewing as a Player](#previewing-as-a-player): seeing the portal through a specific character's eyes.
- [Character, Inventory & Spells](#character-inventory-spells): the character sheet, inventory, and spell management surfaces.
- [Journal, Party & Live Play](#journal-party-live-play): journal, party view, Reliquary, and the live encounter panel.
