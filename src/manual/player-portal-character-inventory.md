---
title: Character, Inventory & Spells
section: Player Portal
section_order: 15
order: 2
summary: What a player's own Character, Inventory, and Spellbook tabs show, and the Champions and Level-Up surfaces around them.
keywords: character sheet, inventory, paper doll, coin purse, containers, spells, prepared, known, level up, champions, wild shape, hide, custom attacks
---

The **Character** tab is a player's primary screen — their sheet, always visible, with **Inventory** and **Spellbook** as its two closest companions in the nav bar. This page covers everything a player manages about their own character: nothing here needs your intervention to work, but it's worth knowing what it looks like when a player asks you about it.

## Key ideas

| Term | Meaning |
| --- | --- |
| **Linked character** | The party member row currently active for a player's account. |
| **Champions** | All party member rows a player has ever created in this campaign — dead, retired, or alternates included. |
| **Custom Attack** | A player-defined attack button for anything not derived from equipment (a companion's bite, a save-based feature). |

## The Character sheet

Always visible at the top: portrait, name, class/subclass/level/species/background, an HP bar (colour-coded green → amber → red → grey at 0, with current/max/temp HP), AC, active condition badges, a tappable ability-score table with save-proficiency indicators, any custom trackers you've shared (Bardic Inspiration, Ki points…), and shapeshifter appearance controls if the character is one.

Below that, four tabs:

- **Skills** — every skill, tappable to roll with advantage/disadvantage auto-applied from conditions. **Long-press (touch) or right-click (desktop)** any roll button — skill, ability, save, or attack — to force Normal/Advantage/Disadvantage for that one roll; it combines with any condition-imposed mode (opposing sources cancel to normal, per 5e RAW).
- **Features** — class features, racial traits, and feats, with expandable descriptions.
- **Combat** — attack actions (to-hit + damage), the weapon list, and action/bonus action/reaction economy. Also has:
  - The **Hide** button — rolls Dexterity (Stealth) and marks the character **Hidden**; a live indicator flips to **Reveal**. Attacking auto-clears Hidden.
  - **Custom Attacks** — player-added attack buttons for anything equipment doesn't cover, added/edited/deleted inline.
- **Wild Shape** *(Druids only)* — usage pips, CR cap, a form picker limited to beasts the player has discovered (or you've pinned), and active-form HP/AC tracking while shapeshifted.

Two buttons sit above the tabs: **My Characters** (opens Champions, below) and **Export Sheet** (a printable version — see below).

## Champions ("My Characters")

Lists every party member row the player has created in this campaign — useful for "my wizard died, now I play a rogue" continuity. Each card shows portrait, name, species/class/subclass/level, and:

- **Set Active** — switches which character the player's session controls (only shown on a non-active character).
- **Edit** — opens the character editor.
- **Level Up** — only on the active character, once it's above level 0.
- **Clone** — duplicates the character as a fresh row.
- **Leave campaign** — detaches that character from the campaign entirely.
- **New Character** — starts the creation wizard for another character in this campaign.

## Character Sheet export

The **Export Sheet** button on the character page opens a printable character sheet — a separate render from your DM-side [Character Sheet Export](#character-sheet-export) tool, but producing the same kind of output for the player's own character.

## Level-Up Wizard

Reached from Champions or the character sheet. Guides the player through gaining a level: class feature gains (with descriptions, including any you've imported), an Ability Score Increase / Feat choice at the levels that grant one, spell-slot progression, an HP roll or average, and new cantrip/spell selections for casters. A **De-Level** panel lets a player undo a level for correction purposes.

**One gate to know about:** the wizard requires the campaign to have at least one enabled spell source for any class it's leveling up a caster into — if you've disabled every spell source under **Reliquary → Sources**, the wizard tells the player so instead of leaving a dead-end "Confirm" button, rather than quietly showing an empty spell picker.

## Inventory

A full equipment system:

- **Paper doll** — a silhouette (changes between dressed/undressed based on whether clothes are equipped) with slot buttons: Head, Neck, Shoulders, Body, Clothes, Gloves, Ring, Waist, Boots, plus weapon slots (main/off hand) and other equip slots beside it. Clicking a filled slot opens the item; an empty slot opens an assignment picker. An attunement pip indicator shows filled/empty of the character's attuned-item slots. Equipping a non-ruined shield adds its AC bonus everywhere automatically.
- **Coin purse** — editable PP/GP/EP/SP/CP with inline +/–, and a **Drop Coins to Chat** button that deducts the chosen amounts and posts a currency-drop message to Campaign Chat.
- **Carry weight** — an animated burden indicator (unencumbered → encumbered → heavily encumbered → over encumbered), weight vs. capacity (STR × 15 lbs, doubled for Powerful Build), and a capacity override field (absolute value, `*2`, or `+30`).
- **Containers** — a default Backpack and Belt, plus any inventory item promoted to a container (vault items tagged "container" auto-promote on add). Each container supports add, move (to another container, stash, or "stored"), quantity/split, drop-to-chat, sell (posts an offer to chat), and drag-to-reorder. Extradimensional containers contribute zero weight.
- **Stored Elsewhere** and **Party Stash** sections for untethered items.
- Clicking an item opens its detail panel: art, description, rarity, weight, an attunement toggle, charge tracking, identify/consume/sell, and — for a document item (one carrying its own written content) — a Written Contents section, the same one that appears in the Journal's tome tabs.

All inventory changes sync live — anything you change on your side appears on the player's device immediately.

## Spellbook

Tabs adapt to the character's caster type:

- **Prepared** — active prepared spells, with slot tracking and cast buttons.
- **Spellbook** or **Known** — full spell list (Wizards see a spellbook; Sorcerers/Bards see known spells against their known-count max).
- **Innate** — always present; racial/feat/item spells that aren't slot-based, with a way for the player to add their own.
- **All Spells** — a searchable, paginated browse tab (search, level, school, class filters) with prepared/known status shown inline.

Spell slots, attack bonus, and save DC are computed correctly per class for multiclass characters.

## Tips

> If a player reports an empty spell picker anywhere (Spellbook or Level-Up), the near-universal cause is a disabled spell source — check **Reliquary → Sources** for this campaign before assuming it's a data problem with their character.

- **Wild Shape forms are gated by discovery.** A player can't shape into a beast they (or you) haven't unlocked as a known form, even if it's in the Bestiary.
- **A shapeshifter's disguise only fools other players** — see it as your true self any time you're not in [Preview Mode](#previewing-as-a-player).

## Related

- [Player Portal — Overview](#player-portal-overview) — navigation and how the portal is organised.
- [Journal, Party & Live Play](#journal-party-live-play) — the rest of the portal's tabs.
- [Character Sheet Export](#character-sheet-export) — your DM-side printable export tool.
