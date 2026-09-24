---
title: Journal, Party & Live Play
section: Player Portal
section_order: 15
order: 3
summary: The Journal (with Quest Log, Puzzles, and document tomes folded in), the People tab, the live encounter panel, and player Settings.
keywords: journal, quest log, puzzles, tomes, party, companions, people, reliquary, live encounter, initiative, settings, notifications
---

This page covers the parts of the portal built around the party and the table, rather than one player's own character: the **Journal**, the **People** tab, the live-encounter panel, the player **Reliquary**, and **Settings**.

## Journal

Five tabs, each with a live count badge:

- **My Journal** — private entries only the player sees.
- **Party Journal** — entries any player has marked Shared.
- **Quest Log** — every quest you've shared with this player, grouped by status (Active / On Hold / Completed / Failed). This *is* the player's quest list — there's no separate Quests tab in the nav bar.
- **Puzzles** — every puzzle you've shared, with hint counts. Also not a separate nav tab.
- **DM Notes** — a read-only view of session notes you've shared with this player.

A journal entry has a category (Adventure, Clue, Discovery, Session, Character, Rumor — each colour-coded), an optional title, a rich-text body, an optional link to a quest/NPC/location/item/monster/encounter, and a Private/Shared toggle a player can flip any time after creating it.

**Document tomes.** Below the main tabs, a second pill row shows one tab per inventory item the party is currently carrying that has written content (a ledger, a contract). A tome appears the moment the party picks the item up and disappears the moment it leaves the inventory — it isn't something you or the player manage separately. Clicking one opens the same threaded, append-only writing surface used everywhere a document item appears; whether a player can add to it (not just read it) depends on the item's **content player-writable** flag, which you set in the [Item Vault](#vault-overview) editor.

## People (Party + shared NPCs)

Labelled **People** in the nav bar. A card grid split into two groups:

**Party members** — every character (the player's own sorts first, badged "You"), showing portrait, name, class/species/level, AC, up to 2 condition badges (+N for more), and HP — a number with a bar if HP visibility is set to "strategic" for that character or it's the viewer's own, otherwise an immersive label (Healthy/Hurt/Wounded/Bloodied/Dead). Companions (familiars, mounts, animal companions…) appear interleaved with their owner, with an "Elsewhere" badge if the owner has benched them.

**A player can manage their own companions here** — an "Add companion" button opens the same form you use, locked to their own character as owner. Clicking a companion they own opens an editable lightbox (HP steppers, condition add/remove, a Joining/Elsewhere toggle, Edit, and confirm-guarded Delete); a companion owned by someone else opens a plain read-only view.

**Shared NPCs** — a second grid of NPCs you've shared with this specific character, with relationship (ally/neutral/enemy/unknown) and status badges, filterable by name/race/occupation/relationship/status/location. Players can star an NPC (1–5) for their own relevance tracking — sorted starred-first.

## Live Encounter panel

A full screen on a phone; a persistent left sidebar (drag-resizable) on tablet and up, auto-opened the moment you start a fight.

Players get a toast the instant an encounter starts, plus a pulsing **Live** pill in the header. The panel shows: initiative order, a **Roll** button on their own "YOUR INITIATIVE" chip (rolls d20+DEX through the shared dice system) while they have no initiative yet, current-turn highlighting with an audio chime on their turn, their own HP/conditions updating live, and stat blocks for any monster they've discovered.

**Before combat starts (lobby only):** if the player owns any companions, a strip lets them toggle each one **Joining**/**Elsewhere** — and your runner watches that same status live, so a benched companion never needs manual removal from your side.

The subscription stays live even if the player navigates elsewhere in the portal.

## Reliquary (rules reference)

Five tabs: **Reference** (quick-reference cards), **Compendium** (the same rules browser you use), **Codex** (species/backgrounds/classes/archetypes), **House Rules** (only the custom rules you've marked player-visible), and **Licenses** (attribution — the same page you see, because the notices have to reach everyone who sees the content). Players can't create or edit anything here.

## Settings

Reached from the hamburger menu. Sections, top to bottom:

- **Display Name** — how the player appears to you and the rest of the party.
- **Install App** — PWA install prompt.
- **My Character** — claim or switch their linked character, or create a new one.
- **Upcoming Sessions** / **Session Availability** — Yes/No response to your proposed session dates.
- **Calendar Subscription** — an iCal feed URL that includes both confirmed and tentatively-proposed sessions.
- **Navigation** — drag-to-reorder the bottom bar (first 4/7 promote to the quick bar).
- **Email Notifications** — separate toggles for "Shared session notes" and "Session date proposals".
- **Combat Notifications** — "Turn audio cue" and "Dice roll sounds" toggles.
- **Dice** — choose where rolls come from (the built-in digital roller, or a physical-dice entry mode).
- **Appearance** — theme override (Campaign / Light / Dark / System) and a chat-timestamp locale override.
- **Screen** — a wake-lock toggle to keep the device awake during long sessions.
- **App** — a force-reload if the app looks stuck or stale.
- **Account** — links out to the account page for billing and account-level settings.

## Tips

> Quest Log and Puzzles are **tabs inside Journal**, not their own nav items — if a player says they "can't find their quests", point them at Journal, not the nav bar.

- **A dormant objective never appears in a player's Quest Log**, and a failed one stays visible marked failed rather than disappearing — both by design, not a bug if a player asks why a quest "lost" something.
- **Document tomes are entirely derived** from what's currently in the party's inventory — you never add or remove a tome directly.

## Related

- [Player Portal — Overview](#player-portal-overview) — navigation and how the portal is organised.
- [Character, Inventory & Spells](#character-inventory-spells) — the character-specific surfaces.
- [Quest Log](#quest-log) and [NPC Visibility Controls](#npc-visibility-controls) — where you control what shows up here.
