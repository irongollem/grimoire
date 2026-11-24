---
title: Factions
section: World Building
section_order: 2
order: 2
summary: Keep the organisations of your world, who belongs to them, how they stand with the party and with each other, and run noble houses with a family line of succession.
keywords: faction, factions, organisation, organization, membership, member, role, relation, connections, guild, government, religion, cult, house, noble house, lineage, succession, heir, seat, descent, party standing, reputation, populate, emblem, crest
---

Factions are the organisations of your world: guilds, governments, cults, criminal networks, mercenary companies, secret societies and noble houses. A faction records who belongs to it, how it regards the party, how it feels about other factions, the places it holds and the gods it prays to. Find the list under **Campaign → Factions** in the sidebar.

## Key ideas

| Term | Meaning |
| --- | --- |
| Faction | An organisation with a type, alignment, emblem, and a roster of NPC and PC members. |
| Party standing | How the faction regards the party, on the same five-step ladder as an NPC's stance: Hostile, Unfriendly, Indifferent, Friendly, Helpful. |
| Connection | A tie from this faction to another faction, a place, a deity, an item or a person: "allied with", "controls", "worships". Each side of a faction-to-faction tie holds its own stance, so your view of them may differ from theirs of you. |
| House | A faction of the type House: a noble or ruling family with a seat, a family tree and a line of succession. |
| Reveal | A faction shared with a player becomes visible to them; a player whose own character has joined a faction sees it automatically regardless of sharing. |

## Creating a faction

Click **New Faction** and fill in:

- **Type**: Guild, Government, Religion, Criminal, Military, Merchant, Secret Society, Cult, Order, Tribe, House or Other, picked from a searchable combobox. Choosing **House** adds the **Descent** and **Seat** fields (see Houses, below).
- **Alignment**: one of the nine D&D alignments (optional but useful for quick reads).
- **Visible to Players**: who this faction is shared with, right in the editor.
- **Party standing**: how the faction feels about the party, set on the same five-segment wheel an NPC's stance uses. It starts unset (unknown); click a segment to choose one.
- **Tags**.
- **Emblem**: upload a square image with focal-point control.
- **Name** and **Description & Notes** (rich text covering history, motives, and activities) on the right.

A faction opens as a read-only sheet. Press **Edit** to change it. Below the sheet sit the **Members**, **Player Members**, **Connections** and **DM notes** sections, which you can use without opening the editor, and a list of everything that mentions the faction. An existing faction's editor also offers **Copy to campaign…**, which duplicates the faction, and its worshipped-deity links, into a different campaign you own.

## Generating a faction with AI

Click **Generate** on the Factions list page to open the Familiar on the right with a faction card. Describe the organisation in **What to make**, then create it; see [AI Generation & Credits](#ai-generation-credits) for how costs are shown, and for what happens if the campaign's AI Assistant is off or your credit balance is short.

## Bulk moving or copying factions

Click **Select** to enter selection mode, tick the factions you want, then use the bar that appears to **Move to campaign** (reassigns ownership) or **Copy to campaign…** (duplicates into another campaign, along with each faction's worshipped-deity links). "Make available in all campaigns" isn't offered for a bulk move, because a general faction can't carry a campaign-scoped deity link with it.

## Party standing

Party standing is where the party stands with the organisation as a whole: the Harpers might be Friendly while the Zhentarim are Hostile. It shows as a coloured mark on the faction's row in the list and on its sheet, and you change it in the editor. It is separate from the faction-to-faction stances in **Connections**, which are how factions regard each other.

A quest can move it for you: give a beat or quest rule the **Shift faction standing** action, either stepping the standing up or down or setting it to a chosen stance, and stepping back with Previous restores it. See [Quest Log](#quest-log).

## NPC membership

In the **Members** section, pick an NPC in **Add NPC…** and press **Add**. Each member has:

- A **role**: Leader, Head of house, Officer, Enforcer, Member, Initiate, Envoy, Patron, Associate, Supplier, Sympathiser, Supplicant, Agent, Informant, Secret member, Infiltrator, Unwitting pawn, Adversary or Unknown. Only one person can be the head (Leader or Head of house) at a time.
- A **status**: Active, Retired, Defected, Expelled or Deceased. Anyone who is not Active moves under **Former Members**, which you can open and close.
- Their own **eye** control, to choose which players know about that membership.

Members appear on the faction's page and on the NPC's own sheet. You can also add a membership from the NPC's Connections block.

## Party member membership

In **Player Members**, pick a character in **Add party member…** and press **Add**. They get their own role and status like an NPC does. When a PC joins a faction, that faction automatically becomes visible to the player who controls that character, even if the faction isn't otherwise shared with them.

## Connections: other factions, places, gods and items

The **Connections** section lists every tie this faction has, grouped by what is on the other end: people, factions, places, deities and items. Each row shows the other thing, the kind of tie as a word you can change in place, and an eye for which players are told.

Press **Add connection**, search for the other thing, and pick what the two are to each other. For two factions the types are Allied, Friendly, Neutral, Suspicious, Rival, Hostile, Secret Ally and Secret Enemy, read in the faction's own words ("allied with", "seen as a rival by"). Each faction holds its own stance, so set both sides if you want the politics to read the same from either page. For places a faction can control, be based in or operate in a place; for deities it can worship, serve or oppose one; for items it can hold or seek them. The `...` menu on a row edits its note and the line players are told, or removes it.

**In the web** opens the [World Web](#world-web) already focused on this faction. If the campaign has AI on, **Suggest** proposes connections for you to accept or dismiss one at a time.

Worship is recorded here too: add the deity as a connection and choose Worships. It then also shows on the deity's own page. See [Pantheon: Gods & Deities](#pantheon-gods-deities).

## Houses

A faction of type **House** is a noble or ruling family. Its editor adds:

- **Descent**: how the house reckons its own, Through either parent, Through the father, Through the mother, or By oath or choice.
- **Seat**: the place in the Atlas the house rules from, or **No seat**.

A House sheet also shows its descent, seat, heir and succession custom, and has an **Overview** and a **Lineage** tab. **Lineage** draws the family tree of the house's members, with the head and seat in its header. Press **Line of succession** to set who inherits: click people in the order they inherit (click a numbered person again to take them out), write the house's **Succession custom** in its box, and press **Done**. The dead keep their place in the line but do not inherit. Members need to be linked as kin for the tree to draw; see [Family trees](#family-trees).

## Populate from Setting

**Populate Setting** (at the top of the Factions list) seeds setting-appropriate factions for your campaign world: it only appears once your campaign's calendar has matching seed data. For Faerûn this includes the Harpers, Zhentarim, Emerald Enclave, and others. The import is idempotent (it deduplicates by name, so re-running is safe) and the factions it seeds don't count against your plan's faction cap.

## Sharing a faction with players

Use the eye on a faction's row (list page), or **Visible to Players** in its editor, to pick which players see it. A player whose character has actually joined the faction sees it regardless of this setting. Once a player can see a faction, they can add their own private notes to it.

## What your players see

Players see a faction on their Player Portal's **Factions** page once it's shared with them, or once their own character joins it: factions they belong to sort to the top with a highlighted border. Opening a faction shows its description, the party's standing with it (once you have set one) and, only for factions the player is a member of, a **Known Members** list: fellow PC members (the player's own character marked "(You)"), and active NPC members, each with their role.

## Tips

- A stance is held by each side: set both if you want the politics to read consistently from either faction's own page.
- A faction with no NPCs, PCs, relations or links is still a valid faction to reveal: the description alone is often enough for players to recognise a name.
- Free plans have a cap on how many factions you can create: see [Billing & Subscription](#billing-subscription).

## Related

- [Atlas: Locations](#atlas-locations)
- [Pantheon: Gods & Deities](#pantheon-gods-deities)
- [Quest Log](#quest-log)
- [Billing & Subscription](#billing-subscription)
