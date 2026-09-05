---
title: Quest Log
section: World Building
section_order: 3
order: 1
summary: Track and manage quests with Kanban or list view, objectives, rewards, and consequences.
keywords: quest, quests, kanban, objectives, reward, trigger, consequence, sub-quest, player visibility
---

## Quest views

The Quest Log supports two views, togglable from the toolbar:

- **Kanban board** — drag cards between columns to update their status. Columns flow left to right: Undiscovered → Rumor → Active → Completed / Failed.
- **List view** — compact table; useful when you have many quests.

Your view preference persists for the session.

## Quest statuses

| Status       | When to use                                        |
| ------------ | -------------------------------------------------- |
| Undiscovered | The DM has noted it but the party has no knowledge |
| Rumor        | The party has heard whispers but hasn't taken it   |
| Active       | The party is currently pursuing it                 |
| Completed    | Done successfully                                  |
| Failed       | Failed or abandoned                                |

## Creating a quest

Click **New Quest** and fill in:

- **Title** — the quest's name (required).
- **Summary** — one or two sentences players see in the portal; this is the quest's premise, and it stays editable from the Overview tab afterward.
- **Quest Giver** — link an NPC from your tracker.
- **Primary Location** — the main location associated with this quest.
- **Parent Quest** — if this is a sub-quest, link it to the parent here.
- **Tags** — freeform labels for filtering.

Once the quest exists, open its **Overview** tab and write the **opening beat** — the DM-facing narrative, backstory and lore that used to live in a Description field here. It's an ordinary beat, authored the same way as any other, and you connect it to whatever comes next from **Story Flow**.

## Objectives

Add **Objectives** to break the quest into trackable steps. Each objective has:

- **Description** — what needs to be done.
- **Visible to players** toggle — hide objectives until you're ready to reveal them.
- **Checkbox** — mark it done during play without leaving the sheet.

## Rewards

The Rewards section lets you track what the party earns:

- **Currency** — the five-coin grid (PP/GP/EP/SP/CP).
- **Items** — link vault items with quantities.
- **Art Objects** — named art objects with a GP value and optional image.
- **Notes** — freeform text for non-standard rewards.

The **Drop to Chat** button sends the reward currency as a claimable chat message — players claim their shares directly from the chat.

## References

The **References** section links supporting entities: NPCs, locations, monsters, and encounters. Each reference has its own **player visibility toggle** — you control exactly what supporting cast the party can see.

## Player visibility

The whole quest is hidden from players until you set `visible_to` for at least one player (or all players). Players can only see objectives, references, and the map pin for a quest if those individual toggles are also enabled.

## Player notes

Players can add their own **notes** to any quest visible to them. There are two types:

- **Party notes** — shared with the full party.
- **Personal notes** — private to the individual player.

## Quest Consequences

Consequences let you automate what happens when something in a quest becomes true — one mechanism covers both the story flow and the objective checklist. Each consequence has a **condition**, an optional **delay**, and an **action**.

**Conditions** — exactly one:

- On a beat (in Story Flow) — fires the moment the party arrives, or the moment they take a specific branch out of it.
- On the quest overview — fires when a named objective becomes Open, Completed or Failed, or when the whole objective ledger settles (nothing left open).

**Actions:**

- **Raise / Reveal to players / Complete / Fail** — moves another objective. Raise wakes a not-yet-raised objective; Reveal also makes it visible to players.
- **Create calendar event** — adds an event to the campaign calendar.
- **Send broadcast** — posts a message to the campaign chat.

**Delay** — an optional number of in-world days between the condition firing and the action happening. Zero fires immediately; a calendar event or broadcast with a delay fires the moment you advance the in-world date past its target, wherever in the app you change that date.

## Scriptorium export

The **Scriptorium** button on a quest detail page formats the quest as a publishable document — useful for printing handouts or generating adventure content.
