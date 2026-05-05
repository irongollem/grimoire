---
title: Factions
section: World Building
section_order: 3
order: 2
summary: Model organisations, their relationships, and which NPCs and PCs belong to them.
keywords: faction, factions, organisation, membership, relation, guild, government, religion
---

Factions represent any organisation in your world — guilds, governments, cults, criminal networks, mercenary companies, or secret societies. Party members can join factions, and those factions automatically become visible to the relevant players.

## Creating a faction

Click **New Faction** and fill in:

- **Name** — required.
- **Type** — Guild, Government, Religion, Criminal, Military, Merchant, Secret Society, Cult, Order, Tribe, or Other.
- **Alignment** — one of the nine D&D alignments (optional but useful for quick reads).
- **Emblem** — upload a square image with focal-point control.
- **Description** — rich text covering history, motives, and activities.

## NPC membership

In the **Members** section, add any NPC from your tracker. Assign each member a:

- **Role** — Leader, Officer, Enforcer, Member, Initiate, Associate, Agent, Informant, or Unknown.
- **Status** — Active, Retired, Defected, Expelled, or Deceased.

Members appear in the faction detail and on the NPC's own sheet.

## Party member membership

PCs can join factions with their own role and status. When a PC joins a faction, that faction automatically becomes visible to the player who controls that character — even if the faction isn't otherwise shared with them.

## Faction relations

Model inter-faction politics in the **Relations** section. Each relation points to another faction and has a type:

| Relation | Description |
|---|---|
| Allied | Openly friendly and cooperative |
| Friendly | Generally positive relations |
| Neutral | No strong feeling either way |
| Suspicious | Wary but not hostile |
| Rival | Competing openly |
| Hostile | Active conflict or enmity |
| Secret Ally | Allied publicly unknown |
| Secret Enemy | Hostile publicly unknown |

Relations are one-directional — faction A's view of faction B may differ from B's view of A.

## Linked locations and items

Attach locations and vault items to a faction to model their territory or signature gear. Each link has optional notes.

## Populate from Setting

The **Populate from Setting** button seeds setting-appropriate factions for your campaign world. For Faerûn this includes the Harpers, Zhentarim, Emerald Enclave, and others. The import is idempotent — it deduplicates by name, so re-running is safe.

## Player visibility

Set `visible_to` to share a faction with specific players. Players who belong to the faction automatically see it regardless of this setting. Players can add their own private notes to any faction visible to them.
