---
title: Factions
section: World Building
section_order: 2
order: 2
summary: Model organisations, their relationships, and which NPCs and PCs belong to them.
keywords: faction, factions, organisation, membership, relation, guild, government, religion
---

Factions represent any organisation in your world: guilds, governments, cults, criminal networks, mercenary companies, or secret societies. Party members can join factions, and those factions automatically become visible to the relevant players. Find the list under **Campaign → Factions** in the sidebar (`/factions`).

## Key ideas

| Term | Meaning |
| --- | --- |
| Faction | An organisation with a type, alignment, emblem, and a roster of NPC and PC members. |
| Relation | A one-directional link from this faction to another: your view of them may differ from theirs of you. |
| Reveal | A faction shared with a player becomes visible to them; a player whose own character has joined a faction sees it automatically regardless of sharing. |

## Creating a faction

Click **New Faction** and fill in:

- **Type**: Guild, Government, Religion, Criminal, Military, Merchant, Secret Society, Cult, Order, Tribe, or Other, picked from a searchable combobox.
- **Alignment**: one of the nine D&D alignments (optional but useful for quick reads).
- **Reveal**: who this faction is shared with, right in the editor.
- **Tags**.
- **Emblem**: upload a square image with focal-point control.
- **Name** and **Description** (rich text covering history, motives, and activities) on the right.

An existing faction's editor also offers **Copy to campaign…**, which duplicates the faction, and its worshipped-deity links, into a different campaign you own.

## Generating a faction with AI

Click **Generate** on the Factions list page to open the faction generator panel and describe the organisation in a concept box; see [AI Generation & Credits](#ai-generation-credits) for how costs are shown, and for what happens if the campaign's AI Assistant is off or your credit balance is short.

## Bulk moving or copying factions

Click **Select** to enter selection mode, tick the factions you want, then use the bar that appears to **Move to campaign** (reassigns ownership) or **Copy to campaign…** (duplicates into another campaign, along with each faction's worshipped-deity links). "Make available in all campaigns" isn't offered for a bulk move, because a general faction can't carry a campaign-scoped deity link with it.

## NPC membership

In the **Members** section, add any NPC from your tracker. Assign each member a:

- **Role**: Leader, Officer, Enforcer, Member, Initiate, Associate, Agent, Informant, or Unknown.
- **Status**: Active, Retired, Defected, Expelled, or Deceased.

Members appear in the faction detail and on the NPC's own sheet.

## Party member membership

PCs can join factions with their own role and status. When a PC joins a faction, that faction automatically becomes visible to the player who controls that character, even if the faction isn't otherwise shared with them.

## Faction relations

Model inter-faction politics in the **Relations** section. Each relation points to another faction and has a type:

| Relation     | Description                     |
| ------------ | ------------------------------- |
| Allied       | Openly friendly and cooperative |
| Friendly     | Generally positive relations    |
| Neutral      | No strong feeling either way    |
| Suspicious   | Wary but not hostile            |
| Rival        | Competing openly                |
| Hostile      | Active conflict or enmity       |
| Secret Ally  | Allied publicly unknown         |
| Secret Enemy | Hostile publicly unknown        |

Relations are one-directional: faction A's view of faction B may differ from B's view of A.

## Linked locations and items

Attach locations and vault items to a faction to model their territory or signature gear. Each link has optional notes.

## Which deities a faction worships

There's no "Deities" section on the faction page itself: this link is authored from the **other** side. Open the deity in [Pantheon: Gods & Deities](#pantheon-gods-deities) and add the faction under **Worshipping Factions**. It then shows up automatically wherever the game needs to know who prays to whom.

## Populate from Setting

**Populate from Setting** seeds setting-appropriate factions for your campaign world: it only appears once your campaign's calendar has matching seed data. For Faerûn this includes the Harpers, Zhentarim, Emerald Enclave, and others. The import is idempotent (it deduplicates by name, so re-running is safe) and the factions it seeds don't count against your plan's faction cap.

## Sharing a faction with players

Use the reveal control on a faction's row (list page) or its own page to pick which players see it. A player whose character has actually joined the faction sees it regardless of this setting. Once a player can see a faction, they can add their own private notes to it.

## What your players see

Players see a faction on their Player Portal's **Factions** page once it's shared with them, or once their own character joins it: factions they belong to sort to the top with a highlighted border. Opening a faction shows its description and, only for factions the player is a member of, a **Known Members** list: fellow PC members (the player's own character marked "(You)"), and active NPC members, each with their role.

## Tips

- Relations are one-directional: set both sides if you want the politics to read consistently from either faction's own page.
- A faction with no NPCs, PCs, relations or links is still a valid faction to reveal: the description alone is often enough for players to recognise a name.
- Free plans have a cap on how many factions you can create: see [Billing & Subscription](#billing-subscription).

## Related

- [Atlas: Locations](#atlas-locations)
- [Pantheon: Gods & Deities](#pantheon-gods-deities)
- [Quest Log](#quest-log)
- [Billing & Subscription](#billing-subscription)
