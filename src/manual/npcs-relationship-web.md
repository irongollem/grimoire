---
title: NPC Relationship Web
section: NPC Tracker
section_order: 4
order: 2
summary: Visualise and manage NPC connections in an interactive force-directed graph.
keywords: npc, relationship, web, graph, connections, network, link, ally, enemy
---

The **Relationship Web** (`/npcs/web`) renders all NPC connections as an interactive force-directed graph — a living map of your campaign's social fabric.

## What it shows

Each NPC appears as a node. Edges between nodes represent connections. By default the graph includes only NPCs; toggle **Show Party Members** to add the player characters as nodes too (useful for showing which NPCs the party knows personally).

**Node colours** — match the NPC's relationship-to-party setting:
- Blue — Ally
- Grey — Neutral
- Red — Enemy
- Purple — Unknown

**Edge colours** — each of the 13 relationship types has its own distinct colour. A legend appears at the bottom of the screen.

## Navigating the graph

- **Drag nodes** to position them where you want. Nodes stay where you place them (pinned).
- **Scroll or pinch** to zoom in and out.
- **Click a node** to open the side panel — shows the NPC's portrait, name, occupation, and list of connections.

## Creating connections in the graph

You can create a new connection without leaving the graph:

1. Hold **Shift** and click the first NPC node.
2. Hold **Shift** and click the second NPC node.
3. A connection form appears — choose the relationship type and add optional notes. Save and the edge appears immediately.

## Editing connections

Click any **edge** to open an inline edit form. Change the relationship type or notes, then save. The edge colour updates to reflect the new type.

## Filtering the graph

Use the toolbar to filter what's displayed:

- **Search by name** — nodes not matching the search are dimmed.
- **Location filter** — show only NPCs at a specific location.
- **Relationship type filter** — highlight only edges of a specific type.

## Connection types

| Type | Inverse (auto-computed) |
|---|---|
| Ally | Ally |
| Family | Family |
| Friend | Friend |
| Rival | Rival |
| Enemy | Enemy |
| Mentor | Apprentice |
| Apprentice | Mentor |
| Lover | Lover |
| Subordinate | Superior |
| Superior | Subordinate |
| Contact | Contact |
| Former Ally | Former Ally |
| Former Enemy | Former Enemy |

The inverse is computed automatically when you view a connection from the other NPC's perspective — you only need to set it once.
