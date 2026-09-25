---
title: "Pantheon: Gods & Deities"
section: World Building
section_order: 2
order: 3
summary: Catalogue the gods of your world, their domains, symbols and lore, grouped into pantheons and shared with the party as clerics need them.
keywords: pantheon, deity, deities, god, gods, domain, cleric, symbol, alignment, worship, religion
---

Pantheons and deities are Grimoire's two thin, sibling world-building modules for divine lore: the gods your clerics pray to, the domains they grant, and the pantheons that group them. Find them under **Campaign → Pantheon** in the sidebar, which opens the **deity** list (`/deities`); the pantheon list sits one click away at its own **Pantheons** button.

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
6. On the right: **Name**, **Titles & Epithets** (e.g. "The Morninglord, Lord of Dawn"), any **Alternate Names** the deity is known by in different cultures, the **Cleric Domains** it grants (click to toggle any number of the standard domains), a **Portfolio** line (what it governs: war, harvest, death…), **Lore & Description** (rich text, player-facing once revealed), and **DM Secrets**: a second rich-text field for hidden truths and true motivations that never gets shared, even when the deity itself is revealed.

## Browsing and filtering

The deity grid filters by free-text search (name, titles, portfolio, alternate names, tags), **Domain**, and **Pantheon**: all three live in the same session-persisted filter state as every other list in the app, with a **Clear** button once any is active.

## Revealing deities to players

Each deity and pantheon has its own reveal control (the grid card's overlay icon on deities, the row's inline icon on pantheons): pick specific party members or share with everyone. **Reveal All** on the deity list shares every deity in the campaign with the whole party in one click, since a pantheon is usually common knowledge rather than something worth revealing name by name.

## Worshipping factions

A deity's own page has a **Worshipping Factions** section: add any faction from your campaign to record who prays to this god. This is the only place that link is authored; see [Factions](#factions) for the faction side of it.

## Populate from Setting

**Populate Setting** on the deity list seeds pantheons and deities appropriate to your campaign's calendar (Faerûn alone seeds around a dozen pantheons and over a hundred deities). The import is idempotent (re-running repairs a campaign rather than duplicating anything) and content it seeds this way doesn't count against your plan's quota.

## What your players see

There's no dedicated player-facing pantheon page today: a deity becomes visible to the party only through whatever else reveals it (its own reveal control, and Reveal All). A revealed deity's name and alternate names also surface as autosuggestions in the **Deity** field of a player's own character-creation background step.

## Tips

> DM Secrets never leave your screen, whether or not the deity itself is shared: use it freely for anything you don't want a cleric's player reading ahead of time.

- Free plans cap how many deities and pantheons you can create by hand: see [Billing & Subscription](#billing-subscription). Content **Populate Setting** brings in doesn't count against either cap, so it's safe to run in full even on Free.
- Domains are a flat toggle list, not a combobox: click as many as the deity actually grants.

## Related

- [Factions](#factions)
- [Atlas: Locations](#atlas-locations)
- [Calendar System](#calendar-system)
- [Billing & Subscription](#billing-subscription)
