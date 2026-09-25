---
title: NPC Visibility Controls
section: NPC Tracker
section_order: 4
order: 1
summary: Control which players see which NPCs, which fields are revealed, and who wrote which note.
keywords: npc, visibility, player, field, share, reveal, disguise, per-player, favour
---

Grimoire gives you fine-grained control over what players know about each NPC. Every NPC surface (the list card, the sheet header, the mobile bars) carries the same reveal (eye) button; open it from any of them and you're editing the one shared state.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Visible to** | The set of party members who can see this NPC at all. |
| **Revealed fields** | Which of the NPC's fields those players actually see. |
| **SEEN AS** | Which identity, true form or alter ego, the NPC currently presents, independent of who can see it. |

## 1. Who can see this NPC

Open the reveal button and the popover (or, on a phone, a bottom sheet) shows:

- **Whole party**: one click shares the NPC with every current party member.
- **OR SPECIFIC**: a toggle per party member, for sharing with only some.
- **Hide from all players**: appears once anyone can see the NPC; removes everyone in one click.

Sharing an NPC with a player for the first time during a running session posts a narrative line to the campaign chat ("The party encounters [name]." or "[Player] encounters [name]."), using whatever name the player is actually allowed to see, never the true name of a concealed alter ego.

## 2. Which fields they see

Below **VISIBLE TO**, the reveal popover's **THEY ALSO SEE** section lists five fields you can toggle independently:

| Field | Notes |
| --- | --- |
| Portrait | |
| Name | The NPC's true name, or its disguise name while concealed. |
| Species | |
| Occupation | |
| Location | |

Status and Relationship are **not** on this list: both always have an "Unknown" value to fall back to, so they're shown to players by default and simply read as unknown until you set them otherwise.

The first time you share an NPC, Grimoire turns on **Portrait** and **Name** automatically so the share isn't a blank card, but only if you haven't chosen any fields yet. Re-revealing an NPC you've since hidden again never re-adds a field you deliberately turned off.

This is how you show a shadowy figure who is clearly alive and present, without revealing who they are: portrait and status visible, name off.

## Location NPC sharing

A location's **Share linked NPCs** toggle (in the Atlas) makes every NPC whose Location field points at *that* location visible to the players the location is shared with, even if the NPC's own **Visible to** setting doesn't list them. It only affects NPCs directly at that location, never ones in child locations, so an NPC tucked into a back room stays hidden. Field-level visibility still applies on top of this: an NPC surfaced this way shows only the fields you've shared for it.

## 3. Faction membership visibility

If a party member joins a faction, every member of that faction becomes visible to that player automatically, regardless of the NPC's own **Visible to** setting: faction members are assumed to know each other.

## The Alter Ego and the SEEN AS control

An NPC with a Disguise Name or a disguise portrait can wear either identity. The reveal popover's **SEEN AS** control switches between **Alter ego** and **True form**. It's deliberately separate from the **VISIBLE TO** audience above it: which face an NPC is wearing changes what your own grid card and page title render, whether or not a single player can see the NPC yet. While concealed, every player-facing surface, the portal card, chat, the Voice Coach, sees the disguise identity only; the true name is never sent or displayed, not merely hidden behind an instruction not to say it. Switching to **True form** during a running session posts a chat line announcing the reveal.

## Per-player connection notes

On the NPC's **Relations** tab, **Party connections** lets you write a note per party member (rich text, tagged with a relationship type such as "Contact" or "Mentor"). Each note is visible only to the party member it's written for, in their Player Portal.

## Party notes

When an NPC is shared with at least one player, a **Party Notes** panel appears near the top of the edit form: rich text visible to every player who can see the NPC, for knowledge the whole party shares.

## Player personal notes

Players can write their own private notes on any NPC they can see, from the Player Portal. These are visible only to that player, not to you, and not to other players.

## Favours owed

Favours (on the Relations tab) aren't player-visible at all: they're your own bookkeeping for what an NPC owes the party, settled when the debt is paid.

## Tips

> "Known but anonymous" mysteries work by combining these controls: share the NPC with Portrait and Location on but Name off, and the party can recognise the figure and where they were seen without learning who it is.

## Related

- [NPC Tracker: Overview](#npc-tracker-overview)
- [NPC Relationship Web](#npc-relationship-web)
- [Atlas: Locations](#atlas-locations)
- [Player Portal: Overview](#player-portal-overview)
