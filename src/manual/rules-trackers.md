---
title: Custom Rule Trackers
section: Custom Rules
section_order: 10
order: 1
summary: Attach a mechanical tracker to any house rule so it appears on the player character sheet.
keywords: tracker, custom rule, level, points, pool, dc, saving throw, speed penalty, character sheet, player
---

A **Tracker** is an optional mechanical bolt-on for any custom rule. When you attach a tracker, it appears on each player's character sheet automatically — players interact with it directly, and the values are stored per-character.

## When to use a tracker

Use trackers for homebrew mechanics that require persistent tracking:

- **Corruption** — a 0–10 points pool that grows when characters use dark magic.
- **Exhaustion variant** — a named-level system with mechanical consequences at each tier.
- **Honour** — a named-level social standing mechanic.
- **Essence** — a numeric pool that fuels a homebrew class or faction ability.
- **Madness** — escalating tiers with different gameplay effects.

## Tracker types

### Points

A numeric value within a min–max range. Examples: Corruption 0–100, Favour 0–20, Wounds 0–6.

Configuration:

- **Min Value** — the lowest the tracker can go (usually 0).
- **Max Value** — the highest it can reach.
- **DM Buttons** — named buttons with a delta value. Each button appears on the character sheet as a one-click adjustment. Examples: "+1 Corruption", "−2 Favour", "Rest (−3)".

### Level

A set of named states — the character is always in exactly one level. Examples: Sanity (Composed → Unsettled → Disturbed → Broken → Shattered) or Reputation (Unknown → Known → Respected → Renowned → Legendary).

Configuration:

- **Levels** — an ordered list. Each level has:
  - **Value** — a numeric or short code identifier.
  - **Name** — the display name (e.g. "Broken").
  - **Colour Badge** — the colour shown on the character sheet badge.
  - **Mechanical Effects** (any combination):
    - **Note** — a label displayed on the sheet to remind players of the effect.
    - **Speed Penalty** — reduces movement speed by a fixed number of feet.
    - **Disadvantage on Ability Checks** — optionally scoped to specific abilities (STR/DEX/CON/INT/WIS/CHA) or all.
    - **Disadvantage on Saving Throws** — optionally scoped.
    - **Exhaustion Level** — links this tracker level to a D&D exhaustion level (1–6), applying all standard exhaustion effects.
    - **Saving Throw** — attaches an automatic saving throw prompt: choose the ability, base DC, and whether the tracker's current level modifies the DC.
- **DM Buttons** — as with Points, named buttons that adjust the current level. Example: "+1 Madness Tier", "Short Rest (−1 if Unsettled)".

## How trackers appear to players

Once you save a rule with a tracker, a **Tracker widget** appears on every player's character sheet (the main `/play` view). The widget shows:

- For Points: a numeric display with +/− buttons and the DM-defined named buttons.
- For Level: a badge showing the current level name in its colour, with DM-defined buttons to move between levels.

Players can interact with the widget directly — they can use the DM buttons or manually increment/decrement the value. DMs see the same values when viewing party members.

## Mechanical effects in play

Effects defined on levels are applied automatically to the character's sheet:

- **Speed Penalty** — reduces the displayed speed value.
- **Disadvantage** — flagged on the character sheet; the runner roll buttons apply it automatically.
- **Exhaustion Level** — the exhaustion pip on the party tracker and runner updates.
- **Saving Throw** — when a trigger event occurs (DM's call), the player can use the prompted saving throw from the character sheet.

## Combining trackers with rule text

A well-designed custom rule page pairs the tracker with descriptive rule text explaining what each level means, what causes the tracker to change, and what players should do about it. The rule body (rich text) is the narrative; the tracker is the mechanical implementation.

Example rule: "**Corruption** — Using necromancy outside a sanctioned ritual adds 1 Corruption point. At 5+ Corruption, the character is visibly marked. At 10, they undergo a dark transformation (see the Corruption table)." The tracker makes this mechanical: DM adds +1 Corruption via the button, the character sheet shows the current level, and effects kick in automatically.
