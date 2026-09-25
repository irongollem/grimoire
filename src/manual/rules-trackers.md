---
title: Custom Rule Trackers
section: Reliquary
section_order: 12
order: 2
summary: Attach a mechanical tracker to any house rule so it appears on the player character sheet.
keywords: tracker, custom rule, level, points, pool, dc, saving throw, speed penalty, character sheet, player
---

A **Tracker** is an optional mechanical bolt-on for any custom rule, added from the **Tracker** section at the bottom of the rule editor (**Reliquary → Custom Rules**, open or create a rule). Click **Add Tracker** to attach one, or **Remove** to drop it. When you attach a tracker, it appears on each player's character sheet automatically: players interact with it directly, and the values are stored per-character.

## When to use a tracker

Use trackers for homebrew mechanics that require persistent tracking:

- **Corruption**: a 0–10 points pool that grows when characters use dark magic.
- **Exhaustion variant**: a named-level system with mechanical consequences at each tier.
- **Honour**: a named-level social standing mechanic.
- **Essence**: a numeric pool that fuels a homebrew class or faction ability.
- **Madness**: escalating tiers with different gameplay effects.

## Building a tracker

- **Track Label**: the name shown everywhere the tracker appears (e.g. "Corruption", "Sanity").
- **Type**: **Level** (named states) or **Points** (a numeric pool).
- **Min Value** / **Max Value**: the range the tracker's value is clamped to.

### Points

A numeric value within the min–max range. Examples: Corruption 0–100, Favour 0–20, Wounds 0–6. No further configuration beyond the range and its buttons (below).

### Level

A set of named states: the character is always in exactly one level, determined by where the current value falls. Examples: Sanity (Composed → Unsettled → Disturbed → Broken → Shattered) or Reputation (Unknown → Known → Respected → Renowned → Legendary).

Click **Add Level** for each state. Every level has:

- **Value**: a number, or an ability code (STR/DEX/CON/INT/WIS/CHA) if you want the threshold to scale with the character's modifier in that ability.
- **Level name**.
- **Colour**: the badge colour shown on the character sheet, or "no color".
- **Effects** (click **+ add effect**, any combination): **Note** (a reminder label), **Speed penalty** (a number), **Disadv. ability checks** / **Disadv. saving throws** (optionally scoped to specific abilities, blank = all), **Exhaustion level** (1–6), or **Saving throw** (an ability, a base DC, and an optional "+VAL" to add the tracker's current value to the DC).

## Tracker Buttons

Click **Add Button** to give the tracker one-click adjustments. Each button has:

- **Label**: the button text (e.g. "Add Corruption", "Cleanse").
- **Mode**: **Δ** (change the current value by an amount) or **=** (snap to an exact value).
- A value field matching the chosen mode.
- **Players**: check this to also show the button in the player's own portal; leave it unchecked to keep the button DM-only.

## How trackers appear to players

Once you save a rule with a tracker, a **Tracks** widget appears on every player's character sheet. It shows the tracker's label, the current level badge (Level type) or a numeric bar (Points type), and any active level effects as small reminder text underneath. Any button you marked **Players** appears there too, so the player can apply it themselves; buttons you left DM-only don't. DMs see the same tracker and its full button set from the party panel.

## What tracker effects do (and don't do)

A level's effects (Speed Penalty, Disadvantage, Exhaustion Level, Saving Throw) are shown as **reminder text** on the tracker widget: for example "Speed −10" or "Sneak Attack save DC 13". They are not wired into the game engine: they do not change the displayed Speed stat, do not add disadvantage to the runner's roll buttons, do not move the character's actual Exhaustion condition, and do not pop up a saving throw prompt. Applying them at the table (reducing Speed, rolling with disadvantage, calling for the save) is on the DM and player to do by hand, the same way you'd apply a house rule from a written table. The tracker's job is to make sure everyone at the table can see, at a glance, which effects are currently active.

## Combining trackers with rule text

A well-designed custom rule page pairs the tracker with descriptive rule text explaining what each level means, what causes the tracker to change, and what players should do about it. The rule body (rich text) is the narrative; the tracker is the mechanical implementation.

Example rule: "**Corruption**: Using necromancy outside a sanctioned ritual adds 1 Corruption point. At 5+ Corruption, the character is visibly marked. At 10, they undergo a dark transformation (see the Corruption table)." The tracker makes this trackable: the DM adds +1 Corruption via the button, the character sheet shows the current level and its reminder text, and the table applies the described effects from there.

## Related

- [Reliquary: Overview](#reliquary-overview)
- [Custom Rules (House Rules)](#custom-rules-house-rules)
