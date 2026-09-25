---
title: Encounter Runner
section: Encounters & Bestiary
section_order: 5
order: 4
summary: Run live combat with initiative tracking, HP management, conditions, AI complications, and player sync.
keywords: encounter, runner, combat, initiative, hp, conditions, turn, round, live, sync, player, wildshape, complication, reinforcements, ai, hazard, lair, legendary, ammo, thrown
---

The Encounter Runner is the full-screen live combat tracker: initiative order, HP, conditions, rollable stat blocks, and real-time sync to your players' own screens, all in one place. Open it from an encounter's page by clicking **Run Encounter** (or, once combat has already started, the top bar shows **Restart**/**Stop**/**Resume** instead) (`/encounters/:id/run`).

## Key ideas

| Term | Meaning |
| --- | --- |
| **Round / turn** | Standard 5e structure: the initiative order repeats each round; `Next Turn` advances one combatant at a time. |
| **Reveal state** | Hidden / Unseen / Revealed: what a monster combatant shows a player, and whether it's added to their Bestiary (see [Monster Discovery](#monster-discovery)). |
| **Going Live** | Starts syncing this fight to players' own devices in real time. |
| **Faction** | A combatant's team, set in the builder: decides the coloured stripe on its row. |

## Starting combat

1. **Roll Initiative** rolls d20 + initiative modifier for every combatant that doesn't already have a value, and sorts the list: a value a player already rolled, or one you typed by hand, is never overwritten. You can also click the die button next to any single row to re-roll just that one.
2. Before combat starts, mark any surprised creatures with the **✦?** toggle on their row.
3. Click **Start Combat** to lock the order and begin Round 1. This button only appears once you're live and still at Round 0: see Going Live below.

## Initiative list

Each row is one combatant; the active combatant gets a highlighted row and gold ring on its portrait, and a coloured left stripe shows its faction.

**Per-row controls:**

- **INIT**: editable directly.
- **Reveal toggle** (monsters only): cycles Hidden → Unseen → Revealed; see [Monster Discovery](#monster-discovery) for what each state shows players and when it shares the creature to their Bestiary.
- **HP**: click to edit inline, or expand the row's quick panel for **Dmg**, **Heal**, and **+Temp** buttons with an amount field.
- **AC**: read-only (shows the beast's AC while a player is wildshaped).
- **Conditions**: click a condition chip to remove it; the **+** button opens a picker to add one. Exhaustion shows as a pip-level control; **Concentration** appears as an indigo "✦" chip and clears automatically when a concentration-breaking condition lands; a **⚡** chip tracks the creature's reaction and resets every round.
- **Surprised**: a toggleable chip, available before combat and during Round 1 only; it clears itself automatically at the end of that creature's first turn.

## Turn management

- **Next Turn ›** advances to the next combatant, automatically skipping dead monsters (players are never skipped). The round counter increments when the order wraps back to the top.
- **‹** (Previous Turn) steps backward.
- At the start of each combatant's turn, its reaction is restored and, if it has legendary actions, its pool refills.

## HP and temp HP rules

- Damage hits temp HP first; anything left over carries through to real HP.
- Temp HP doesn't stack: a new source only replaces the pool if it's larger.
- When a player character's real HP hits 0, death-save pips appear on their row (three success / three failure, clickable).

## Wildshape (Druid/Ranger)

1. On a player's expanded row, click **🐺 Choose Form** and pick a beast.
2. The avatar switches to the beast's portrait; HP, max HP, and AC track the beast's values independently of the character's own.
3. Damage lands on beast HP first; once it hits 0, the extra overflows to the character's real HP (5e RAW).
4. Click **Revert** to return to the character's own form, or **Change** to swap forms mid-fight.

## Attacking

A player's row exposes their actual weapons and features as roll buttons: melee, ranged, and thrown attacks, plus any custom attacks they've defined. Ranged attacks consume ammunition from the character's own inventory; thrown weapons (javelin, dagger, handaxe, and the rest) leave the character's hand and drop to the ground as a recoverable item once thrown. Both only consume anything once the attack roll actually resolves: cancelling a manual dice entry spends nothing.

## Spawning mid-combat

The spawn panel at the bottom of the combatant list adds monsters or NPCs during the fight. Pick the **Monster** or **NPC** tab, search for the creature, set a faction and count, and click **+ Add**. If combat has already started, Grimoire rolls initiative for the new arrival automatically, and primes a legendary action pool if it has one.

## Events sidebar

If the encounter has scripted events, they're listed with a **Fired**/**Pending** badge. Manual and repeatable events always show a fire button (▶): click it to trigger the event. Auto-triggered events fire on their own as combat state changes; the sidebar shows when they went off.

## AI complications and reinforcements

Two buttons, **Complication** and **Reinforce**, sit in the Events panel header, for the two things that go wrong mid-fight:

- **Complication**: the fight has gone flat and needs a turn, not more hit points: a collapsing exit, a hostage, a rival faction arriving with its own agenda.
- **Reinforce**: the fight is ending too fast, and you want to put some pressure back.

Both draw on your own material: your bestiary, your NPCs, your factions and locations, plus what's actually happening in the fight right now (the round, who's still standing, how hurt they are).

**Nothing happens until you say so.** You get a preview first (read-aloud text, every creature that would arrive and which side it joins, and any hazard), then:

- **Add to Events** puts it in your events list, unfired. It waits for the ▶ button like any hand-authored manual event.
- **Regenerate** tries again. **Discard** throws it away.

A generated event is always manual-trigger and fire-once: it can never go off on its own at the start of a round.

A few honest limits:

- Creature names Grimoire can't match to your bestiary are shown struck through and left out entirely: nothing half-real ends up on your tracker.
- Counts are capped; if the AI asks for twenty guards you'll get fewer, and the preview says so.
- A hazard is described, not applied: it posts to chat and joins an **⚠ IN PLAY** list under the events, but which creatures it actually restrains is your call with the condition picker.
- **Show to players when fired** is checked by default and controls whether the text reaches the player view as a narrative beat.
- Building the proposal means reading your bestiary and cast, so it needs platform credits or a cloud API key: it's unavailable if your campaign's AI key is set to **Store keys locally on this device only** (**Campaign Settings → AI Assistant**).

## Boss mechanics panel

- **Lair Actions**: once enabled on the encounter, a violet-highlighted card shows the owner's lair actions once per round at initiative 20. Clicking one marks it fired (for tracking only, you narrate the effect) and posts to chat.
- **Legendary Actions**: for each legendary creature not currently taking its turn, its action pool is shown with costs parsed from the action names (e.g. "Costs 2 Actions"); buttons disable once the pool is spent, and the pool resets at that creature's own turn.

## Stat block detail panel

Click any combatant to open its stat block on the right (drag the left edge to resize). What's shown depends on the type: full stat block with attack/damage roll buttons for monsters and NPCs with one; ability scores, saves, skills, and attacks for players; type, stats and traits for companions.

- **Roll mode**: a three-way toggle (**DIS** / Normal / **ADV**) applies to every roll button in the panel.
- **Chat mode**: a two-way toggle between **📢 Public** and **🔇 Silent**, controlling whether rolls post to the campaign chat.

## Optional combat rules

Two rules live in **Campaign Settings → Rules** alongside the rest of the optional-rule registry, both off by default:

- **Turn Timer**: set **Seconds per turn** and a countdown shows in the runner and on every player's encounter panel, resetting at the start of each turn. It's a soft nudge: it flashes when time runs out but never force-ends a turn or takes an action for you.
- **Random Initiative Each Round**: re-rolls and re-sorts every combatant's initiative automatically at the start of each new round, with no prompts even in physical-dice mode.

## Going Live (player sync)

Once a campaign is active, click **Go Live**. Players subscribed to the campaign see, in real time:

- The combatant list, filtered to what you've revealed.
- The current round and active combatant, with a pulsing "YOUR TURN!" banner on theirs.
- HP shown according to your campaign's health-visibility setting.

HP syncs both ways: your changes in the runner reach the party's character sheets within moments, and a player editing their own HP on their character sheet flows back into the runner just as fast.

## Ending combat

- **End Combat**: syncs every player's HP, conditions, death saves and curses back to their record, then returns you to the encounter sheet. Companion HP and conditions are written back the same way.
- **Abandon**: ends the live session without writing any of that back. Use it for a test combat or a false start.

Either way, if the fight had a room-anchored battle map open, ending combat may ask whether to mark the rooms the party actually uncovered as explored: see [Encounter Map](#encounter-map-battle-map-fog-of-war).

## What your players see

Players who are subscribed to the campaign see a live encounter panel in their own portal (a full page on mobile, part of the sidebar on tablet and up): the round, active combatant, and a "your turn" alert; the same reveal-gated combatant list you control from the runner; HP shown per your campaign's health-visibility setting; and any event you marked **Show to players**. Hidden combatants never appear to them at all; Unseen ones show only as a "???" placeholder.

## Tips

> The battle map link in the top bar is disabled with an explanation until the encounter's location has a usable map: see [Encounter Map](#encounter-map-battle-map-fog-of-war) for exactly what that requires.

- Rolls the runner makes for you (initiative, attacks, complications) are never posted individually to chat when they'd leak a hidden combatant's presence: the order and outcome reach players through the live state instead.
- A companion benched from the party tracker or the player's own portal drops out of the roster automatically while the fight is still in its lobby; once combat starts, the roster locks.

## Related

- [Encounter Builder](#encounter-builder)
- [Monster Discovery](#monster-discovery)
- [Encounter Map: Battle Map & Fog of War](#encounter-map-battle-map-fog-of-war)
- [Party Tracker](#party-tracker)
