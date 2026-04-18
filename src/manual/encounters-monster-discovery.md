---
title: Monster Discovery
section: Encounters
section_order: 3
order: 1
summary: How monsters are shared to the player bestiary during an encounter.
keywords: bestiary, discovery, reveal, monster, encounter, hidden, unseen, eye
---

## When does discovery happen?

A monster is added to the player bestiary the moment you click the **eye icon** on its combatant row and cycle it to the **Revealed** state. Players see the entry appear in their Bestiary tab immediately.

If any monsters were already in the **Revealed** state when you first clicked **Go Live**, they are also discovered at that point as a one-off batch.

## The hidden and unseen exceptions

Not every state triggers discovery:

- **Hidden** — the combatant is invisible to players entirely. Clicking the eye once moves it to Unseen — still no discovery.
- **Unseen** — players see the name and icon in the tracker (they heard footsteps, spotted a shadow), but the monster has not yet been *seen*. Clicking the eye again moves it to Revealed and triggers discovery.
- **Revealed** — full reveal. Discovery fires at this transition.

In short: the players have to actually *see* the creature before it goes into their bestiary.

## Reveal states

| State | Players see | Bestiary |
| --- | --- | --- |
| Hidden | Nothing — combatant not visible in tracker | Not shared |
| Unseen | Name and icon only — no stats | Not shared |
| Revealed | Full entry with portrait and stats | Shared immediately |

## Cycling states

Click the eye icon on any monster combatant to step through the cycle:

Hidden → Unseen → Revealed → Hidden

## Deduplication

If a monster was already in the bestiary from a previous encounter, it is not duplicated. The system checks for existing entries before inserting.
