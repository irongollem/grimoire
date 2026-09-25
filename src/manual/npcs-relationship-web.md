---
title: NPC Relationship Web
section: NPC Tracker
section_order: 4
order: 2
summary: Visualise NPC connections and faction membership in an interactive force-directed graph.
keywords: npc, relationship, web, graph, connections, network, link, faction, hull
---

The **Relationship Web** (**Web** in the NPC Tracker's header, `/npcs/web`) renders every NPC connection as an interactive force-directed graph: a living map of your campaign's social fabric, including where factions overlap it.

## What it shows

Each NPC appears as a node, positioned automatically by the graph's simulation; drag a node and it stays where you put it. Edges between nodes represent connections.

**Node colour**: the NPC's relationship-to-party attitude:

| Attitude | Colour |
| --- | --- |
| Hostile | Red |
| Unfriendly | Orange |
| Indifferent | Grey |
| Friendly | Teal |
| Helpful | Green |
| Unknown | Purple |

**Party members** appear too when the **Party Members** toggle is on: larger gold circles, wearing the member's portrait when they have one. Only party members get portraits on the graph; a campaign has a handful of them against potentially hundreds of NPCs, so fetching every NPC's portrait just to draw it small would be a lot of network for very little picture.

**Edges** are coloured by relationship type. NPC–NPC edges are solid; NPC–party-member edges are dashed ("PC link" in the legend).

## Navigating the graph

- **Drag nodes** to reposition them; they stay pinned where you drop them.
- **Scroll or pinch** to zoom.
- **Click a node** to open the side panel with its portrait, name, occupation, and connections.

## Creating and editing connections

You can build connections without leaving the graph:

1. Click an NPC node to select it, then hold **Shift** and click a second node (NPC or party member). A link form opens with a relationship type and an optional notes field. Save it and the edge appears immediately.
2. To edit an existing connection, click its **edge**. The same form opens pre-filled; change the type or notes and save, or delete it.

A **Shift+click another node to link** hint appears at the bottom of the screen once you've selected a first node.

## Relationship types

Connections use a 15-type taxonomy. Storing a type from one NPC's side automatically reads as its inverse from the other side, so you only ever set it once:

| Type | Inverse |
| --- | --- |
| Family | Family |
| Sibling | Sibling |
| Chosen family | Chosen family |
| Friend | Friend |
| Ally | Ally |
| Rival | Rival |
| Enemy | Enemy |
| Lover | Lover |
| Mentor | Apprentice |
| Apprentice | Mentor |
| Subordinate | Superior |
| Superior | Subordinate |
| Contact | Contact |
| Former Ally | Former Ally |
| Former Enemy | Former Enemy |

The same 15 types are used for both NPC–NPC connections and NPC–party-member connections.

## Factions on the web

Factions are deliberately **not** drawn as nodes: a large guild as a hub would dominate the layout and pull every real relationship out to the rim, and "these two are rivals" is a different kind of fact from "this NPC is in the Harbormasters." Membership shows two other ways instead:

- **Badges on the node**: up to three small faction emblems in the node's upper-right corner (a "+N" for more), fading for memberships that are no longer Active. Hover a badge to see the faction's name and the NPC's role in it; click one to open that faction. On a touch device, the first tap opens the badge and a second tap follows the link.
- **Focus a faction…**: a combobox in the top bar that draws a boundary (a "hull") around that faction's members and dims everyone else, so you can see the faction's footprint across the wider web. Only one faction is focused at a time. While focused, each member is captioned with how they belong ("Leader", "Agent · Expelled"); a plain "Member" gets no caption, since inside the boundary that's the unremarkable case. Members further apart than usual also get a gentle pull toward their faction's centre, so a faction's people end up visibly nearer each other than the graph would otherwise place them.

Faction-to-faction relationships are not shown here: that belongs on the Factions screen, since this view's subject is people.

## Filters and legend

The top bar offers:

| Control | Behaviour |
| --- | --- |
| **Filter nodes…** | Text search by NPC name or disguise name. |
| **Party Members** | Toggle to show/hide party members and their edges. |
| Location combobox | Shows only NPCs at that location (and its descendants). |
| Relationship type select | Narrows the *edges* shown to one connection type. |
| **Focus a faction…** | See above: dims rather than hides. |
| Legend | One swatch per relationship attitude, doubling as a filter: click one to show only NPCs of that attitude, click it again to release. |

A **Clear** button appears in the filter bar once any of these is active. All of these, including the focused faction, persist for the session, so opening an NPC from the graph and coming back doesn't reset your view.

## Side panel

Clicking a node opens a side panel:

- **NPC panel**: portrait, name, occupation, species, relationship and status badges, an **Open Sheet** button, and a list of the NPC's connections. Click a connection row to edit its type and notes inline, or delete it.
- **Party member panel**: portrait, name, a Party Member badge, class/species/level, and an **Open Sheet** button linking to the party member's own page.

## What your players see

Players never see the Relationship Web: it's a DM-only planning surface.

## Tips

> A campaign with no connections recorded yet shows an empty state rather than a blank canvas. Add relationships from any NPC's sheet, or build them straight on the graph with Shift+click, and they'll appear here.

## Related

- [NPC Tracker: Overview](#npc-tracker-overview)
- [NPC Visibility Controls](#npc-visibility-controls)
- [Factions](#factions)
