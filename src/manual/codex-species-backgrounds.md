---
title: Species and Backgrounds
section: Characters
section_order: 11
order: 2
summary: Add custom species (with subraces, spells, and shapeshifter disguise) and backgrounds, including 2024 PHB ability scores and origin feats.
keywords: species, race, subrace, variant, background, proficiency, trait, shapeshifter, disguise, ability score increase, origin feat, tool proficiency
---

## Species

The **Species** tab (**Character Codex → Species**) stores all playable races for your campaign. Core species (Dwarf, Elf, Halfling, and the rest) come from a shared library maintained by Grimoire; add homebrew species yourself.

### Creating a species

Click **New Species**. Fields, left to right:

- **Name**: the large text field at the top.
- **Portrait**: with focal-point control.
- **Tags**: freeform, for filtering.
- **Shapeshifter**: check this to let characters of this species use the disguise system (see below).
- **Scope**: this campaign, or general/all campaigns.
- **Size**: Tiny, Small, Medium, or Large.
- **Source**: attribution (e.g. "PHB 2024", "Homebrew").
- **Avg. Height** / **Avg. Weight**: free text (e.g. "5 ft 9 in (175 cm)").
- **Natural Armor AC**: a fixed AC for species with an innate armor trait (Tortle, Lizardfolk); leave blank otherwise.
- **Speed**: walk / fly / swim / climb / burrow, each in feet.
- **Ability Score Increases**: free text (e.g. "+2 STR, +1 to any ability score of your choice").
- **Languages**: tag list.
- **Description**: rich text.
- **Traits**: a list of named racial traits, each with a rich-text description. These appear on the player's **Features** tab.
- **Subraces / Lineages**: sub-options (e.g. High Elf, Wood Elf for "Elf"), each with its own name, ability bonus text, description, and traits.
- **Spell Grants**: spells a character of this species knows automatically. Either pick a specific spell (optionally scoped to one subrace), or check **Player chooses spell** for a free pick (e.g. a High Elf's bonus cantrip). Each grant can be limited to a minimum character level and a uses-per-day allowance that resets on a short or long rest, leave uses per day blank for an at-will spell.
- **DM Notes**: private rich text, never shown to players.

### Importing species

Click **Import from Open5e** in the toolbar. Pick a source and import. The importer deduplicates by identity: existing entries are updated, new ones inserted, and your own art and edits on existing species are preserved.

### The Shapeshifter flag

When a species has **Shapeshifter** checked:

- Characters of that species get a "Disguise" section on their character form (Identity tab) to set an "Appears as" species and variant.
- On the Player Portal, the player has an appearance toggle to switch between true form and disguise.
- Every other player sees whichever form is currently active: two players at the same table can see genuinely different species for the same character, depending on what each one knows.

## Backgrounds

The **Backgrounds** tab (**Character Codex → Backgrounds**) stores starting packages of proficiencies, equipment, and features.

### Creating a background

Click **New Background**. Fields:

- **Name** and **Portrait**.
- **Skill proficiencies**: tag list.
- **Tool proficiencies**: searchable picker over the standard tool list.
- **Languages**: searchable picker.
- **Tags**: freeform.
- **Description**: rich text, the narrative hook.
- **Starting equipment**: rich text, items plus any starting coin.
- **Background feature**: a name and a rich-text description of the signature feature (e.g. "Shelter of the Faithful").
- **Feat grant** *(2024 PHB, optional)*: a feat name and a summary of what it grants. Grimoire tries to match the name against an imported feat (via **Sync from Open5e** on the Abilities tab) so a character taking this background can resolve the full text automatically; an unresolved name still saves, it just won't link to a feature entry yet.
- **Ability score trio** *(2024 PHB, optional)*: click exactly three of the six abilities. This is the set a 2024-ruleset character can spend their background ASI on; leave it empty for a background that grants no 2024 ASI. Picking one or two and leaving it there is an invalid half-state: pick a third or clear back to zero.
- **Suggested characteristics**: rich text: personality traits, ideals, bonds, and flaws to inspire players.

### Importing backgrounds

Click **Import from Open5e**. A source picker (multi-select) lets you choose which sourcebooks to pull in: leave everything unchecked to import from all of them. Import is incremental and reports how many entries were inserted vs. updated; your own edits to existing backgrounds are never overwritten by a re-sync.

## What your players see

During character creation, a player's species and background choices apply their traits, spell grants, and (for a 2024-ruleset background with an ability trio set) an ASI pick directly to the new character: the picker shows only species and backgrounds visible in the active campaign (per your per-campaign content gate, Campaign Settings). Species traits and the background feature both surface on the character sheet **Features** tab. In the player's own Reliquary → Codex tab, species and backgrounds are also browsable read-only, with the same traits, ability bonuses, and feature text.

## Tips

- A background's 2024 ability trio and origin feat only apply for campaigns on the 2024 ruleset: 2014-ruleset backgrounds simply leave those fields empty.
- Disabling a species for a campaign (**Campaign Settings → Species**) hides it from new-character pickers without touching any character who already has it.

## Related

- [Character Codex: Overview](#character-codex-overview)
- [Creating Custom Classes](#creating-custom-classes)
- [Abilities Compendium](#abilities-compendium)
