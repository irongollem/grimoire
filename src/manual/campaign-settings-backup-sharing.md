---
title: Campaign Settings — Backup, Sharing & Danger Zone
section: Campaign & Account
section_order: 16
order: 4
summary: The occasional tabs in Campaign Settings — Spotify, backups, World Bundle sharing, document import, and irreversible campaign actions.
keywords: spotify, backup, export, world bundle, grimoire file, import document, transfer ownership, delete campaign, danger zone
---

This page covers the administrative tabs of **Campaign Settings** (`/campaign/settings`) — the ones you'll open occasionally rather than every session: **Spotify**, **Backup**, **World Bundle**, **Import Document**, and **Danger Zone**. For the everyday tabs — Details, Members, Scheduling, Rules, Classes, Species, AI Assistant — see [Campaign Settings](#campaign-settings).

## Connecting Spotify

The **Spotify** tab lets *you* (the DM only — players are unaffected) play Spotify tracks and playlists from the Soundboard. It requires a free Spotify Developer App and a Spotify Premium account.

1. Create a free app at **developer.spotify.com/dashboard**.
2. In the app's settings, add the **Redirect URI** shown in the box below the instructions — click the copy icon to copy it exactly.
3. Under **Which API/SDKs are you planning to use?**, tick **both** Web API **and** Web Playback SDK.
4. Open **User Management** and add your own Spotify account (name + the email on the account). Older apps that predate this requirement may have skipped this step and an empty user list — both return an unhelpful `403` with no explanation, so check this first if playback fails.
5. Copy the app's **Client ID** into the field on this tab and click **Save**. The Client ID is not a secret — it's safe to store here.

Once saved, this tab shows your connection status: a Client ID saved but not yet linked shows a green dot prompting you to finish connecting from the Soundboard; once linked it shows your Spotify display name, email, and account tier (Premium is required — a Free-tier account shows in red). Click **Remove** to clear the Client ID entirely.

## Backing up your campaign

The **Backup** tab exports a full snapshot of the current campaign.

Click **Export Campaign** to download a `.grimoire-backup` file. It includes party members, character classes and spells, NPCs, factions, locations, quests, encounters, notes, calendar events, party inventory, crafting recipes, roll and loot tables, session scheduling, puzzle rooms, and sounds. It deliberately leaves out API keys and Spotify credentials, campaign members and invite links (so a restore starts fresh on membership), chat history and live combat state, and your personal monster/item/spell library (those are account-scoped, not campaign-scoped).

To **import** a `.grimoire-backup` file, use **Import from backup** in the campaign switcher at the top of the sidebar — not this tab.

## Sharing content as a World Bundle

The **World Bundle** tab packages selected campaign content and your personal library into a portable `.grimoire` bundle, or embeds it invisibly inside a Scriptorium PDF. It's a three-step wizard:

1. **Categories** — check every entity type you want to include, grouped into **Campaign Content** and **Your Library**. Selecting **Characters** auto-includes and locks Species, Spells, Custom Classes, and Custom Subclasses, since a character imports broken without them. Click **Continue**.
2. **Entity Picker** — for each selected category in turn, search and check the specific entities to include (**All**/**None** shortcuts available), then **Next**. The step counter and progress dots at the top show where you are.
3. **Bundle Details** — enter a **Bundle Name** (required) and optional **Description**, review the selection summary, then either:
   - **Export .grimoire** — downloads the bundle as a file another DM can import directly into their own campaign.
   - **Attach to PDF…** — embeds the bundle invisibly inside a PDF you already exported from the Scriptorium, producing one shareable file that reads like a normal PDF but imports as campaign content when brought back into Grimoire. See [Sharing Adventures as PDFs](#sharing-adventures-as-pdfs) for the PDF side of this. Re-saving that PDF through another app strips the embedded bundle data, so share the downloaded file as-is.

Player-visibility flags and party-member links are always cleared when a bundle is imported elsewhere. Click **Import .grimoire** on the first step of this tab to import someone else's bundle into the current campaign.

## Importing a document into this campaign

The **Import Document** tab is where a PDF, photo, or pasted page of an adventure gets read into structured campaign content — uploading, extraction progress, and the review wizard all happen here. It's covered in full, including the review steps, on [Importing an Adventure](#importing-an-adventure).

## Deleting or transferring your campaign

The **Danger Zone** tab holds the two irreversible campaign-level actions.

**Transfer ownership:**

1. Pick the new DM from the member list.
2. Optionally tick **Leave the campaign as well**.
3. If any monsters or traps are scoped exclusively to this campaign, choose what happens to your originals: **keep them globally** (available in all your campaigns), **move them to another campaign you own**, or **delete** them. Content referenced by the campaign is copied to the new owner either way.
4. Type the campaign's name to confirm, then confirm the transfer. The recipient must already be a member of the campaign — ownership can't be pushed onto someone who hasn't joined.

**Delete campaign:**

1. If the campaign has homebrew scoped exclusively to it, choose whether it becomes available in all your campaigns or is deleted with the campaign.
2. Type the campaign's name to confirm.
3. Click **Delete Campaign**.

Deleting a campaign permanently removes it, but your notes, NPCs, party members, calendar events, and encounters only have their campaign link removed — they are **not** deleted.

## What your players see

All five tabs on this page are DM-only. Players notice their effects indirectly: a connected Spotify account brings ambient music into the Soundboard, an imported World Bundle becomes new content in whichever campaign it lands in, and transferring or deleting a campaign changes who they're playing under (or ends the campaign for them, if it's deleted).

## Tips

> Only the campaign's current owner can transfer or delete it, and a transfer's recipient must already be a member — invite them first if they aren't.

- A `.grimoire-backup` file never contains API keys, Spotify credentials, or campaign membership — a restore always needs invites sent again.
- Re-saving an "Attach to PDF" output through another PDF app strips the embedded bundle data before you can share it.

## Related

- [Campaign Settings](#campaign-settings)
- [Sharing Adventures as PDFs](#sharing-adventures-as-pdfs)
- [Importing an Adventure](#importing-an-adventure)
- [Soundboard](#soundboard)
