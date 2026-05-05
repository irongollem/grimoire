---
title: NPC Visibility Controls
section: NPC Tracker
section_order: 4
order: 1
summary: Control which players see which NPCs and which fields are revealed.
keywords: npc, visibility, player, field, share, reveal, disguise, per-player
---

Grimoire gives you fine-grained control over what players know about each NPC. There are three levels of visibility.

## 1. NPC-level visibility

The **Visible To** field on each NPC sets which players can see the NPC at all. Options:

- Not set — NPC is hidden from all players.
- Select specific players — only those players see the NPC in their Party view.
- All players — everyone in the campaign can see the NPC.

## 2. Field-level visibility

Even for NPCs players can see, you control which individual fields are shown. Open the **Visibility** section in the NPC editor and toggle each field independently:

| Field | Description |
|---|---|
| Portrait | Whether the character image is shown |
| Name | The NPC's real name (or disguise name if concealed) |
| Status | Alive / Dead / Missing / Unknown badge |
| Species | Race information |
| Occupation | Job or role |
| Relationship | Ally / Neutral / Enemy / Unknown badge |
| Location | Current location link |

This lets you share an NPC's portrait and status (a shadowy figure, clearly alive) without revealing who they are.

## 3. Faction membership visibility

If a PC joins a faction, all faction members become visible to that player automatically — regardless of the NPC-level `visible_to` setting. This is intentional: faction members are supposed to know each other.

## Per-player connection notes

In the NPC editor's **Player Notes** section, you can write a **per-player note** — a DM-authored snippet visible only to a specific player. Use this for things like: "You recognise this person from your backstory" or "She owes you a favour."

## Party notes

**Party Notes** are DM-written notes visible to all players who can see the NPC. Use these for shared knowledge the whole party has about a character.

## Player personal notes

Players can write their own private notes on any NPC they can see. These are not visible to other players or to you as DM.

## The Alter Ego and reveal state

When an NPC has a disguise and `is_revealed = false`, players who can see that NPC only see the disguise identity — portrait, name, and species all come from the Alter Ego. The real identity is hidden until you click **Reveal** on the NPC sheet. Revealing fires a notification in the campaign chat so the moment lands.
