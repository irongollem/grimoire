---
title: NPC Tracker — Overview
section: NPC Tracker
section_order: 4
order: 0
summary: How the NPC Tracker works and what it can do.
keywords: npc, tracker, overview, character, connections, relationships
---

The NPC Tracker is a searchable database of every non-player character in your campaign. It goes beyond a simple list — NPCs have full stat blocks, relationship networks, per-player visibility controls, inventory, and a disguise system for hidden identities.

## What an NPC record contains

- **Identity** — name, species, alignment, age, occupation, current location.
- **Status** — Alive, Dead, Missing, or Unknown (colour-coded badges on list cards).
- **Relationship to party** — Ally (blue), Neutral (grey), Enemy (red), Unknown (purple).
- **Portrait** — focal-point aware image; falls back to initials if none uploaded.
- **Rich text lore sections** — Appearance, Personality, Backstory, DM Notes.
- **Stat block** — optional full D&D 5e combat stats (see _NPC Stat Blocks_ below).
- **Connections** — directional relationships to other NPCs.
- **Faction memberships** — roles in one or more factions.
- **Inventory** — items this NPC carries, with a "Drop to Chat" loot button.
- **Per-player visibility** — control exactly which players can see this NPC.
- **Field-level visibility** — choose which individual fields (portrait, name, species, etc.) are visible per NPC.

## Finding NPCs

The list view is a responsive card grid that supports text search and tag filtering. Use the search bar to find NPCs by name, occupation, or any tag. Filters persist for the session so you don't lose your position when you navigate away and return.

## The Alter Ego (disguise system)

NPCs can have a hidden identity. Toggle **Has Disguise** on the editor to reveal the Alter Ego section, where you can set:

- A separate disguise name and portrait.
- A **Revealed** toggle — while concealed, all player-facing displays show the disguise identity.

Clicking **Reveal** or **Conceal** on the NPC sheet updates the state instantly and fires a notification in the campaign chat (when in Play mode).

## NPC Generator

Click **Generate** in the NPC toolbar to create NPCs quickly. The generator supports:

- **Quick Create** — fill basic fields and Grimoire builds the record.
- **AI generation** (requires an OpenAI API key in campaign settings) — describe a character concept and Grimoire writes the full profile, portrait art, and optionally a disguise.

The generator can run in the background — dismiss it while Grimoire works, and a notification badge appears when it's done.
