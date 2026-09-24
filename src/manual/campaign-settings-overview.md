---
title: Campaign Settings
section: Campaign & Account
section_order: 16
order: 0
summary: Where campaign-wide configuration lives — details, members, scheduling, rules, classes, species, and AI.
keywords: campaign settings, members, invites, scheduling, rules, classes, species, ai, ruleset, edition
---

Campaign Settings is where every setting that applies to the whole campaign — rather than to one NPC, quest, or location — lives, organized into tabs. Open it from **Campaign → Settings** at the bottom of the sidebar's Campaign group (it's always last in the list), or go straight to `/campaign/settings`. It's DM-only: players are blocked from this route entirely.

This page covers the tabs you'll use most: **Details**, **Members & Invites**, **Scheduling**, **Rules**, **Classes**, **Species**, and **AI Assistant**. The more occasional, administrative tabs — **Spotify**, **Backup**, **World Bundle**, **Import Document**, and **Danger Zone** — are covered on [Campaign Settings — Backup, Sharing & Danger Zone](#campaign-settings-backup-sharing-danger-zone). Connecting an external AI assistant (Claude, etc.) to *read* your campaign by conversation is a different tab, **AI Connections**, covered on its own page: [Connecting an AI Assistant](#connecting-an-ai-assistant).

## Key ideas

- **Tab** — switch tabs with the sidebar list (desktop) or the horizontal scroller (phone). The current tab is reflected in the page's address, so a link to one specific tab can be bookmarked or shared.
- **Active campaign** — every tab edits whichever campaign is currently selected in the sidebar switcher. Switch campaigns first if you meant a different one.

## Campaign details

The **Details** tab holds the campaign's core identity and table-wide toggles.

1. **Name** — the campaign's display name.
2. **World** — a free-text setting name (Forgotten Realms, Eberron, Homebrew, etc.), with a dropdown of common settings for convenience.
3. **Calendar** — pick a built-in calendar system, or choose **— Custom calendar…** to open the custom calendar editor and define your own months, weekdays, and moons.
4. **Current Year** — the campaign's current in-world year.
5. If the world you picked has a matching setting bundle, a **Populate from [Setting]** box appears. Click **Populate** to seed locations, notable NPCs, and factions from that setting — existing entries are skipped, so it's safe to run more than once.
6. **Theme** — pick one of the available visual themes; each option previews its background, primary, and card colors as three swatches.
7. **Health Visibility** — controls how HP is shown to players:
   - **Strategic** — HP bars and labels for everyone; exact numbers for player characters only.
   - **Immersive** — player characters show a bar only (no numbers); monsters show status words only.
   - **Unknown** — no health information shown for anything that isn't a player character.
8. **Immersive Rolls** — when on, Stealth, Investigation, and Insight-style checks show only flavor text in chat; the full numeric result is whispered to the DM only, so the player never sees their own roll's outcome.
9. **Show VTT tokens to players** — when off, the player-facing battle map shows only the map and fog of war, with no character or monster tokens. Use this for in-person sessions run with physical minis or theater of the mind; your own DM view is unaffected either way.
10. Click **Save Changes**.

## Managing members and invites

The **Members & Invites** tab combines the member list and invite-link management on one screen.

**Member list:**

1. Every member shows as a row with an avatar initial, a **DM**/**player** role badge, and a green (online) or grey (offline) presence dot.
2. For players, a **Character** combobox assigns them a party member — it only offers characters not already assigned to someone else.
3. Click the person-remove icon on a player's row, then confirm, to remove them from the campaign. They can rejoin later via a new invite link. Any character they owned is **detached** back to their own personal pool automatically — nothing is deleted.
4. A **Characters without a player** section lists any party member left behind by a removed player. Claimed characters (owned by a real account) can only be **detached** back to their owner's pool; unclaimed, DM-managed ones can be fully **removed**.

**Invite Links (below the member list):**

1. Fill in the optional **Label**, **Expires**, and **Max uses** fields as needed, then click **Generate Link**.
2. Each invite shows its use count, expiry, and an **Expired** flag once past its date. Click **Copy** to copy the join URL (`<your-domain>/join/<token>`) to your clipboard.
3. Click the trash icon to **revoke** an invite immediately — it stops working right away.

## Scheduling sessions

The **Scheduling** tab manages proposed session dates and the party's shared calendar feed.

1. Under **Add Proposed Date**, pick a date and time, a **Title**, optional **Notes**, a **Duration** (hours), and **Min attendance**, then click **Add Date**. This immediately posts a 📅 announcement in campaign chat and emails every player who hasn't opted out of session-proposal emails.
2. Each proposed date shows a live availability count (`n/total available`) and, once you have players, a row of colored dots — green (available), red (not available), grey (no answer yet) — one per member.
3. Click **Confirm** on a proposed date once enough players can make it; it moves to **Upcoming Sessions**. Use the pencil icon to **Edit** a date's title, time, or duration, or the **×**/trash icon to cancel or remove it.
4. If a `.ics` feed has been generated for the campaign, a **Calendar Subscription** box appears:
   - **Subscribe in Calendar App** opens a `webcal://` link that keeps your calendar app updated automatically — confirmed sessions as normal events, proposed ones as tentative entries that leave the evening free.
   - **Download .ics** saves a one-off snapshot that will not update itself.
   - **Regenerate URL** (DM only) issues a fresh subscription link. This breaks every existing subscription — everyone has to re-subscribe.

## Toggling optional rules

The **Rules** tab has two parts.

**Rules edition** — pick **D&D 5e (2014)** or **D&D 5e (2024)** for the whole campaign. Existing campaigns default to 2014. Changing edition can alter character progression and available content; existing character choices are preserved for review rather than discarded.

**Optional rules** — a toggle per rule. Enabled rules become visible to players in the Rules Reliquary. Some rules expose extra numeric fields (like a turn duration) once switched on. The full list:

| Rule | What it does | Default |
| --- | --- | --- |
| Turn Timer | Puts a countdown on each combatant's turn in the encounter runner (DM sets the seconds). It's a soft nudge — it never force-ends a turn. | Off |
| Random Initiative Each Round | Re-rolls and re-sorts initiative at the start of every round instead of once per fight. | Off |
| Ignore Multiclass Prerequisites | Waives the PHB ability-score minimums for multiclassing. | Off |
| Optional Class Features | Allows the Tasha's Cauldron class-feature swaps (e.g. Primal Awareness for Primeval Awareness) at Level Up. | Off |
| Experience Points | Switches from milestone leveling to tracked XP; Level Up unlocks automatically at the threshold. | Off |
| **Crafting** | Turns on the **Workshop** — players gather recipes and craft items between sessions. See [Workshop Overview](#workshop-overview). | **On** |
| **The Interlude** | Turns on downtime draws and activity cards between sessions. See [The Interlude — Downtime](#the-interlude-downtime). | **On** |
| Encumbrance | Carried weight affects speed and imposes penalties past STR-based thresholds. | Off |
| Flanking | Two allies on opposite sides of an enemy grant each other advantage. | Off |
| Massive Damage | A single hit for half max HP or more forces a CON save against the System Shock table. | Off |
| Morale | NPCs/monsters may flee or surrender when a fight turns against them. | Off |
| Lingering Injuries | Crits and drops to 0 HP can roll a lasting injury from the DMG table. | Off |
| Slow Natural Healing | Long rests restore Hit Dice, not HP — HP recovery requires spending them. | Off |

**Crafting** and **The Interlude** are the two rules on by default — they gate the **Workshop** and **Interlude** items in the sidebar nav respectively. Turn either off here to hide that nav item and its data from players for this campaign.

## Choosing available classes and species

The **Classes** and **Species** tabs each list every reference class/species with a checkbox, plus any campaign-exclusive custom ones (shown separately, always available, and not toggleable). Uncheck an entry to hide it from the party-member class/species picker; click **Enable all** to clear every hidden entry at once. Custom classes and campaign-only species you've created are always available regardless of these toggles.

## AI Assistant setup

The **AI Assistant** tab configures in-app AI generation for this campaign — separate from the **AI Connections** tab, which is about letting an *external* AI client read your data (see [Connecting an AI Assistant](#connecting-an-ai-assistant)).

1. Flip the **AI Assistant** toggle on. The first time any account turns it on, a one-time notice explains what enabling AI generation means before it takes effect; declining leaves the toggle off. Turning it off hides every AI-generation button across the campaign.
2. On a **free** plan, that's the whole tab — generation runs on Grimoire-managed credits (see [Billing & Subscription](#billing-subscription)).
3. On **Pro**, more options appear:
   - **Key Storage Mode** — check **Store keys locally on this device only** to keep API keys in this browser's storage instead of your account (they won't follow you to another device); leave it unchecked to store them encrypted in your account.
   - **API Keys · BYOK** — bring your own key for OpenAI and/or Google Gemini. Each field has a **Get key →** link to the provider's key page, and a **Clear**/**Undo** control once a key is on file. Bringing your own key means that provider bills you directly instead of spending Grimoire credits.
   - **Active Providers** — separate pickers for **Text generation** and **Image generation**. Without a BYOK key, text generation runs on the fixed platform model and image generation offers whichever providers are currently enabled platform-side, with an estimated credit cost and rough speed shown per option.
   - **Campaign Setting Prompt** — a free-text box describing your world's tone and visual style, included in every AI generation request for consistency. Click **Load [Setting] Defaults** to start from your chosen setting's built-in prompt.
   - **Your AI Usage** — a running breakdown of credits spent per generation (platform-credit users only; BYOK calls are billed by your own provider and don't appear here).
   - **Chronicler Promotion** — an opt-in checkbox allowing Grimoire to feature your campaign's AI-generated Chronicler scene images in its gallery or marketing. Off by default; your campaign name, notes, and player data are never shared either way.
4. Click **Save**.

## What your players see

Players never see Campaign Settings — the route is DM-only. They do see the *effects* of some tabs: enabled optional rules appear in their Rules Reliquary, session proposals and confirmations show up in their calendar/chat, and a changed theme changes the whole app's look for everyone in the campaign.

## Tips

> Bring-your-own-key AI setup, provider choice, and the campaign setting prompt are Pro-only. Free campaigns still get AI generation once the **AI Assistant** toggle is on — it's billed to Grimoire-managed credits instead.

- Removing a player never deletes their character — it detaches back to their own personal pool, ready to bring into another campaign.
- Regenerating the calendar's `.ics` URL breaks every subscription that already exists; only do it if you have to.
- Disabling an optional rule doesn't erase data tied to it — it just hides the feature and its nav item from players again.

## Related

- [Campaign Settings — Backup, Sharing & Danger Zone](#campaign-settings-backup-sharing-danger-zone)
- [Connecting an AI Assistant](#connecting-an-ai-assistant)
- [Billing & Subscription](#billing-subscription)
- [Workshop Overview](#workshop-overview)
- [The Interlude — Downtime](#the-interlude-downtime)
- [Inviting Players](#inviting-players)
- [AI Generation & Credits](#ai-generation-credits)
