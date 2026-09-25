---
title: Monster Discovery
section: Encounters & Bestiary
section_order: 5
order: 2
summary: How monsters are shared to the player bestiary during a live encounter.
keywords: bestiary, discovery, reveal, monster, encounter, hidden, unseen, eye, runner
---

Discovery is what connects a live fight to your players' own Bestiary tab: the moment you show them a creature in the Encounter Runner, it becomes something they can look up for the rest of the campaign. It happens automatically as a side effect of the reveal toggle on each combatant row in the **Encounter Runner** (`/encounters/:id/run`): there's no separate discovery button.

## When does discovery happen?

A monster is added to a player's Bestiary the moment you click the reveal toggle (eye icon) on its combatant row and cycle it to the **Revealed** state. It appears in their Bestiary tab immediately.

If any monsters were already in the **Revealed** state when you first click **Go Live**, they're also discovered at that point, as a one-off batch.

## The hidden and unseen exceptions

Not every state triggers discovery:

- **Hidden**: the combatant is invisible to players entirely. Clicking the toggle once moves it to Unseen, still no discovery.
- **Unseen**: players see the name and a placeholder icon in the tracker (they heard footsteps, spotted a shadow), but haven't actually *seen* the creature. Clicking again moves it to Revealed and triggers discovery.
- **Revealed**: full reveal. Discovery fires at this transition.

In short: the players have to actually see the creature before it lands in their Bestiary.

## Reveal states

| State | Players see in the runner | Bestiary |
| --- | --- | --- |
| Hidden | Nothing: combatant not visible in the tracker | Not shared |
| Unseen | Name and icon only, no stats | Not shared |
| Revealed | Full entry, with portrait and stats if you've enabled them | Shared immediately |

## Cycling states

Click the reveal toggle on any monster combatant to step through the cycle:

Hidden → Unseen → Revealed → Hidden

This is the same reveal state, and the same cycling control, that shows up on roster NPCs run as combatants: see the Encounter Runner page for how that interacts with an NPC's own visibility settings.

## Deduplication

If a monster was already in a player's Bestiary from a previous encounter, it isn't duplicated: Grimoire checks whether it's already there before adding it again.

## What your players see

A newly discovered monster appears as a card in their **Bestiary** tab, with whatever level of detail its stat-visibility setting allows: see [Bestiary: Overview](#bestiary-overview) for the full stat-block toggle and per-player sharing this sits alongside.

## Tips

> Discovery only ever adds: cycling a combatant back to Hidden or Unseen mid-fight doesn't un-discover it. To fully hide a monster from a player after the fact, use the reveal control on the monster's own Bestiary page.

## Related

- [Bestiary: Overview](#bestiary-overview)
- [Encounter Runner](#encounter-runner)
- [Creating Custom Monsters](#creating-custom-monsters)
