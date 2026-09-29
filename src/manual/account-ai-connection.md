---
title: Connecting an AI Assistant
section: Campaign & Account
section_order: 16
order: 2
summary: Let an external AI assistant like Claude read and edit your campaigns by conversation.
keywords: mcp, oauth, connector, claude, ai assistant, connected apps, voice coach, soundboard
---

Grimoire can act as a data source for your own AI assistant (Claude Desktop, claude.ai, or Claude Code), so you can ask it for an NPC's backstory, a monster's stat block, or a recap of an active quest instead of clicking through pages. It is a connector that lets an *external* AI tool work with your Grimoire data by conversation, separate from the in-app AI generation used for portraits and stat blocks. Set it up from **Campaign → Settings → AI Connections** (`/campaign/settings`).

What a connected AI can do:

- **Read** your campaigns and their content, including images and the audio on a campaign's soundboard.
- **Create and edit** content: NPCs, monsters, spells, items, locations, quests, notes and the rest, for example transcribing a stat block from a book into your library. It can never **delete** anything.
- **Ask the NPC Voice Coach** for lines in an NPC's voice. This spends AI credits exactly like the button on the NPC page, and needs AI turned on for that campaign. Nothing else it does costs credits.

Whatever you ask it is sent to your AI provider, so only connect an assistant you trust with that data.

## Key ideas

- **Connector URL**: a fixed web address for Grimoire's MCP (Model Context Protocol) server; you paste this into your AI client to establish the connection.
- **OAuth consent**: after pasting the connector URL, your AI client redirects you to Grimoire to sign in and explicitly approve the connection; nothing connects without this step.
- **Connected AI apps**: the list of AI clients you've approved, each revocable independently.
- **Account-wide, not per-campaign**: even though this tab lives inside one campaign's settings, approving a connection gives that AI assistant read access to *every* campaign your account can see, scoped exactly the way your own account already is (a player-side connection, if you have one, would only see what that account can see).

## Connecting an AI assistant

1. On the **AI Connections** tab, click **Copy** next to the **Connector URL** to copy it to your clipboard.
2. In your AI client (claude.ai or Claude Desktop), go to **Settings → Connectors → Add custom connector** and paste the URL.
3. Click **Connect**. You're sent to Grimoire's sign-in if you aren't already signed in, then to the authorization screen.
4. On the authorization screen, review what access you're granting: reading, creating and editing your campaigns and their content (NPCs, monsters, spells, items, locations, quests, notes, and more) and spending AI credits on the Voice Coach, scoped to what your account can already see, with no ability to delete anything and no visibility into your password or API keys. Click **Allow** to finish, or **Deny** to cancel.

No token ever needs to be copied by hand: the whole handshake happens through sign-in and this one approval screen.

## Reviewing and revoking connected apps

The **Connected AI apps** list on the same tab shows every AI client you've approved, with its name and the date it was connected.

1. Find the app you want to disconnect.
2. Click **Revoke** on its row.

Revoking takes effect immediately: that client loses access on its next request.

## What your players see

Nothing directly: the AI Connections tab lives in Campaign Settings, which is DM-only. If a player has connected their own AI assistant to their own account (the same MCP connector works for any authenticated user), it only ever sees what that player's own account can see, exactly as if they were browsing the player portal themselves.

## Tips

> The connection is scoped by your normal permissions: an AI client connected this way can never see or change more than you could by clicking through the app yourself, and it can never delete anything.

- Because approval is account-wide, disconnecting a client you no longer trust should be done here even if you only remember using it from one specific campaign.
- Anything you ask a connected assistant is processed by that assistant's own AI provider, outside Grimoire's control: treat it the same as pasting your data into that provider's chat.

## Related

- [Campaign Settings](#campaign-settings)
- [AI Generation & Credits](#ai-generation-credits)
- [Your Account](#your-account)
