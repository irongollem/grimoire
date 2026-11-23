---
title: "Pantheon: Gods & Deities"
section: World Building
section_order: 2
order: 3
summary: Catalogue the gods of your world, their domains, symbols and lore, grouped into pantheons and shared with the party as clerics need them.
keywords: pantheon, deity, deities, god, gods, goddess, domain, cleric, symbol, holy symbol, alignment, worship, worshippers, religion, divine, portfolio, epithet, titles, connections, patron deity, populate
---

Pantheons and deities are Grimoire's two thin, sibling world-building modules for divine lore: the gods your clerics pray to, the domains they grant, and the pantheons that group them. Find them under **Campaign → Pantheon** in the sidebar, which opens the **deity** list (`/deities`); the pantheon list sits one click away at its own **Pantheons** button. A deity opens as a read-only sheet: press **Edit** to change it and **View** to go back. Its **DM notes** and its **Connections** sit below the lore.

## Key ideas

| Term | Meaning |
| --- | --- |
| Deity | A single god or divine being: name, titles, alignment, domains, holy symbol and lore. |
| Pantheon | A named group of deities (Faerûnian, Olympian, or your own homebrew), purely organisational. |
| Domain | One of the standard cleric domains a deity grants; shown as chips and filterable. |
| Reveal | Independent per deity and per pantheon: sharing a pantheon doesn't automatically share the deities inside it, or the other way around. |

## Creating a pantheon

1. From either page, click **New Pantheon**.
2. Upload an **Emblem** (square image).
3. Set who it's **Visible to Players**.
4. Add **Tags**.
5. Fill in **Name** and a **Description & History** (rich text: origins, major deities, holy wars, schisms).

## Creating a deity

1. Click **New Deity** on the deity list.
2. Upload a **Divine Form** portrait and, separately, a **Holy Symbol** image.
3. Pick a **Pantheon** (optional) and an **Alignment**.
4. Add a **Symbol Description** (prose, for when you don't have symbol art).
5. Set who it's **Visible to Players**, and add **Tags**.
6. On the right: **Name**, **Titles & Epithets** (e.g. "The Morninglord, Lord of Dawn"), any **Alternate Names** the deity is known by in different cultures, the **Cleric Domains** it grants (click to toggle any number of the standard domains), a **Portfolio** line (what it governs: war, harvest, death…), **Lore & Description** (rich text, player-facing once revealed). Press **Create Deity** to save a new one, or **Save Changes** on an existing one. Hidden truths and true motivations go in the deity's **DM notes** box on its page, not in this form: it is private, saved as you type, and never shared, even when the deity itself is revealed. See [DM Notes and the Scratchpad](#dm-notes-and-the-scratchpad).

## Generating with AI

If AI is switched on for your campaign, the deity list has a **Generate** button next to **New Deity**. Describe the god in a sentence or two (a weary goddess of crossroads, say), and Grimoire writes a complete deity: name, titles, alternate names, alignment, one to three cleric domains, portfolio, a holy symbol description, lore for your players, and secrets with ideas for bringing the god into play, which land in the deity's DM notes box.

You can steer it before you generate:

- **Pantheon**: pick one and the new god is written to fit it. Grimoire tells the model the names and portfolios of the deities already in that pantheon, so it does not duplicate them. Leave it on **Any** for a free-standing deity.
- **Alignment** and **Primary domain**: pin either one, or leave them on **Any**.
- **Generate a portrait**: also paints the divine form and adds it to your Gallery.

It grounds in your campaign setting and your ruleset, so a 2024 campaign draws its domains from the 2024 cleric list. Generating costs credits, shown on the button, and the new deity opens ready to edit.

Any deity you already have can get a portrait too: open it and use **Generate with AI** under **Divine Form**. It paints from the name, titles, alignment, domains, portfolio and symbol on the form, including edits you have not saved yet.

## Browsing and filtering

The deity grid filters by free-text search (name, titles, portfolio, alternate names, tags), **Domain**, and **Pantheon**: all three live in the same session-persisted filter state as every other list in the app, with a **Clear** button once any is active.

## Revealing deities to players

Each deity and pantheon has its own reveal control (the grid card's overlay icon on deities, the row's inline icon on pantheons): pick specific party members or share with everyone. **Reveal All** on the deity list shares every deity in the campaign with the whole party in one click, since a pantheon is usually common knowledge rather than something worth revealing name by name.

## Who worships, serves or opposes a deity

The **Connections** section on a deity's sheet lists everything tied to the god: factions that worship, serve or oppose them, the places that are their holy sites, items that are their relics, and the people and characters whose patron they are. Press **Add connection**, search for the faction (or anything else), and choose the kind of tie, for example Worships. A faction's own page shows the same tie from its side, so you only enter it once. **In the web** opens the [World Web](#world-web) focused on the deity. See [Factions](#factions).

## Populate from Setting

**Populate Setting** at the top of the deity list seeds pantheons and deities appropriate to your campaign's calendar (Faerûn alone seeds around a dozen pantheons and over a hundred deities). The import is idempotent (re-running repairs a campaign rather than duplicating anything) and content it seeds this way doesn't count against your plan's quota.

## What your players see

There's no dedicated player-facing pantheon page today: a deity becomes visible to the party only through whatever else reveals it (its own reveal control, and Reveal All). A revealed deity's name and alternate names also surface as autosuggestions in the **Deity** field of a player's own character-creation background step.

## Tips

> A deity's DM notes never leave your screen, whether or not the deity itself is shared: use it freely for anything you don't want a cleric's player reading ahead of time.

- Free plans cap how many deities and pantheons you can create by hand: see [Billing & Subscription](#billing-subscription). Content **Populate Setting** brings in doesn't count against either cap, so it's safe to run in full even on Free.
- Domains are a flat toggle list, not a combobox: click as many as the deity actually grants.

## Related

- [Factions](#factions)
- [Atlas: Locations](#atlas-locations)
- [Calendar System](#calendar-system)
- [Billing & Subscription](#billing-subscription)
