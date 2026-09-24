---
title: Inviting Players
section: Getting Started
section_order: 0
order: 3
summary: Generate invite links, manage members, and preview the player portal.
keywords: invite, player, join, link, token, membership, role, access, preview
---

Players join your campaign through a one-click link you generate — there's no separate "player account setup" step. Open **Campaign Settings → Members & Invites**, which holds both the member list and the invite-link manager on one tab.

## Key ideas

| Term | What it means |
| --- | --- |
| **Invite link** | A one-time-generated URL (`/join/<token>`) that adds whoever opens it to your campaign as a player. |
| **Member** | Anyone (DM or player) attached to the campaign, tracked in the member list. |
| **Character assignment** | Linking a player's account to one party member (character sheet) so they see and control it in the Player Portal. |
| **DM Preview Mode** | Browsing the Player Portal as if you were a specific player, without a second account. |

## Generating an invite link

1. In the **New Invite Link** panel, optionally fill in:
   - **Label** — a note only you see, e.g. "For Alice."
   - **Expires** — a date/time after which the link stops working.
   - **Max uses** — how many times the link can be used before it's spent.
2. Click **Generate Link**.
3. Find the new link in the list below, and click **Copy** next to its URL (it changes to "Copied!" for a couple of seconds) to copy the join URL to your clipboard.
4. Send it to your player through any channel — Discord, WhatsApp, email, whatever you already use.

Each invite shows its use count, expiry (if any), and an **Expired** marker once it's passed. Click the trash icon (**Revoke invite**) on a link to deactivate it immediately.

## What players experience

When a player opens your invite link:

1. If they're not signed in, they see a sign-up/sign-in form.
2. Once authenticated, they're automatically added to your campaign as a **Player** — no approval step on your end.
3. They land directly in the Player Portal. They cannot reach any DM screen.

Players stay linked to your campaign permanently and can return any time by logging in.

## Assigning a character

After a player joins, find their row on the **Members & Invites** tab and use the **Assign character…** combobox to link them to a party member (character sheet). Only characters not already assigned to someone else appear in the list. Players can also create their own character from the Player Portal instead, if you'd rather they build it themselves.

## Removing a player

Click the person-remove icon (**Remove from campaign**) on a player's row. The confirmation dialog names the player and, if they have a linked character, tells you it's returning to their own character pool automatically — nothing is deleted, and they can bring it to another campaign later. Confirm with **Remove**.

A player who was removed (or whose link was cleared) can leave characters with no assigned player. These show under **Characters without a player**, where you can assign one to a new player, or — for a character the player claimed themselves — **Detach** it back to their pool, or, for one you created and manages, remove it outright.

## Presence and DM Preview Mode

A green (online) or grey (offline) dot on each member's avatar shows who's currently connected — handy for checking who's at the table before you start.

To see exactly what a specific player sees, click the eye icon (**Preview player portal as this character**) next to that character's name in the **Party Tracker**. This drops you into DM Preview Mode: a banner reading **DM Preview — viewing as: …** appears at the top of the player layout, with a dropdown to switch which character you're previewing and an **Exit Preview** button to leave.

## What your players see

Everything in this page is DM-only — players never see the invite list, the member list's controls, or that you're previewing their view. What they *do* see is described in [Player Portal — Overview](#player-portal-overview).

## Tips

> Revoking a link doesn't remove players who already used it — it only stops new joins. Use **Remove** on their row in the member list to remove someone who's already in.

- An invite with no expiry and no max-uses cap never stops working — set one or the other for a link you're sharing publicly.
- DM Preview Mode is genuinely read-only role-play: it doesn't let you act as the character, only see their screens the way they would.

## Related

- [Creating Your First Campaign](#creating-your-first-campaign)
- [Campaign Settings](#campaign-settings)
- [Party Tracker](#party-tracker)
- [Player Portal — Overview](#player-portal-overview)
