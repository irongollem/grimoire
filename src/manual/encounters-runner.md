---
title: Encounter Runner
section: Encounters
section_order: 7
order: 1
summary: Run live combat with initiative tracking, HP management, conditions, AI complications, and player sync.
keywords: encounter, runner, combat, initiative, hp, conditions, turn, round, live, sync, player, wildshape, complication, reinforcements, AI, hazard
---

The Encounter Runner (`/encounters/:id/run`) is the full-screen combat tracker. Open it from the encounter detail view by clicking **Run**.

## Starting combat

1. **Roll Initiative** — the runner rolls d20 + initiative modifier for each combatant and sorts the list. You can manually edit any initiative value by clicking it.
2. **Set Surprise** — before combat starts, the Boss Mechanics panel has a Surprise section. Toggle which creatures are surprised.
3. **Start Combat** — locks the initiative order and begins round 1, turn 1.

## Initiative list

Each row in the list represents one combatant. The active combatant has a gold border.

**Per-row controls:**

- **INIT** — editable; type a new value and press Enter.
- **Reveal toggle** (monsters only) — cycles Hidden → Unseen → Revealed. Hidden: players can't see the creature at all. Unseen: appears as "???" with a placeholder. Revealed: players see name and portrait.
- **HP** — click to edit inline. Use the **Quick HP panel** (click the row to expand) for Damage / Heal / +Temp buttons with an amount input.
- **AC** — read-only.
- **Conditions** — click a condition chip to remove it; the **+** button opens a dropdown to add. Exhaustion shows as pip levels 1–6. Concentration appears as an indigo chip and is auto-cleared when a concentration-breaking condition is applied. The **Reaction ⚡** chip resets each round.

**Surprised badge** — appears before and during round 1; auto-clears at the end of each creature's first turn.

## Turn management

- **Next Turn** button advances to the next combatant (dead monsters are skipped automatically).
- **Previous Turn** goes backward.
- When the turn wraps back to position 0, the round counter increments.
- At the start of a combatant's turn, its **legendary action pool** refills and its reaction is restored.

## HP and temp HP rules

- **Damage** is applied to temp HP first; overflow hits real HP.
- **Temp HP doesn't stack** — entering a higher value replaces the existing value.
- When real HP hits 0, the **death save pips** appear for player characters (three success / three failure pip dots, clickable).

## Wildshape (Druid/Ranger)

For player characters in wildshape:

1. Click **Wildshape** on the character's expanded row and pick a beast from the bestiary.
2. The avatar changes to the beast's portrait; HP, max HP, and AC track the beast's values independently.
3. Damage goes to beast HP first; when beast HP hits 0, overflow carries to the character's real HP (PHB RAW).
4. Click **Revert** to return to humanoid form.

## Spawning mid-combat

The **Spawn Panel** at the bottom of the combatant list lets you add monsters or NPCs during combat. Set count and faction, click **Add**. If combat has started, Grimoire auto-rolls initiative for the new combatant.

## Events sidebar

If you pre-scripted events in the builder, a sidebar lists them with pending/fired status. Manual events show a ▶ button — click to fire them. Auto-triggered events fire without action from you; the sidebar shows when they fired.

## AI complications and reinforcements

Two buttons sit in the Events sidebar header, for the two things that go wrong mid-fight:

- **Complication** — the fight has gone flat and needs a turn, not more hit points. You get something that changes your decisions: a collapsing exit, a hostage, a rival faction arriving with its own agenda.
- **Reinforce** — the fight is ending too fast. You get creatures to put back some pressure.

Both draw on your own material: your bestiary, your NPCs, your factions and locations, plus whatever's actually happening in the fight right now — the round number, who's still standing and how hurt they are. A complication can name the smuggler your party robbed last session, because Grimoire knows they exist.

**Nothing happens until you say so.** You get a preview first, showing exactly what would land: the read-aloud text, every creature that would arrive and which side it joins, and any hazard. Then:

- **Add to Events** puts it in your events list — _unfired_. It waits for the ▶ button like any other manual event, so you pick the moment.
- **Regenerate** gives you a different one. **Discard** throws it away.

Nothing is ever added automatically, and a generated event can never fire on its own at the start of a round.

A few honest limits worth knowing:

- Creature names Grimoire can't find in your bestiary or cast are shown struck through and **left out** — no half-real creature ends up on your tracker. Add it to your bestiary (or enable the source it comes from) and regenerate.
- Numbers are capped. If the AI asks for twenty guards you'll get eight, and the preview tells you it happened.
- Hazards are described, not applied. A "collapsing floor" appears in an **⚠ IN PLAY** list under your events and posts to chat when fired — but which creatures it actually restrains is your call, made with the condition picker. Grimoire won't start changing your combatants' state for you.
- The **Show to players when fired** checkbox controls whether the text reaches the player view as a narrative beat. It's on by default.
- This needs the server, so it isn't available in local-key mode.

## Boss mechanics panel

**Lair Actions** — a panel appears when lair actions are enabled. It highlights at initiative 20 each round, listing the owner's lair actions from the stat block. Click an action to mark it fired (for tracking only — you narrate the effect). Firing posts a message to the campaign chat.

**Legendary Actions** — for each legendary creature not currently taking its turn, the panel shows its action pool. Costs are parsed from the action names. Buttons disable when the pool is exhausted; the pool resets at the creature's turn start.

## DM stat block panel

Click any combatant to open the **Stat Block Panel** on the right. For monsters: full stat block with roll buttons for attacks and damage. For players: ability scores, saves, skills, and attacks. Panel width is resizable by dragging.

**Roll mode** — Normal / Advantage / Disadvantage — applies to all roll buttons.
**Chat mode** — Public / Private / Off — controls whether rolls post to the campaign chat.

## Going Live (player sync)

Click **Go Live** to start syncing combat state to players in real time. Players see:

- The combatant list (filtered to what you've revealed).
- The current round and active combatant.
- "YOUR TURN!" notification when it's their turn.
- HP bars using your campaign's health-visibility setting.

HP changes are bidirectional: edits from players' character sheets sync back into the runner within 400ms.

## Ending combat

**End Combat** — syncs all player HP, conditions, death saves, and curses back to the party_members table, then navigates to the encounter sheet.

**Abandon** — ends live sync without writing any HP/condition changes. Use this for test combats.
