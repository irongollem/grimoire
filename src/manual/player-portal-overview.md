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
| Character | The active character sheet |
| Inventory | Gear, paper doll, coin purse, containers |
| Spellbook | Prepared/known spells, slots, browsing |
| People | Other party members + NPCs you've shared |
| Calendar | Read-only campaign date + timeline |
| Journal | Personal journal, Quest Log, Puzzles, DM Notes, document tomes |
| Workshop | DM-shared crafting recipes, hidden unless the **Crafting** rule is on |
| Interlude | Downtime draws, hidden unless **The Interlude** rule is on |
| Atlas | Locations you've shared |
| Bestiary | Discovered monsters, Wild Forms |
| Reliquary | Rules reference, Compendium, Codex, House Rules, Licenses |
| Factions | Shared factions |
| Home | Cross-campaign character pool + campaign switcher |

Beyond the bar, a **hamburger menu** (top right) opens Campaigns (switch or create), a light/dark mode toggle, **Settings**, **Report a bug**, and **Sign Out**. A **chat bubble** icon opens Campaign Chat over the current page; a **dice** icon is a built-in roller always in reach.

A few surfaces aren't tabs at all. They're reached from inside another page: **Champions** ("My Characters" on the character sheet), **Character Sheet export** ("Export Sheet" on the character sheet), and the **Level-Up wizard** (from Champions or the character sheet). See [Character, Inventory & Spells](#character-inventory-spells).

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
