---
title: Previewing as a Player
section: Player Portal
section_order: 15
order: 1
summary: How to see exactly what a specific character sees in the portal, without a second account.
keywords: preview, dm preview mode, memberid, exit preview, disguise, impersonate
---

Sharing settings are scattered across a dozen features, and it's easy to think something is visible when it isn't (or the reverse). **DM Preview Mode** lets you open the player portal exactly as one specific character would see it, without signing into a second account.

## Entering preview mode

Preview mode is entered per character, from the **Party** page (`/party`): each row in your Party Tracker has a **preview** button (tooltip "Preview player portal as this character"). Clicking it drops you straight into `/play` as that character.

There's no separate "enter preview" toggle anywhere else — it's always tied to picking a character first.

## What changes

- An amber banner appears at the top of the portal: **"DM Preview — viewing as:"** with a dropdown to switch which character you're previewing, and an **Exit Preview** button.
- Everything the portal shows resolves exactly as it would for that player — the same visibility rules, the same gating. If an NPC isn't shared with that character, you won't see it in preview either.
- **Shapeshifter disguises show as the disguise.** If the previewed character (or another party member) is using a shapeshifter disguise, preview mode shows the fake species/race exactly as every other player sees it — not the true form you see in your normal DM screens.
- Preview mode is read-mostly for anything that isn't the previewed character's own data: you can't act as a different player's companion, for instance, the same way that player couldn't.

## Exiting

Click **Exit Preview** in the banner, or just open any DM page — leaving the Player Portal while previewing returns you to your own screens.

## A narrower shortcut: jumping to one character's data

A few DM-side surfaces link you directly into a single screen of the portal for one character — without the amber banner, and without switching into full preview:

- The Dashboard's **Cursed Items** widget links a carried cursed item straight to that character's Inventory tab.
- Starting a **Level Up** for a character from the party view opens the wizard the same way.

These land you on that one screen for that one character, but you haven't adopted their whole session the way full preview does. Full Preview Mode (above) is the only way to browse the *entire* portal as a player.

## Tips

> Use preview mode as your source of truth for "will my players actually see this" — reasoning about a dozen independent visibility flags in your head is exactly how something gets shared that shouldn't be, or hidden that should be shown.

- **Preview mode never lets you act as a player would in a way that mutates their world for real without your consent** — everything you do in preview goes through the same DM-privileged path you'd use normally, not the player's restricted one.
- **Switching the previewed character** uses the dropdown in the banner — you don't need to exit and re-enter.

## Related

- [Player Portal — Overview](#player-portal-overview) — the portal's general shape.
- [Party Tracker](#party-tracker) — where the preview button lives.
