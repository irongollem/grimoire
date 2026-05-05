---
title: Species and Backgrounds
section: Character Codex
section_order: 9
order: 2
summary: Add custom species (with subraces) and backgrounds for character creation.
keywords: species, race, subrace, variant, background, proficiency, trait, shapeshifter, disguise
---

## Species

The **Species** tab stores all playable races for your campaign. SRD species (Dwarf, Elf, Halfling, etc.) are imported from Open5e. Add homebrew species manually.

### Creating a species

Click **New Species**. Fill in:

- **Name** — required.
- **Size** — Tiny, Small, Medium, or Large.
- **Source** — attribution (leave blank for fully homebrew).
- **Shapeshifter** — enable this flag to allow characters of this species to use the **Alter Ego** (disguise) system. Characters can then set a "Appears As" species and species variant, and toggle their appearance mid-session.
- **Traits** — a list of named traits, each with a rich text description. These appear in the player's **Features** tab.
- **Subraces / Variants** — a list of sub-options (e.g. High Elf, Wood Elf, Dark Elf for "Elf"). Each subrace has a name and can carry its own traits.

### Importing species

Click **Import from Open5e** in the toolbar. Select a source (SRD, and any installed third-party source packs) and click Import. The importer deduplicates by slug — existing entries are updated, new ones inserted. Your custom art and descriptions on existing species are preserved.

### The Shapeshifter flag

When a species has the Shapeshifter flag:

- Characters of that species can set a **disguise species and variant** on their character sheet.
- On the player portal, they have an appearance toggle — switch between their true form and their disguise.
- Other players see whichever form is currently active for that character. This means two players at the same table can see different things — one sees a tiefling, another sees the human disguise, depending on what each player knows.

## Backgrounds

The **Backgrounds** tab stores character backgrounds — starting packages of proficiencies, equipment, and features.

### Creating a background

Click **New Background**. Fill in:

- **Name** — required.
- **Source** — attribution.
- **Feature Name** — the background's signature feature (e.g. "False Identity").
- **Feature Description** — rich text explaining what the feature does.
- **Skill Proficiencies** — which skills this background grants.
- **Tool Proficiencies** — which tools.
- **Languages** — number of bonus languages and/or specific languages.
- **Starting Equipment** — freeform text or a list of starting gear.
- **Personality Traits** — a list of trait options players can pick from.
- **Ideals** — ideal options with alignment suggestions.
- **Bonds** — bond options.
- **Flaws** — flaw options.

### Importing backgrounds

Click **Import from Open5e**. Select sources and import. Backgrounds are upsert-safe — existing entries are updated without overwriting your customisations.
