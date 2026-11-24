---
title: Campaign Settings
section: Campaign & Account
section_order: 16
order: 0
summary: Where campaign-wide configuration lives: details, members, scheduling, rules, classes, species, and AI.
keywords: campaign settings, members, invites, scheduling, rules, classes, species, ai, ruleset, edition
---

Campaign Settings is where every setting that applies to the whole campaign (rather than to one NPC, quest, or location) lives, organized into tabs. Open it from **Campaign → Settings** at the bottom of the sidebar's Campaign group (it's always last in the list), or go straight to `/campaign/settings`. It's DM-only: players are blocked from this route entirely.

This page covers the tabs you'll use most: **Details**, **Members & Invites**, **Scheduling**, **Rules**, **Travel**, **Classes**, **Species**, and **AI Assistant**. The more occasional, administrative tabs (**Spotify**, **Backup**, **World Bundle**, and **Danger Zone**) are covered on [Campaign Settings: Backup, Sharing & Danger Zone](#campaign-settings-backup-sharing-danger-zone). Connecting an external AI assistant (Claude, etc.) to *read* your campaign by conversation is a different tab, **AI Connections**, covered on its own page: [Connecting an AI Assistant](#connecting-an-ai-assistant).

## Key ideas

- **Tab**: switch tabs with the sidebar list (desktop) or the horizontal scroller (phone). The current tab is reflected in the page's address, so a link to one specific tab can be bookmarked or shared.
- **Active campaign**: every tab edits whichever campaign is currently selected in the sidebar switcher. Switch campaigns first if you meant a different one.

## Campaign details

The **Details** tab holds the campaign's core identity and table-wide toggles.

1. **Name**: the campaign's display name.
2. **Calendar, today's date and populating from a setting**: these live in **Canon**, in the **How the world works** part, not on this tab. See [Calendar System](#calendar-system).
3. **Theme**: pick one of the available visual themes; each option previews its background, primary, and card colors as three swatches.
4. **Health Visibility**: controls how HP is shown to players:
   - **Strategic**: HP bars and labels for everyone; exact numbers for player characters only.
   - **Immersive**: player characters show a bar only (no numbers); monsters show status words only.
   - **Unknown**: no health information shown for anything that isn't a player character.
5. **Immersive Rolls**: when on, Stealth, Investigation, and Insight-style checks show only flavor text in chat; the full numeric result is whispered to the DM only, so the player never sees their own roll's outcome.
6. **Map memory**: how much of the map your players keep once they have seen it.
   - **Remembered** (the default): what the party has seen stays on the map, shaded a little where they cannot see right now.
   - **Strict**: the map shows only what the party can see right now, plus anything you reveal by hand.
7. **Sight**: whose eyes a player's phone looks through.
   - **Shared by the party** (the default): every screen shows what any character can see. Best when everyone sits at one table.
   - **Each their own**: a player's phone shows only what their own character can see. Best for online play. The table screen on your TV always shows the whole party.
8. **Show VTT tokens to players**: when off, the player-facing battle map shows only the map and fog of war, with no character or monster tokens. Use this for in-person sessions run with physical minis or theater of the mind; your own DM view is unaffected either way.
9. Click **Save Changes**.

## Managing members and invites

The **Members & Invites** tab combines the member list and invite-link management on one screen.

**Member list:**

1. Every member shows as a row with an avatar initial, a **DM**/**player** role badge, and a green (online) or grey (offline) presence dot.
2. For players, a **Character** combobox assigns them a party member: it only offers characters not already assigned to someone else.
3. Click the person-remove icon on a player's row, then confirm, to remove them from the campaign. They can rejoin later via a new invite link. Any character they owned is **detached** back to their own personal pool automatically: nothing is deleted.
4. A **Characters without a player** section lists any party member left behind by a removed player. Claimed characters (owned by a real account) can only be **detached** back to their owner's pool; unclaimed, DM-managed ones can be fully **removed**.

**Invite Links (below the member list):**

1. Fill in the optional **Label**, **Expires**, and **Max uses** fields as needed, then click **Generate Link**.
2. Each invite shows its use count, expiry, and an **Expired** flag once past its date. Click **Copy** to copy the join URL (`<your-domain>/join/<token>`) to your clipboard.
3. Click the trash icon to **revoke** an invite immediately: it stops working right away.

## Scheduling sessions

The **Scheduling** tab manages proposed session dates and the party's shared calendar feed.

1. Under **Add Proposed Date**, pick a date and time, a **Title**, optional **Notes**, a **Duration** (hours), and **Min attendance**, then click **Add Date**. This immediately posts a 📅 announcement in campaign chat and emails every player who hasn't opted out of session-proposal emails.
2. Each proposed date shows a live availability count (`n/total available`) and, once you have players, a row of colored dots (green: available, red: not available, grey: no answer yet), one per member.
3. Click **Confirm** on a proposed date once enough players can make it; it moves to **Upcoming Sessions**. Use the pencil icon to **Edit** a date's title, time, or duration, or the **×**/trash icon to cancel or remove it.
4. If a `.ics` feed has been generated for the campaign, a **Calendar Subscription** box appears:
   - **Subscribe in Calendar App** opens a `webcal://` link that keeps your calendar app updated automatically: confirmed sessions as normal events, proposed ones as tentative entries that leave the evening free.
   - **Download .ics** saves a one-off snapshot that will not update itself.
   - **Regenerate URL** (DM only) issues a fresh subscription link. This breaks every existing subscription: everyone has to re-subscribe.

## Toggling optional rules

The **Rules** tab has two parts, the game system and the optional rules.

**Game system**: the system this table plays by. You choose it when you create the campaign (**GAME SYSTEM** on the **New Campaign** form) between **D&D 5e (2014)**, **D&D 5e (2024)** and **Generic**. The system sets the character sheets, creatures, items, rests and encounter rules, and which edition's books the campaign reads.

- **Switching between the two 5e editions**: on the **Rules** tab, choose the other edition. Changing it changes no character: each keeps the edition it was built with and keeps its seat. Characters built for the other edition are listed below the picker, so you can see who is out of step.
- **Allow both editions**: **On**, characters of either edition may join and stay as they are. **Off**, a character built with the other edition is asked to bring a converted copy. The same choice is offered as **Allow characters built for...** when you create the campaign.
- **Generic cannot be changed.** **Generic** is for any other system: the world, quests, maps and story tools, with no rules system's sheets or stat blocks. It does not swap with 5e in either direction, so the Rules tab just says it was chosen when the campaign was created.

### A Generic campaign

Anything that exists only for a rules system is hidden in a Generic campaign, so it opens as a world-building and story tool. These are not in the sidebar:

- **Encounters**, **Party**, the **Table**, and **Character Sheet**, because there are no characters to build or fight with.
- In **Compendium**: **Reliquary**, **Bestiary**, **Spellbook**, **Item Vault** and **Character Codex**.

In the same way, **Campaign Settings** drops the **Classes** and **Species** tabs, and the **Rules** tab has no optional rules to toggle. Dice roll as plain dice, with no advantage or disadvantage. Quests, the Atlas and maps, NPCs, factions, notes, the calendar, sessions, the soundboard and chat all work as in any campaign. A Generic campaign starts with a single coin you can rename or add to in **Canon**, under **How the world works**. Characters built for 5e cannot join a Generic table, and no conversion is offered.

**Optional rules**: a toggle per rule. Enabled rules become visible to players in the Rules Reliquary. Some rules expose extra numeric fields (like a turn duration) once switched on. The full list:

| Rule | What it does | Default |
| --- | --- | --- |
| Turn Timer | Puts a countdown on each combatant's turn in the encounter runner (DM sets the seconds). It's a soft nudge: it never force-ends a turn. | Off |
| Random Initiative Each Round | Re-rolls and re-sorts initiative at the start of every round instead of once per fight. | Off |
| Ignore Multiclass Prerequisites | Waives the PHB ability-score minimums for multiclassing. | Off |
| Optional Class Features | Allows the Tasha's Cauldron class-feature swaps (e.g. Primal Awareness for Primeval Awareness) at Level Up. | Off |
| Experience Points | Switches from milestone leveling (the Levels card on the Party page) to tracked XP: a won fight shares the defeated foes' XP among the characters in it, and Level Up unlocks automatically at the threshold. | Off |
| Awareness Rolls | Rolls a secret Perception d20 for each character when a session starts and keeps it until a Perception check is due. The DM sees it beside passive Perception; players never do. See [Party Tracker](#party-tracker). | Off |
| **Crafting** | Turns on the **Workshop**: players gather recipes and craft items between sessions. See [Workshop Overview](#workshop-overview). | **On** |
| **The Interlude** | Turns on downtime draws and activity cards between sessions. See [The Interlude: Downtime](#the-interlude-downtime). | **On** |
| Encumbrance | Carried weight affects speed and imposes penalties past STR-based thresholds. | Off |
| Flanking | Two allies on opposite sides of an enemy grant each other advantage. | Off |
| Massive Damage | A single hit for half max HP or more forces a CON save against the System Shock table. | Off |
| Morale | NPCs/monsters may flee or surrender when a fight turns against them. | Off |
| Lingering Injuries | Crits and drops to 0 HP can roll a lasting injury from the DMG table. | Off |
| Slow Natural Healing | Long rests restore Hit Dice, not HP: HP recovery requires spending them. | Off |

**Crafting** and **The Interlude** are the two rules on by default: they gate the **Workshop** and **Interlude** items in the sidebar nav respectively. Turn either off here to hide that nav item and its data from players for this campaign.

## Setting the campaign's coins

The **Coins** part of **Canon**, under **How the world works**, lists the coins your table uses. A new campaign starts with the D&D coins (platinum, gold, electrum, silver, copper); change them to your own homebrew coins, or to dollars or credits for another kind of game.

- **Each coin** has a name, a short name (shown everywhere: "5 gp"), a worth counted in your smallest coin, a colour, and **Used for change**: whether it is handed back as change when someone pays (D&D's electrum is not).
- **Exactly one coin is worth 1.** It is the smallest coin, and every other coin's worth is counted in it.
- **Default coin**: a price written as just a number ("50") is read in this coin.
- **Removing a coin** converts what everyone holds of it into the remaining coins, by worth: purses, unsent loot, loot tables, encounter coin pools and chat history. Grimoire asks before it does.
- **Renaming a coin** or changing its colour keeps everyone's coins as they are.
- **Reset to D&D 5e coins** puts the standard set back (it still needs **Save**).

Payments make change: paying 1 gp with only a platinum piece takes the platinum and hands back 9 gp.

## Choosing available classes and species

The **Classes** and **Species** tabs each list every reference class/species with a checkbox, plus any campaign-exclusive custom ones (shown separately, always available, and not toggleable). Uncheck an entry to hide it from the party-member class/species picker; click **Enable all** to clear every hidden entry at once. Custom classes and campaign-only species you've created are always available regardless of these toggles.

## AI Assistant setup

The **AI Assistant** tab configures in-app AI generation for this campaign, separate from the **AI Connections** tab, which is about letting an *external* AI client read your data (see [Connecting an AI Assistant](#connecting-an-ai-assistant)).

1. Flip the **AI Assistant** toggle on. The first time any account turns it on, a one-time notice explains what enabling AI generation means before it takes effect; declining leaves the toggle off. Turning it off hides every AI-generation button across the campaign.
2. On a **free** plan, that's the whole tab: generation runs on Grimoire-managed credits (see [Billing & Subscription](#billing-subscription)).
3. On **Pro**, more options appear:
   - **Generation**: choose **Quick** or **Detailed** images, with the estimated credit cost per image. Which model writes and draws is Grimoire's choice and isn't shown.
   - **Your AI Usage**: your total generations and credits spent.
   - **Chronicler Promotion**: an opt-in checkbox allowing Grimoire to feature your campaign's AI-generated Chronicler scene images in its gallery or marketing. Off by default; your campaign name, notes, and player data are never shared either way.
4. Click **Save**.

## What your players see

Players never see Campaign Settings: the route is DM-only. They do see the *effects* of some tabs: enabled optional rules appear in their Rules Reliquary, session proposals and confirmations show up in their calendar/chat, and a changed theme changes the whole app's look for everyone in the campaign.

## Tips

> Choosing how images are made is Pro-only. Free campaigns still generate with AI once the **AI Assistant** toggle is on, paid in credits.

> What the AI writes and paints follows your campaign's Premise and tone, which you set in the **Canon**, on every plan.

- Removing a player never deletes their character: it detaches back to their own personal pool, ready to bring into another campaign.
- Regenerating the calendar's `.ics` URL breaks every subscription that already exists; only do it if you have to.
- Disabling an optional rule doesn't erase data tied to it: it just hides the feature and its nav item from players again.

## Related

- [Campaign Settings: Backup, Sharing & Danger Zone](#campaign-settings-backup-sharing-danger-zone)
- [Connecting an AI Assistant](#connecting-an-ai-assistant)
- [Billing & Subscription](#billing-subscription)
- [Workshop Overview](#workshop-overview)
- [The Interlude: Downtime](#the-interlude-downtime)
- [Inviting Players](#inviting-players)
- [AI Generation & Credits](#ai-generation-credits)
