---
title: Campaign Notes
section: Running the Table
section_order: 1
order: 2
summary: Free-form notes for session recaps, lore, and secrets: pin them, tag them, and share exactly the ones your players should see.
keywords: notes, campaign notes, mention, mentioned in, backlinks, session log, lore, secrets, pin, tags, share, chronicler, session recap
---

Campaign Notes is your free-form space for anything that doesn't have a dedicated home elsewhere: session recaps, lore you haven't turned into a Quest or Faction yet, secrets you're not ready to reveal, or planning scratch-space. Find it under **Campaign → Notes** in the sidebar (`/notes`).

## Key ideas

| Term | Meaning |
| --- | --- |
| Category | One of **General**, **Session**, **Lore**, **Location**, **Quest**, **Faction**: sets the icon/color and, for Session notes, unlocks the **Session** picker and the session-date fields. |
| Pinned | A note floats to the top of the list regardless of sort order. |
| Shared with players | A note is DM-only until you explicitly add players to it, see below. Sharing is per player, not an all-or-nothing toggle. |
| Manual order | A sort mode that lets you drag notes into whatever order you like, distinct from sorting by date or title. |

## Creating a note

1. Click **New Note**. Free plans have a note quota; the button shows a paywall prompt once you hit it.
2. Give it a **Title**, pick a **Category**, and write the body in the rich-text editor (headings, lists, bold: the usual formatting tools).
3. If the category is **Session**, a **Session** picker appears so you can say which session the note is about. It lists sessions that have no note yet first, with their dates, and **+ A session that is not in the log yet** adds one on the spot. A session-dates panel also appears for the in-game start/end date and a real-world date, filled in from the last session you played.
4. Add **Tags** freely to make the note easier to find later.
5. Click **Pin note** (the pin icon) to keep it at the top of your list.

## Mentioning people and places

Type **@** in a note's body to mention a party member, NPC, monster, location or faction. The mention becomes a chip that opens that page. The same works in NPC lore, location and faction descriptions, quest beat text and your party's character descriptions.

It also works in the other direction: each NPC, location, faction, party member or monster lists everything that mentions it under **Mentioned in**, so you can see every session a character has turned up in and every place their name comes up.

Mentions are safe to share. When players read a note you've shared, each mention shows the name *they* know: a disguised NPC appears under their disguise, and anyone whose name you haven't revealed, or a monster they haven't met, appears as **???**. Their real name never reaches the player's screen.

## Finding a note

- **Search notes…** filters by title and content.
- Filter by category using the chips: **All / General / Session / Lore / Location / Quest / Faction**.
- Sort with the **Created / Updated / Title A–Z / Manual** control. Pinned notes float to the top no matter which sort you pick.
- In **Manual** sort, drag notes by their handle to set your own order.

## Sharing a note with players

Notes are DM-only by default, but you can share one with specific players:

1. Open the note (or its detail sheet from the list) and use the sharing control next to the pin icon: it shows **Hidden** when nobody can see the note, or a count like **3 players** once you've shared it.
2. Pick which party members should see it. This is a per-player list, not a single visibility switch, so you can share a note with only the players whose characters would plausibly know it.
3. Saving (or changing sharing from the note's detail view, which writes immediately) sends a notification to any player **newly** added to the share list, not to players who already had access.

## Writing with the AI Chronicler

From a note's toolbar you can reach two AI tools, available on every plan once the campaign's AI Assistant is switched on:

- **Write Chronicle**: paste in raw session facts (supports `@mentions` of your NPCs and locations), pick a tone, and it drafts prose you can review and **Insert into Note** before it touches your note. If the draft names a session that is in your log, the note is linked to it.
- **Generate scene illustration**: describe a scene (again with `@mentions` to pull in existing character art), pick an image shape, and generate an illustration for the note. Each shape shows its own cost before you generate.
- **Scene library**: browse illustrations you've already generated for this campaign instead of generating a new one.

AI costs are not a fixed number quoted here: the tool shows you the price for what you're about to generate before you confirm it.

## What your players see

Shared notes appear on the **DM Notes** tab of their own Journal, with the empty state "No notes shared by your DM yet." if you haven't shared anything with them. They see the same content you wrote (title, tags, the session it belongs to, and full formatted text) but only for notes you've specifically shared with their character. A note you haven't shared, or have only shared with someone else's character, never appears there.

## Tips

> A downtime draw can create a note automatically as one of its possible outcomes: check [The Interlude: Downtime](#the-interlude-downtime) if a note appears that you don't remember writing.

- Sharing is deliberate and per-player: there's no "share with the whole party" shortcut beyond selecting every player.
- Use **Session** category notes for recaps and link each one to its session: the Sessions log and the dashboard's Sessions widget find a session's recap through that link, and flag sessions that have none. You can also start a recap from the session's own page with **Write the notes**.

## Related

- [Dashboard](#dashboard): the Pinned notes widget reads straight from here, and the Sessions widget points back into your session notes.
- [Running a Session](#running-a-session): the Sessions log, and Session-category notes and the recap habit.
- [Calendar System](#calendar-system): how a note's in-game session dates link to a calendar event.
- [Player Portal: Overview](#player-portal-overview): where shared notes surface for your players.

## Keeping a passage back with DM only

Some notes are worth sharing except for one paragraph. Select the text (or put the cursor in it) and click the **DM only** button in the editor toolbar, the crossed-out eye, or press Ctrl+Alt+S (Cmd+Option+S on a Mac). The passage gets a dashed frame and a small label so you can see what is set apart. Click the button again to take it back out.

Players never receive a DM-only passage. It is not hidden on their screen, it is left out before the note reaches them, so there is nothing for them to find. You see it everywhere you read the text yourself.

The button is on every field you can share with players: notes, location and faction descriptions, item descriptions, an item's written contents, and puzzle descriptions. It is not on handouts, NPC lore, puzzle hints or solutions, which have their own rules for what players see.
