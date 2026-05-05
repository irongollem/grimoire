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

- **Kanban board** — drag cards between columns to update their status. Columns are Undiscovered, Active, On Hold, Completed, and Failed.
- **List view** — compact table; useful when you have many quests.

Your view preference persists for the session.

## Quest statuses

| Status       | When to use                                  |
| ------------ | -------------------------------------------- |
| Undiscovered | The party doesn't know this quest exists yet |
| Active       | The party is currently pursuing it           |
| On Hold      | Paused — waiting on something                |
| Completed    | Done successfully                            |
| Failed       | Failed or abandoned                          |

## Creating a quest

Click **New Quest** and fill in:

- **Title** — the quest's name (required).
- **Summary** — one or two sentences players see in the portal.
- **Description** — full rich text body with DM notes, backstory, lore.
- **Quest Giver** — link an NPC from your tracker.
- **Primary Location** — the main location associated with this quest.
- **Parent Quest** — if this is a sub-quest, link it to the parent here.
- **Tags** — freeform labels for filtering.

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

## Quest Consequences (Triggers)

Triggers let you automate what happens when a quest milestone is reached. Each trigger has:

**Trigger types:**

- `quest_complete` — fires when the quest status changes to Completed.
- `objective_done` — fires when a specific objective is checked.

**Action types:**

- `create_calendar_event` — automatically adds an event to the campaign calendar with an optional offset in in-game days.
- `send_broadcast` — posts a message to the campaign chat when the trigger fires.

**Fire Once toggle** — prevents the trigger from repeating if the objective is unchecked and re-checked.

Triggers fire automatically when the DM advances the in-world date past the offset deadline, or immediately if no offset is set.

## Scriptorium export

The **Scriptorium** button on a quest detail page formats the quest as a publishable document — useful for printing handouts or generating adventure content.
